let io = null;

const initSocket = (socketIoInstance) => {
  io = socketIoInstance;
};

const getIO = () => io;

const emitGroupActivity = (groupId, eventName, payload) => {
  if (io && groupId) {
    io.to(`group:${groupId}`).emit(eventName, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
};

const emitSquadChat = (groupId, eventName, payload) => {
  if (io && groupId) {
    io.to(`squad:${groupId}`).emit(eventName, payload);
    // Also emit to legacy room for backward compatibility if any listener uses group:
    io.to(`group:${groupId}`).emit(eventName, payload);
  }
};

const emitUserEvent = (userId, eventName, payload) => {
  if (io && userId) {
    io.to(`user:${userId}`).emit(eventName, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  initSocket,
  getIO,
  emitGroupActivity,
  emitSquadChat,
  emitUserEvent,
};
