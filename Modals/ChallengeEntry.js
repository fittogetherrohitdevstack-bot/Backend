const mongoose = require("mongoose");

const challengeEntrySchema = new mongoose.Schema(
  {
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    progress: {
      type: Number,
      default: 0,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

challengeEntrySchema.index({ challengeId: 1, userId: 1 }, { unique: true });

const ChallengeEntry = mongoose.model("ChallengeEntry", challengeEntrySchema);

module.exports = ChallengeEntry;
