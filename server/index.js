const path = require('path');
const { createServer } = require('http');
const express = require('express');
const { initIO } = require('./socket');

const app = express();
app.use('/', express.static(path.join(__dirname, 'static')));

const httpServer = createServer(app);
let port = process.env.PORT || 3500;

initIO(httpServer);
httpServer.listen(port, '0.0.0.0', () => {
  console.log("Server started on ", port);
});