const mongoose = require("mongoose");

const exerciseTargetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    targetSets: { type: Number, default: 3 },
    targetReps: { type: Number, default: 10 },
    targetWeight: { type: Number, default: 0 }, // kg
    restSeconds: { type: Number, default: 60 },
  },
  { _id: false }
);

const dayWorkoutScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    workoutName: { type: String, default: "Workout" },
    isRestDay: { type: Boolean, default: false },
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
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    name: {
      type: String,
      required: true,
      default: "Weekly Split",
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
