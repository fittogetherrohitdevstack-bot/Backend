const mongoose = require("mongoose");

const bodyMeasurementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    weekStart: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    measurementsCm: {
      chest: { type: Number, min: 10, max: 300 },
      waist: { type: Number, min: 10, max: 300 },
      abdomen: { type: Number, min: 10, max: 300 },
      hips: { type: Number, min: 10, max: 300 },
      leftArm: { type: Number, min: 10, max: 150 },
      rightArm: { type: Number, min: 10, max: 150 },
      leftThigh: { type: Number, min: 10, max: 200 },
      rightThigh: { type: Number, min: 10, max: 200 },
      neck: { type: Number, min: 10, max: 150 },
      shoulders: { type: Number, min: 10, max: 300 },
      calves: { type: Number, min: 10, max: 150 },
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    progressImage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one entry per week per user
bodyMeasurementSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
bodyMeasurementSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model("BodyMeasurement", bodyMeasurementSchema);
