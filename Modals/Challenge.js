const mongoose = require("mongoose");

const challengeSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    challengeType: {
      type: String,
      enum: [
        "meal_completion",
        "workout_days",
        "water_goal",
        "streak",
        "water_5_days",
        "most_days_logged",
        "most_meals_ticked",
        "full_diet_completion",
      ],
      required: true,
    },
    templateKey: {
      type: String,
      default: "",
    },
    isAutoWeekly: {
      type: Boolean,
      default: false,
    },
    weekStart: {
      type: String,
      default: "",
    },
    winnerUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    target: {
      type: Number,
      required: true,
      default: 7,
    },
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "active", "completed"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

challengeSchema.index({ groupId: 1, status: 1 });

const Challenge = mongoose.model("Challenge", challengeSchema);

module.exports = Challenge;
