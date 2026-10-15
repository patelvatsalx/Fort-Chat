const express = require('express');
const path = require('path');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = require('http').createServer(app);
const peerServer = ExpressPeerServer(server, { debug: false });

app.use('/peerjs', peerServer);
app.get('/', (_request, response) => response.sendFile(path.join(__dirname, 'index.html')));
['styles.css', 'script.js'].forEach(file => {
  app.get(`/${file}`, (_request, response) => response.sendFile(path.join(__dirname, file)));
});

const port = Number(process.env.PORT) || 5500;
server.listen(port, () => {
  console.log(`Kindred is ready at http://localhost:${port}`);
});
