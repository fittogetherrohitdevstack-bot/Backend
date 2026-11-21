const mongoose = require("mongoose");

const exerciseTargetSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exercise",
      default: null,
      set: (v) => (v === "" || !v ? null : v),
    },
    name: { type: String, required: true, trim: true, default: "Exercise" },
    primaryMuscle: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    gifUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    images: { type: [String], default: [] },
    mediaType: { type: String, default: "text_only" },
    targetSets: { type: Number, default: 3 },
    targetReps: { type: Number, default: 10 },
    targetWeight: { type: Number, default: 0 }, // kg
    restSeconds: { type: Number, default: 60 },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const dayWorkoutScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    dayName: { type: String, default: "" }, // e.g. "Monday", "Push Day", "Day 1"
    workoutName: { type: String, default: "Workout" },
    isRestDay: { type: Boolean, default: false },
    targetMuscles: { type: [String], default: [] },
    exercises: { type: [exerciseTargetSchema], default: [] },
  },
  { _id: false }
);

const workoutPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      set: (v) => (v === "" || !v ? null : v),
    },
    name: {
      type: String,
      required: true,
      default: "Weekly Split",
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    fitnessLevel: {
      type: String,
      default: "Intermediate",
      trim: true,
    },
    goal: {
      type: String,
      default: "Hypertrophy",
      trim: true,
    },
    daysPerWeek: {
      type: Number,
      default: 4,
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    templateKey: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    schedule: {
      type: [dayWorkoutScheduleSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

workoutPlanSchema.index({ userId: 1, isActive: 1 });

const WorkoutPlan = mongoose.model("WorkoutPlan", workoutPlanSchema);

module.exports = WorkoutPlan;
