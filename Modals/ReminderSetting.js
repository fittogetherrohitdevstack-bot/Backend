const mongoose = require("mongoose");

const reminderSettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    dailyWeight: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: "07:00" }, // HH:MM (24h local)
      days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0=Sun..6=Sat
      onlyIfNotLogged: { type: Boolean, default: true },
    },
    weeklyMeasurements: {
      enabled: { type: Boolean, default: true },
      weekday: { type: Number, default: 0, min: 0, max: 6 }, // Sunday = 0
      time: { type: String, default: "08:00" },
    },
    biweeklyPhotos: {
      enabled: { type: Boolean, default: true },
      weekday: { type: Number, default: 0, min: 0, max: 6 }, // Sunday = 0
      time: { type: String, default: "08:30" },
      anchorDate: { type: Date, default: () => new Date() },
    },
    weeklyTarget: {
      enabled: { type: Boolean, default: true },
      weekday: { type: Number, default: 0, min: 0, max: 6 }, // Sunday review
      time: { type: String, default: "20:00" },
    },
    quietHours: {
      enabled: { type: Boolean, default: true },
      from: { type: String, default: "22:00" },
      to: { type: String, default: "06:00" },
    },
    channels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    snoozeMinutes: {
      type: Number,
      default: 60,
      min: 5,
      max: 720,
    },
    dailyReminder: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: "20:00" },
    },
    squadStreakAtRisk: {
      enabled: { type: Boolean, default: true },
      time: { type: String, default: "20:30" },
    },
    nudges: {
      enabled: { type: Boolean, default: true },
    },
    challengeUpdates: {
      enabled: { type: Boolean, default: true },
    },
    weeklyRecapReady: {
      enabled: { type: Boolean, default: true },
    },
  },
  {
    collection: "reminderSettings",
    timestamps: true,
  }
);

const ReminderSetting = mongoose.model("ReminderSetting", reminderSettingSchema);

module.exports = ReminderSetting;
