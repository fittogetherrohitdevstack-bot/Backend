const mongoose = require("mongoose");

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    installationId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["web", "android", "ios"],
      required: true,
    },
    token: {
      type: String,
      required: true,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    deviceModel: {
      type: String,
      default: "",
    },
    appVersion: {
      type: String,
      default: "",
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// A user + installation is unique
deviceTokenSchema.index({ userId: 1, installationId: 1 }, { unique: true });
// Finding active tokens per user
deviceTokenSchema.index({ userId: 1, active: 1, platform: 1 });

const DeviceToken = mongoose.model("DeviceToken", deviceTokenSchema);

module.exports = DeviceToken;
