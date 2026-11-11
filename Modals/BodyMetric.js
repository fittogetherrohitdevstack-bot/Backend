const mongoose = require("mongoose");

const bodyMetricSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    weight: {
      type: Number, // kg
    },
    measurements: {
      chest: { type: Number, default: 0 },
      waist: { type: Number, default: 0 },
      arms: { type: Number, default: 0 },
      thighs: { type: Number, default: 0 },
      hips: { type: Number, default: 0 },
    },
    progressImage: {
      type: String,
      default: "",
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

bodyMetricSchema.index({ userId: 1, date: 1 });

const BodyMetric = mongoose.model("BodyMetric", bodyMetricSchema);

module.exports = BodyMetric;
