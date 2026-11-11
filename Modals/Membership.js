const mongoose = require("mongoose");

const membershipSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "pending", "left"],
      default: "active",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: A user can only have one active/pending membership per group
membershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });

const Membership = mongoose.model("Membership", membershipSchema);

module.exports = Membership;
