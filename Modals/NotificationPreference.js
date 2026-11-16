const mongoose = require("mongoose");

const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    allPushEnabled: {
      type: Boolean,
      default: true,
    },
    mealNotifications: {
      type: Boolean,
      default: true,
    },
    dietUpdates: {
      type: Boolean,
      default: true,
    },
    waterLogging: {
      type: Boolean,
      default: true,
    },
    moments: {
      type: Boolean,
      default: true,
    },
    workoutCompletion: {
      type: Boolean,
      default: true,
    },
    achievements: {
      type: Boolean,
      default: true,
    },
    friendRequests: {
      type: Boolean,
      default: true,
    },
    scheduledReminders: {
      type: Boolean,
      default: true,
    },
    soundEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const NotificationPreference = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema
);

module.exports = NotificationPreference;
