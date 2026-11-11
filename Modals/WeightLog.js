const mongoose = require('mongoose');

const weightLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD normalised local day
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'],
    },
    weightKg: {
      type: Number,
      required: [true, 'Weight in kg is required'],
      min: [20, 'Weight must be at least 20 kg'],
      max: [400, 'Weight cannot exceed 400 kg'],
    },
    note: {
      type: String,
      default: '',
      maxlength: [500, 'Note cannot exceed 500 characters'],
    },
    timeOfDay: {
      type: String,
      enum: ['morning', 'evening', 'other'],
      default: 'morning',
    },
  },
  {
    timestamps: true,
  }
);

// One weigh-in per user per local day
weightLogSchema.index({ userId: 1, date: 1 }, { unique: true });
weightLogSchema.index({ userId: 1, date: -1 });

const WeightLog = mongoose.model('WeightLog', weightLogSchema);

module.exports = WeightLog;
