const mongoose = require("mongoose");

const userBadgeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    badgeCode: {
      type: String,
      required: true,
      uppercase: true,
    },
    earnedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

userBadgeSchema.index({ userId: 1, badgeCode: 1 }, { unique: true });

const UserBadge = mongoose.model("UserBadge", userBadgeSchema);

module.exports = UserBadge;
