import React, { useEffect, useState, useRef } from 'react';
import {
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
} from 'react-native';
import SocketIOClient from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCView,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';

// --- IMPORT YOUR ENV VARIABLE HERE ---
import { API_URL } from '@env';

// Components
import TextInputContainer from './src/components/TextInputContainer';
import IconContainer from './src/components/IconContainer';

export default function App() {
  const [type, setType] = useState('JOIN');
  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString(),
  );

  const [otherUserId, setOtherUserId] = useState('');
  const [localStream, setlocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const socket = useRef(null);
  const peerConnection = useRef(null);
  const remoteRTCMessage = useRef(null);
  const iceCandidatesQueue = useRef([]);

  const otherUserIdRef = useRef('');

  useEffect(() => {
    otherUserIdRef.current = otherUserId;
  }, [otherUserId]);

  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        return (
          granted['android.permission.CAMERA'] === 'granted' &&
          granted['android.permission.RECORD_AUDIO'] === 'granted'
        );
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  /**
   * REFACTORED: setupPeerConnection now ensures tracks
   * are added correctly every time it's called.
   */
  const setupPeerConnection = stream => {
    // Close existing connection if any
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add current stream tracks to the NEW peerConnection
    if (stream) {
      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream);
      });
    }

    peerConnection.current.ontrack = event => {
      console.log('Track event triggered');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    peerConnection.current.onicecandidate = event => {
      if (event.candidate && socket.current) {
        socket.current.emit('ICEcandidate', {
          calleeId: otherUserIdRef.current,
          rtcMessage: {
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
          },
        });
      }
    };

    // Monitor connection state for debugging
    peerConnection.current.onconnectionstatechange = () => {
      console.log('Connection State:', peerConnection.current.connectionState);
    };
  };

  const processIceCandidatesQueue = () => {
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      peerConnection.current
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch(e => console.log('Queued ICE Error', e));
    }
  };

  const startLocalStream = async () => {
    const hasPermission = await checkPermissions();
    if (hasPermission) {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: 'user',
            width: 640,
            height: 480,
          },
        });
        setlocalStream(stream);
        setupPeerConnection(stream);
      } catch (err) {
        console.error('Media Error:', err);
      }
    }
  };

  useEffect(() => {
    socket.current = SocketIOClient(API_URL, {
      transports: ['websocket'],
      query: { callerId },
    });

    socket.current.on('newCall', data => {
      remoteRTCMessage.current = data.rtcMessage;
      setOtherUserId(data.callerId);
      setType('INCOMING_CALL');
    });

    socket.current.on('callAnswered', async data => {
      remoteRTCMessage.current = data.rtcMessage;
      // Ensure we have a valid remote description before processing ICE
      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(remoteRTCMessage.current),
      );
      processIceCandidatesQueue();
      setType('WEBRTC_ROOM');
    });

    socket.current.on('ICEcandidate', data => {
      let message = data.rtcMessage;
      if (message && message.candidate) {
        const candidateObj = {
          candidate: message.candidate,
          sdpMLineIndex: message.label,
          sdpMid: message.id,
        };

        if (peerConnection.current?.remoteDescription) {
          peerConnection.current
            .addIceCandidate(new RTCIceCandidate(candidateObj))
            .catch(e => console.log('ICE Error', e));
        } else {
          iceCandidatesQueue.current.push(candidateObj);
        }
      }
    });

    socket.current.on('remoteHangup', () => {
      leaveLocal();
    });

    startLocalStream();

    return () => {
      if (socket.current) socket.current.disconnect();
      if (peerConnection.current) peerConnection.current.close();
    };
  }, []);

  async function processCall() {
    // Fresh setup before every new call attempt
    setupPeerConnection(localStream);

    const sessionDescription = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(sessionDescription);
    socket.current.emit('call', {
      calleeId: otherUserId,
      rtcMessage: sessionDescription,
    });
  }

  async function processAccept() {
    InCallManager.start({ media: 'video' });

    // Fresh setup before accepting
    setupPeerConnection(localStream);

    await peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage.current),
    );
    processIceCandidatesQueue();

    const sessionDescription = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(sessionDescription);
    socket.current.emit('answerCall', {
      callerId: otherUserId,
      rtcMessage: sessionDescription,
    });
  }

  function leaveLocal() {
    InCallManager.stop();
    setType('JOIN');
    setRemoteStream(null);
    iceCandidatesQueue.current = [];

    // Completely reset the connection
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Prepare for next call by re-binding the stream
    setupPeerConnection(localStream);
  }

  function leave() {
    socket.current.emit('endCall', { to: otherUserIdRef.current });
    leaveLocal();
  }

  // --- UI Screens ---

  const JoinScreen = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        flex: 1,
        backgroundColor: '#050A0E',
        justifyContent: 'center',
        paddingHorizontal: 42,
      }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View>
          <View
            style={{
              padding: 35,
              backgroundColor: '#1A1C22',
              alignItems: 'center',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#2B3034',
            }}
          >
            <Text style={{ color: '#D0D4DD', fontSize: 16 }}>
              Your Caller ID
            </Text>
            <Text
              style={{
                fontSize: 32,
                color: '#ffff',
                letterSpacing: 6,
                fontWeight: 'bold',
                marginTop: 10,
              }}
            >
              {callerId}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: '#1A1C22',
              padding: 40,
              marginTop: 25,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#2B3034',
            }}
          >
            <TextInputContainer
              placeholder={'Enter Target ID'}
              value={otherUserId}
              setValue={setOtherUserId}
              keyboardType={'number-pad'}
            />
            <TouchableOpacity
              onPress={() => {
                processCall();
                setType('OUTGOING_CALL');
              }}
              style={{
                height: 50,
                backgroundColor: '#5568FE',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 12,
                marginTop: 10,
              }}
            >
              <Text
                style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }}
              >
                Call Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );

  const IncomingCallScreen = () => (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: '#050A0E',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 28,
          color: '#ffff',
          textAlign: 'center',
          marginBottom: 50,
        }}
      >
        {otherUserId} is calling..
      </Text>
      <TouchableOpacity
        onPress={() => {
          processAccept();
          setType('WEBRTC_ROOM');
        }}
        style={{
          backgroundColor: '#2ecc71',
          borderRadius: 50,
          height: 90,
          width: 90,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 40 }}>📞</Text>
      </TouchableOpacity>
    </View>
  );

  const OutgoingCallScreen = () => (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: '#050A0E',
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 28,
          color: '#ffff',
          textAlign: 'center',
          marginBottom: 50,
        }}
      >
        Calling {otherUserId}...
      </Text>
      <TouchableOpacity
        onPress={leave}
        style={{
          backgroundColor: '#FF5D5D',
          borderRadius: 50,
          height: 90,
          width: 90,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 40 }}>🚫</Text>
      </TouchableOpacity>
    </View>
  );

  const WebrtcRoomScreen = () => (
    <View style={{ flex: 1, backgroundColor: '#050A0E' }}>
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={{ flex: 1 }}
          objectFit="cover"
        />
      ) : (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: 'white' }}>Connecting...</Text>
        </View>
      )}
      {localStream && (
        <View
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            width: 120,
            height: 180,
            borderRadius: 15,
            overflow: 'hidden',
            borderWidth: 2,
            borderColor: '#5568FE',
          }}
        >
          <RTCView
            streamURL={localStream.toURL()}
            style={{ flex: 1 }}
            objectFit="cover"
            zOrder={1}
          />
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          paddingVertical: 30,
          backgroundColor: 'rgba(0,0,0,0.5)',
          position: 'absolute',
          bottom: 0,
          width: '100%',
        }}
      >
        <IconContainer
          backgroundColor="#FF5D5D"
          onPress={leave}
          Icon={() => <Text style={{ fontSize: 25 }}>📞</Text>}
        />
        <IconContainer
          backgroundColor="#5568FE"
          onPress={() => {
            if (localStream) {
              localStream
                .getVideoTracks()
                .forEach(track => track._switchCamera());
            }
          }}
          Icon={() => <Text style={{ fontSize: 25 }}>🔄</Text>}
        />
      </View>
    </View>
  );

  switch (type) {
    case 'JOIN':
      return JoinScreen();
    case 'INCOMING_CALL':
      return IncomingCallScreen();
    case 'OUTGOING_CALL':
      return OutgoingCallScreen();
    case 'WEBRTC_ROOM':
      return WebrtcRoomScreen();
    default:
      return null;
  }
}
