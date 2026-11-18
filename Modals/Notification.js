const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    senderImage: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: [
        "meal",
        "meal_added",
        "diet",
        "diet_updated",
        "water",
        "water_logged",
        "moment",
        "moment_posted",
        "workout",
        "workout_completed",
        "streak",
        "badge",
        "achievement_unlocked",
        "challenge",
        "group",
        "friend_request",
        "friend_request_accepted",
        "weight",
        "measurements",
        "photos",
        "weekly_target",
        "reminder",
        "nudge",
        "recap",
        "chat",
        "chat_message",
        "squad_chat",
        "general",
      ],
      default: "general",
    },
    category: {
      type: String,
      enum: [
        "meal",
        "diet",
        "water",
        "moment",
        "workout",
        "achievement",
        "social",
        "reminder",
        "chat",
        "general",
      ],
      default: "general",
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    url: {
      type: String,
      default: "/",
    },
    tag: {
      type: String,
      default: "fittogether",
    },
    activityId: {
      type: String,
      default: "",
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, isDeleted: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
