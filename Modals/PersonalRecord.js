const mongoose = require("mongoose");

const personalRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exercise",
    },
    exerciseName: {
      type: String,
      required: true,
      trim: true,
    },
    primaryMuscle: {
      type: String,
      default: "",
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
    estimatedOneRepMax: {
      type: Number,
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
    history: [
      {
        weight: { type: Number, default: 0 },
        reps: { type: Number, default: 0 },
        estimated1RM: { type: Number, default: 0 },
        volume: { type: Number, default: 0 },
        achievedAt: { type: Date, default: Date.now },
        sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutSession" },
      },
    ],
  },
  {
    timestamps: true,
  }
);

personalRecordSchema.index({ userId: 1, exerciseName: 1 });

const PersonalRecord = mongoose.model("PersonalRecord", personalRecordSchema);

module.exports = PersonalRecord;
