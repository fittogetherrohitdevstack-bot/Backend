const mongoose = require("mongoose");
const config = require("./env");

const connectToDb = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      autoIndex: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectToDb;
