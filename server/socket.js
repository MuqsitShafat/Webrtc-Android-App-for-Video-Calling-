const {Server} = require('socket.io');
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

    // ✅ Forward ALL call data to receiver
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

    // ✅ endCall works at ANY stage — before or during call
    socket.on('endCall', data => {
      socket.to(data.to).emit('remoteHangup');
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
  });
};

module.exports.getIO = () => {
  if (!IO) {
    throw Error('IO not initialized.');
  } else {
    return IO;
  }
};