const {Server} = require('socket.io');
let IO;

// 🚀 Helper to securely send Push Notifications for EVERYTHING
const sendPush = (token, title, body) => {
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

    const payload = {
      token: token,
      notification: { title, body },
      android: { priority: 'high' }
    };

    admin.messaging().send(payload)
      .then(response => console.log('Successfully sent notification:', title))
      .catch(error => console.log('Error sending notification:', error));
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
        sendPush(data.token, "Incoming Audio Call", `${data.callerName} is calling you...`);
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
        sendPush(data.token, "Missed Audio Call", `You missed a call from ${data.callerName}`);
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
        sendPush(data.token, data.title, data.body);
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
