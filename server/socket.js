const { Server } = require('socket.io');
let IO;

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
      let calleeId = data.calleeId;
      let rtcMessage = data.rtcMessage;
      socket.to(calleeId).emit('newCall', {
        callerId: socket.user,
        rtcMessage: rtcMessage,
      });
    });

    socket.on('answerCall', data => {
      let callerId = data.callerId;
      let rtcMessage = data.rtcMessage;
      socket.to(callerId).emit('callAnswered', {
        callee: socket.user,
        rtcMessage: rtcMessage,
      });
    });

    socket.on('ICEcandidate', data => {
      let calleeId = data.calleeId;
      let rtcMessage = data.rtcMessage;
      socket.to(calleeId).emit('ICEcandidate', {
        sender: socket.user,
        rtcMessage: rtcMessage,
      });
    });

    socket.on('endCall', data => {
      let targetId = data.to;
      socket.to(targetId).emit('remoteHangup');
    });

    // ✅ CORRECT POSITION: Inside the connection block
    socket.on('cameraSwitch', data => {
      let targetId = data.to;
      socket.to(targetId).emit('cameraSwitch', {
        isFrontCamera: data.isFrontCamera,
      });
    });
  }); // ← connection block closes HERE
};

module.exports.getIO = () => {
  if (!IO) {
    throw Error('IO not initialized.');
  } else {
    return IO;
  }
};
