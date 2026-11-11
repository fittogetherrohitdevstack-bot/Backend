const mongoose = require("mongoose");

const foodItemLogSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: "g" },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fats: { type: Number, default: 0 },
    eaten: { type: Boolean, default: false },
    eatenAt: { type: Date },
    actualQuantity: { type: Number },
    isUnplanned: { type: Boolean, default: false },
  },
  { _id: false }
);

const mealEntrySchema = new mongoose.Schema(
  {
    mealId: { type: String, required: true },
    mealName: { type: String, required: true },
    scheduledTime: { type: String, default: "08:00" },
    plannedFoodItems: { type: [foodItemLogSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "partial", "eaten", "skipped"],
      default: "pending",
    },
    completedAt: { type: Date },
    actualFoodItems: { type: [foodItemLogSchema], default: [] },
    skipReason: { type: String, default: "" },
  },
  { _id: true }
);

const mealLogSchema = new mongoose.Schema(
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
    },
    dietPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DietPlan",
      required: false,
    },
    date: {
      type: String, // YYYY-MM-DD
      required: true,
      index: true,
    },
    meals: {
      type: [mealEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Unique index to prevent duplicate daily meal logs per user and date
mealLogSchema.index({ userId: 1, date: 1 }, { unique: true });

const MealLog = mongoose.model("MealLog", mealLogSchema);

module.exports = MealLog;
