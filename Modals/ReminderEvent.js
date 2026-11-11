const mongoose = require("mongoose");

const reminderEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "daily_weight",
        "weekly_measurements",
        "biweekly_photos",
        "weekly_target",
        "test",
      ],
      required: true,
    },
    // Date string (YYYY-MM-DD), ISO week start (YYYY-MM-DD), or cycle-<n>
    periodKey: {
      type: String,
      required: true,
    },
    // 'initial', 'followup', 'control' (holds snooze/skip state), or 'snooze_<n>'
    attempt: {
      type: String,
      required: true,
      default: "initial",
    },
    status: {
      type: String,
      enum: ["sent", "snoozed", "skipped", "completed"],
      default: "sent",
    },
    sentAt: {
      type: Date,
      default: () => new Date(),
    },
    snoozedUntil: {
      type: Date,
      default: null,
    },
    snoozeCount: {
      type: Number,
      default: 0,
    },
    skipped: {
      type: Boolean,
      default: false,
    },
    channelsSent: {
      inApp: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },
  },
  {
    collection: "reminderEvents",
    timestamps: true,
  }
);

// Atomic dedupe index across multi-instance / concurrent cron runs
reminderEventSchema.index(
  { userId: 1, type: 1, periodKey: 1, attempt: 1 },
  { unique: true }
);
reminderEventSchema.index({ userId: 1, createdAt: -1 });

const ReminderEvent = mongoose.model("ReminderEvent", reminderEventSchema);

module.exports = ReminderEvent;
