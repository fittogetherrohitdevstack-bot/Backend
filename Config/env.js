const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const requiredVars = [
  { key: "MONGODB_URI", fallbackKeys: ["Mongoose_uri"] },
  { key: "JWT_ACCESS_SECRET", fallbackKeys: ["ACCESS_SECRET", "JWT_SECRET"] },
  { key: "JWT_REFRESH_SECRET", fallbackKeys: ["REFRESH_SECRET"] },
];

const missing = [];
const config = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || process.env.Frontend_Url || "http://localhost:5173",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || process.env.Frontend_Url || "http://localhost:5173,http://localhost:3000")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean),
  MONGODB_URI: "",
  JWT_ACCESS_SECRET: "",
  JWT_REFRESH_SECRET: "",
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  CRON_SECRET: (process.env.CRON_SECRET || "").trim(),
  VAPID_PUBLIC_KEY: (process.env.VAPID_PUBLIC_KEY || "").trim(),
  VAPID_PRIVATE_KEY: (process.env.VAPID_PRIVATE_KEY || "").trim(),
  VAPID_SUBJECT: (process.env.VAPID_SUBJECT || "mailto:support@fittogether.app").trim(),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
};

for (const item of requiredVars) {
  let val = process.env[item.key];
  if (!val && item.fallbackKeys) {
    for (const fb of item.fallbackKeys) {
      if (process.env[fb]) {
        val = process.env[fb];
        break;
      }
    }
  }
  if (!val) {
    missing.push(item.key);
  } else {
    config[item.key] = val.trim().replace(/^["']|["']$/g, "");
  }
}

if (missing.length > 0) {
  console.error("FATAL ERROR: Missing required environment variables:");
  missing.forEach((v) => console.error(`  - ${v}`));
  console.error("Please configure backend/.env before running the application.");
  if (process.env.NODE_ENV !== "test") {
    process.exit(1);
  }
}

module.exports = config;
