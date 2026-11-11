const mongoose = require("mongoose");

const weeklyTargetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekStart: {
      type: String, // Monday (local YYYY-MM-DD)
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"],
    },
    weightChangeKgPerWeek: {
      type: Number,
      min: [-3.0, "Weekly weight change target must be at least -3.0 kg/week"],
      max: [3.0, "Weekly weight change target cannot exceed +3.0 kg/week"],
      default: null,
    },
    weighInsTarget: {
      type: Number,
      min: 1,
      max: 7,
      default: 5,
    },
    waistChangeCm: {
      type: Number,
      min: -5.0,
      max: 5.0,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    source: {
      type: String,
      enum: ["manual", "carried_over", "suggested"],
      default: "manual",
    },
  },
  {
    timestamps: true,
  }
);

weeklyTargetSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

const WeeklyTarget = mongoose.model("WeeklyTarget", weeklyTargetSchema, "weeklyTargets");

module.exports = WeeklyTarget;
