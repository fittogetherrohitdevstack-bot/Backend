const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");
const config = require("./Config/env");
const errorHandler = require("./Middleware/errorHandler");

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
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
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

if (config.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else if (config.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount API Routes
app.use("/api", require("./Routes"));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API Route not found" });
});

// Central Error Handler
app.use(errorHandler);

module.exports = app;
