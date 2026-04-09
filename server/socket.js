const {Server} = require('socket.io');
let IO;

// 🚀 Helper to securely send Push Notifications for EVERYTHING
const sendPush = (token, title, body, dataPayload = {}) => {
  if (!token) return;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined,
        })
      });
    }

    // 🔴 CRITICAL: Embed notification text inside "data" rather than "notification". 
    // This allows the React Native app to run a background action (double tick) before showing the alert.
    // FCM `data` objects can ONLY contain strings!
    const combinedData = {
      ...dataPayload,
      notificationTitle: String(title || ''),
      notificationBody: String(body || '')
    };

    const payload = {
      token: token,
      data: combinedData, // DATA-ONLY PAYLOAD
      android: { priority: 'high' }
    };

    admin.messaging().send(payload)
      .then(response => console.log('Successfully sent data-only notification:', title))
      .catch(error => console.log('Error sending data-only notification:', error));
  } catch (err) {
    console.log('Firebase-admin error:', err.message);
  }
};

module.exports.initIO = httpServer => {
  IO = new Server(httpServer);

  IO.use((socket, next) => {
    if (socket.handshake.query) {
      let callerId = socket.handshake.query.callerId;
      socket.user = callerId;
      next();
    }
  });

  IO.on('connection', socket => {
    console.log(socket.user, 'Connected');
    socket.join(socket.user);

    socket.on('call', data => {
      socket.to(data.calleeId).emit('newCall', {
        callerId: data.callerId,
        callerName: data.callerName,
        callerPic: data.callerPic,
        receiverId: data.receiverId,
        receiverName: data.receiverName,
        receiverPic: data.receiverPic,
        rtcMessage: data.rtcMessage,
      });

      // 🚀 Incoming Call Push Notification
      if (data.token) {
        sendPush(data.token, "Incoming Audio Call", `${data.callerName} is calling you...`, {
          friendId: String(data.callerId || ''),
          friendName: String(data.callerName || '')
        });
      }
    });

    socket.on('answerCall', data => {
      socket.to(data.callerId).emit('callAnswered', {
        callee: socket.user,
        rtcMessage: data.rtcMessage,
      });
    });

    socket.on('ICEcandidate', data => {
      socket.to(data.calleeId).emit('ICEcandidate', {
        sender: socket.user,
        rtcMessage: data.rtcMessage,
      });
    });

    socket.on('endCall', data => {
      socket.to(data.to).emit('remoteHangup');

      // 🚀 Missed Call Push Notification
      if (data.token && data.missed) {
        sendPush(data.token, "Missed Audio Call", `You missed a call from ${data.callerName}`, {
          friendId: String(data.callerId || ''),
          friendName: String(data.callerName || '')
        });
      }
    });

    socket.on('cameraSwitch', data => {
      socket.to(data.to).emit('cameraSwitch', {
        isFrontCamera: data.isFrontCamera,
      });
    });

    socket.on('videoToggle', data => {
      socket.to(data.to).emit('videoToggle', {
        isVideoOn: data.isVideoOn,
      });
    });

    socket.on('videoToggleResponse', data => {
      socket.to(data.to).emit('videoToggleResponse', {
        accepted: data.accepted,
      });
    });

    // 🚀 Text Message Push Notification
    socket.on('sendNotification', data => {
      if (data.token) {
        // Pass the Message/Chat IDs into the data chunk to perform the background Firestore update.
        sendPush(data.token, data.title, data.body, { 
          friendId: String(data.senderId || ''), 
          friendName: String(data.title || ''), 
          chatId: String(data.chatId || ''), 
          msgId: String(data.msgId || '') 
        });
      }
    });

  });
};

module.exports.getIO = () => {
  if (!IO) {
    throw Error('IO not initialized.');
  } else {
    return IO;
  }
};
