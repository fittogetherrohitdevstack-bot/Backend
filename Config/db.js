const dns = require("dns");
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
    // Windows/local resolvers sometimes refuse SRV queries (127.0.0.1); retry once with public DNS
    if (/querySrv|ECONNREFUSED|EREFUSED/i.test(error?.message || "")) {
      try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
        const conn = await mongoose.connect(config.MONGODB_URI, {
          autoIndex: true,
        });
        console.log(`✅ MongoDB Connected (public DNS fallback): ${conn.connection.host} / ${conn.connection.name}`);
        return conn;
      } catch (retryError) {
        console.error("❌ MongoDB connection error:", retryError.message);
        if (process.env.NODE_ENV !== "test") {
          process.exit(1);
        }
        throw retryError;
      }
    }

    console.error("❌ MongoDB connection error:", error.message);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectToDb;
