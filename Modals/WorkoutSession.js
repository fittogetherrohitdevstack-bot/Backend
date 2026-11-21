const mongoose = require("mongoose");

const setLogSchema = new mongoose.Schema(
  {
    setNumber: { type: Number, required: true },
    reps: { type: Number, default: 0 },
    weight: { type: Number, default: 0 }, // kg
    completed: { type: Boolean, default: false },
    rpe: { type: Number, min: 1, max: 10 },
    notes: { type: String, default: "" },
    previousWeight: { type: Number, default: 0 },
    previousReps: { type: Number, default: 0 },
    isPR: { type: Boolean, default: false },
  },
  { _id: false }
);

const previousPerformanceSchema = new mongoose.Schema(
  {
    lastDate: { type: String, default: "" },
    workoutName: { type: String, default: "" },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sets: [
      {
        setNumber: Number,
        weight: Number,
        reps: Number,
        _id: false,
      },
    ],
    bestWeight: { type: Number, default: 0 },
    bestReps: { type: Number, default: 0 },
    totalVolumeKg: { type: Number, default: 0 },
  },
  { _id: false }
);

const exerciseLogSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exercise",
      default: null,
      set: (v) => (v === "" || !v ? null : v),
    },
    name: { type: String, required: true },
    primaryMuscle: { type: String, default: "" },
    notes: { type: String, default: "" },
    sets: { type: [setLogSchema], default: [] },
    previousPerformance: {
      type: previousPerformanceSchema,
      default: null,
    },
  },
  { _id: false }
);

const workoutSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workoutPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkoutPlan",
      default: null,
      set: (v) => (v === "" || !v ? null : v),
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    workoutName: {
      type: String,
      default: "Workout Session",
    },
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed", "skipped", "rest"],
      default: "planned",
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    exercises: {
      type: [exerciseLogSchema],
      default: [],
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    totalVolumeKg: {
      type: Number,
      default: 0,
    },
    totalReps: {
      type: Number,
      default: 0,
    },
    caloriesBurned: {
      type: Number,
      default: 0,
    },
    targetMuscles: {
      type: [String],
      default: [],
    },
    rpe: {
      type: Number,
      min: 1,
      max: 10,
    },
    notes: {
      type: String,
      default: "",
    },
    sharedToFeed: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ["public", "squad", "private"],
      default: "squad",
    },
  },
  {
    timestamps: true,
  }
);

workoutSessionSchema.index({ userId: 1, date: 1 });

const WorkoutSession = mongoose.model("WorkoutSession", workoutSessionSchema);

module.exports = WorkoutSession;
