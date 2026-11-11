const mongoose = require("mongoose");

const setLogSchema = new mongoose.Schema(
  {
    setNumber: { type: Number, required: true },
    reps: { type: Number, default: 0 },
    weight: { type: Number, default: 0 }, // kg
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const exerciseLogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sets: { type: [setLogSchema], default: [] },
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
      enum: ["planned", "completed", "skipped", "rest"],
      default: "planned",
    },
    exercises: {
      type: [exerciseLogSchema],
      default: [],
    },
    durationMinutes: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

workoutSessionSchema.index({ userId: 1, date: 1 });

const WorkoutSession = mongoose.model("WorkoutSession", workoutSessionSchema);

module.exports = WorkoutSession;
