let io = null;

const initSocket = (socketIoInstance) => {
  io = socketIoInstance;
};

const emitGroupActivity = (groupId, eventName, payload) => {
  if (io && groupId) {
    io.to(`group:${groupId}`).emit(eventName, {
      ...payload,
      timestamp: new Date().toISOString(),
    });
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
  emitGroupActivity,
  emitUserEvent,
};
