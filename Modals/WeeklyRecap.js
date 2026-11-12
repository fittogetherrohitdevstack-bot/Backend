const mongoose = require("mongoose");

const weeklyRecapSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    weekStart: {
      type: String, // Monday YYYY-MM-DD
      required: true,
    },
    weekEnd: {
      type: String, // Sunday YYYY-MM-DD
      required: true,
    },
    stats: {
      userName: { type: String, default: "" },
      streak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      squadStreak: { type: Number, default: 0 },
      squadName: { type: String, default: "" },
      squadInviteCode: { type: String, default: "" },
      waterTotalMl: { type: Number, default: 0 },
      daysLogged: { type: Number, default: 0 },
      xpEarned: { type: Number, default: 0 },
      squadRank: { type: Number, default: null },
      squadSize: { type: Number, default: 0 },
      weightChangeKg: { type: Number, default: null }, // strictly gated by socialPrivacy.showWeightInRecap
      weightChangeAllowed: { type: Boolean, default: false },
      forfeitAlert: {
        enabled: { type: Boolean, default: false },
        forfeitText: { type: String, default: "" },
        lowestMemberUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        lowestMemberName: { type: String, default: "" },
        lowestMemberPoints: { type: Number, default: 0 },
        isCurrentUserLowest: { type: Boolean, default: false },
      },
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

weeklyRecapSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

const WeeklyRecap = mongoose.model("WeeklyRecap", weeklyRecapSchema);

module.exports = WeeklyRecap;
