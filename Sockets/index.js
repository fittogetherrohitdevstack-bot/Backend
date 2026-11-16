const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const config = require("../Config/env");
const { initSocket } = require("../Utils/socket");

// In-memory mapping of squadId -> Map<userId, Set<socketId>> for active chat participants
const activeSquadChats = new Map();

/**
 * Check if a user is currently actively viewing a squad's chat room
 */
const isUserActiveInSquadChat = (squadId, userId) => {
  if (!squadId || !userId) return false;
  const room = activeSquadChats.get(String(squadId));
  if (!room) return false;
  return room.has(String(userId));
};

const getOnlineSquadMembers = (squadId) => {
  const room = activeSquadChats.get(String(squadId));
  if (!room) return [];
  return Array.from(room.keys());
};

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
    const userId = socket.user?.id ? String(socket.user.id) : null;
    const joinedSquads = new Set();

    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Existing group activity room
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

    // --- Dedicated Real-Time Squad Chat Handlers ---
    socket.on("squad:join_chat", (payload) => {
      const squadId = String(typeof payload === "object" ? payload.squadId : payload);
      if (!squadId || !userId) return;

      socket.join(`squad:${squadId}`);
      joinedSquads.add(squadId);

      if (!activeSquadChats.has(squadId)) {
        activeSquadChats.set(squadId, new Map());
      }
      const room = activeSquadChats.get(squadId);
      if (!room.has(userId)) {
        room.set(userId, new Set());
      }
      room.get(userId).add(socket.id);

      // Broadcast current online members in this squad chat
      io.to(`squad:${squadId}`).emit("squad:online_members", {
        squadId,
        onlineUserIds: Array.from(room.keys()),
      });
    });

    socket.on("squad:leave_chat", (payload) => {
      const squadId = String(typeof payload === "object" ? payload.squadId : payload);
      if (!squadId || !userId) return;

      socket.leave(`squad:${squadId}`);
      joinedSquads.delete(squadId);

      const room = activeSquadChats.get(squadId);
      if (room && room.has(userId)) {
        const userSockets = room.get(userId);
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          room.delete(userId);
        }
        if (room.size === 0) {
          activeSquadChats.delete(squadId);
        }
      }

      io.to(`squad:${squadId}`).emit("squad:online_members", {
        squadId,
        onlineUserIds: getOnlineSquadMembers(squadId),
      });
    });

    socket.on("typing:start", (payload) => {
      const squadId = String(payload?.squadId || "");
      if (!squadId || !userId) return;

      socket.to(`squad:${squadId}`).emit("typing:user_typing", {
        squadId,
        userId,
        userName: payload?.userName || "Squadmate",
      });
    });

    socket.on("typing:stop", (payload) => {
      const squadId = String(payload?.squadId || "");
      if (!squadId || !userId) return;

      socket.to(`squad:${squadId}`).emit("typing:user_stopped", {
        squadId,
        userId,
      });
    });

    socket.on("disconnect", () => {
      if (!userId) return;

      for (const squadId of joinedSquads) {
        const room = activeSquadChats.get(squadId);
        if (room && room.has(userId)) {
          const userSockets = room.get(userId);
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            room.delete(userId);
          }
          if (room.size === 0) {
            activeSquadChats.delete(squadId);
          }

          io.to(`squad:${squadId}`).emit("squad:online_members", {
            squadId,
            onlineUserIds: getOnlineSquadMembers(squadId),
          });
        }
      }
      joinedSquads.clear();
    });
  });

  initSocket(io);
  return io;
};

module.exports = setupSockets;
module.exports.isUserActiveInSquadChat = isUserActiveInSquadChat;
module.exports.getOnlineSquadMembers = getOnlineSquadMembers;
