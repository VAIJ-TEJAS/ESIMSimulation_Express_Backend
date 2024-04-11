import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { ExpressPeerServer } from "peer";
import fs from 'fs';
import https from "https"
import cors from "cors";

// App for Socket.IO
const app = express();
const server = createServer(app);

// Specify the paths to your SSL certificate and private key
const privateKey = fs.readFileSync('private.key', 'utf8');
const certificate = fs.readFileSync('certificate.crt', 'utf8');
const ca = fs.readFileSync('ca_bundle.crt', 'utf8');

const credentials = { key: privateKey, cert: certificate, ca: ca };

// Create an HTTPS server
const httpsServer = https.createServer(credentials, app);

const io = new Server(httpsServer, {
  cors: {
    origin: "*",
  },
});

// Separate app for PeerJS
const peerApp = express();
const peerServer = https.createServer(credentials, peerApp);
const peerPort = 9000; // Different port for PeerJS

// PeerJS server
const peerExpressServer = ExpressPeerServer(peerServer, {
  debug: true,
  path: "/", // Default path
});

peerApp.use("/peerjs", peerExpressServer);

// CORS middleware
app.use(cors());

app.get('/.well-known/pki-validation/FC86BE2EB996E27F19FD2C979F8C9A56.txt', (req, res) => {
  // Assuming your text file is named 'example.txt' in the root directory
  const filePath = 'FC86BE2EB996E27F19FD2C979F8C9A56.txt';

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
    } else {
      res.send(data);
    }
  });
});

// Socket.IO server
let users = {}; // Store users with their socket IDs

io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);

  socket.on("new-user", (userId) => {
    users[socket.id] = { id: userId };
    io.to(getSocketId(userId)).emit("auth", { message: "Please login or register." });
    console.log(users);
  });

  socket.on("login-signup", ({ username }) => {
    // Check if username is already in use
    console.log(username);
    const existingUserKey = Object.keys(users).find(key => users[key].username === username);

    console.log("Existing users", existingUserKey)
    
    if (existingUserKey) {
      // Inform the existing user about the disconnection
      io.to(existingUserKey).emit("disconnected", { message: "You have been logged out because you logged in from another device." });
      // Disconnect the existing socket
      io.sockets.sockets.get(existingUserKey).disconnect(true);
      // Remove the existing user from users object
      delete users[existingUserKey];
    }
    
    // Assign the new username to the current socket
    if (users[socket.id]) {
      users[socket.id].username = username;
      // Acknowledge new login
      socket.emit("login-success", { message: "Login successful", username });
      io.emit("all-users", users);
    }
  });

  socket.on("call-user", ({ userToCall, from }) => {
    io.to(getSocketId(userToCall)).emit("call-made", {
      from,
      signal: userToCall.signal,
    });
  });

  socket.on("accept-call", (data) => {
    io.to(getSocketId(data.to)).emit("call-accepted", {
      from: socket.id,
    });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("all-users", users);
  });

  function getSocketId(userId) {
    return Object.keys(users).find((key) => users[key]['id'] === userId);
  }
});

const PORT = process.env.PORT || 443;

httpsServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket.IO Server running on port ${PORT}`);
});

peerServer.listen(peerPort, "0.0.0.0", () => {
  console.log(`PeerJS Server running on port ${peerPort}`);
});
