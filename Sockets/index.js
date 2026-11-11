const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../Config/env");
const { initSocket } = require("../Utils/socket");

const setupSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (
          config.CORS_ORIGINS.includes(origin) ||
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    },
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on("join-group", (groupId) => {
      if (groupId) {
        socket.join(`group:${groupId}`);
      }
    });

    socket.on("leave-group", (groupId) => {
      if (groupId) {
        socket.leave(`group:${groupId}`);
      }
    });

    socket.on("disconnect", () => {
      // client disconnected
    });
  });

  initSocket(io);
  return io;
};

module.exports = setupSockets;
