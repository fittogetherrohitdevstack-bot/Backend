const mongoose = require("mongoose");

const posePhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    takenAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const progressPhotoSetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Local YYYY-MM-DD date in user's timezone
    date: {
      type: String,
      required: true,
    },
    // 1, 2, 3... every 14 days from the anchor date
    cycleNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    photos: {
      front_relaxed: { type: posePhotoSchema, default: null },
      side_relaxed: { type: posePhotoSchema, default: null },
      back_relaxed: { type: posePhotoSchema, default: null },
    },
    // Snapshot of body weight around the check-in day (private by default)
    weightKg: {
      type: Number,
      default: null,
    },
    note: {
      type: String,
      default: "",
      maxlength: 500,
    },
    visibility: {
      type: String,
      enum: ["private", "group"],
      default: "private",
    },
  },
  {
    collection: "progressPhotoSets",
    timestamps: true,
  }
);

progressPhotoSetSchema.index({ userId: 1, cycleNumber: 1 }, { unique: true });
progressPhotoSetSchema.index({ userId: 1, date: -1 });
progressPhotoSetSchema.index({ userId: 1, visibility: 1 });

const ProgressPhotoSet = mongoose.model("ProgressPhotoSet", progressPhotoSetSchema);

module.exports = ProgressPhotoSet;
