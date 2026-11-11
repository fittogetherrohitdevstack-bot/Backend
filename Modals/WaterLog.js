const mongoose = require("mongoose");

const waterEntrySchema = new mongoose.Schema(
  {
    amountMl: {
      type: Number,
      required: true,
      min: 1,
    },
    consumedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const waterLogSchema = new mongoose.Schema(
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
    targetMl: {
      type: Number,
      default: 3000,
    },
    entries: {
      type: [waterEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

waterLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const WaterLog = mongoose.model("WaterLog", waterLogSchema);

module.exports = WaterLog;
