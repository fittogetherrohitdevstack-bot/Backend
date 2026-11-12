const mongoose = require("mongoose");
const crypto = require("crypto");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      maxlength: 60,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    maxMembers: {
      type: Number,
      default: 15,
      min: 2,
      max: 50,
    },
    currentStreak: {
      type: Number,
      default: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
    },
    lastLogDate: {
      type: String,
      default: "",
    },
    challengeSettings: {
      autoRotate: { type: Boolean, default: true },
      preferredTemplate: { type: String, default: "" },
      rotationIndex: { type: Number, default: 0 },
    },
    weeklyStakes: {
      enabled: { type: Boolean, default: false },
      forfeitText: { type: String, default: "", maxlength: 140 },
    },
  },
  {
    timestamps: true,
  }
);

// Generate random 8-character invite code before save
groupSchema.pre("save", function () {
  if (!this.inviteCode) {
    this.inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
});

const Group = mongoose.model("Group", groupSchema);

module.exports = Group;
