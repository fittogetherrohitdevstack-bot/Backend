const mongoose = require("mongoose");

const personalRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    exerciseName: {
      type: String,
      required: true,
      trim: true,
    },
    bestWeight: {
      type: Number,
      default: 0,
    },
    bestReps: {
      type: Number,
      default: 0,
    },
    bestVolume: {
      type: Number, // weight * reps
      default: 0,
    },
    achievedAt: {
      type: Date,
      default: Date.now,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkoutSession",
    },
  },
  {
    timestamps: true,
  }
);

personalRecordSchema.index({ userId: 1, exerciseName: 1 });

const PersonalRecord = mongoose.model("PersonalRecord", personalRecordSchema);

module.exports = PersonalRecord;
