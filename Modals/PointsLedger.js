const mongoose = require("mongoose");

const pointsLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    type: {
      type: String,
      enum: [
        "meals",
        "workout",
        "water",
        "streak_bonus",
        "challenge",
        "weigh_in",
        "measurements",
        "photo_checkin",
      ],
      required: true,
    },
    points: {
      type: Number,
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
pointsLedgerSchema.index({ groupId: 1, date: 1 });
// Idempotency: only 1 points ledger entry per user per day per type
pointsLedgerSchema.index({ userId: 1, date: 1, type: 1 }, { unique: true });
pointsLedgerSchema.index(
  { userId: 1, type: 1, "meta.periodKey": 1 },
  {
    unique: true,
    partialFilterExpression: { "meta.periodKey": { $exists: true } },
  }
);

const PointsLedger = mongoose.model("PointsLedger", pointsLedgerSchema);

module.exports = PointsLedger;
