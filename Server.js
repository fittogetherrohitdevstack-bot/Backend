const http = require("http");
const mongoose = require("mongoose");
const config = require("./Config/env");
const connectToDb = require("./Config/db");
const app = require("./App");
const setupSockets = require("./Sockets");
const { startReminderCron, stopReminderCron } = require("./Utils/reminderScheduler");

const PORT = config.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.IO
setupSockets(server);

let isShuttingDown = false;

const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n🛑 Gracefully shutting down server...");

  stopReminderCron();

  try {
    server.close(() => {
      console.log("✅ HTTP & Socket server closed");
    });

    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("✅ MongoDB connection closed");
    }
  } catch (err) {
    console.error("❌ Shutdown error:", err);
  }

  setTimeout(() => {
    console.log("⚠️ Force shutdown");
    process.exit(1);
  }, 5000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (process.env.NODE_ENV !== "test") {
  connectToDb()
    .then(() => {
      server.listen(PORT, () => {
        console.log(`🚀 FitTogether Server running on port ${PORT} [${config.NODE_ENV}]`);
        startReminderCron();
      });
    })
    .catch((err) => {
      console.error("DB connection error:", err);
      process.exit(1);
    });
}

module.exports = server;
