const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 100 },
    unit: { type: String, default: "g" },
    calories: { type: Number, required: true, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fats: { type: Number, default: 0 },
  },
  { _id: false }
);

const mealPlanSchema = new mongoose.Schema(
  {
    mealId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    scheduledTime: { type: String, default: "08:00" }, // "HH:mm"
    foodItems: { type: [foodItemSchema], default: [] },
    notes: { type: String, default: "" },
    alternatives: { type: [String], default: [] },
  },
  { _id: false }
);

const dayPlanSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sun, 1 = Mon ...
    meals: { type: [mealPlanSchema], default: [] },
  },
  { _id: false }
);

const dietPlanSchema = new mongoose.Schema(
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
      required: [true, "Diet plan name is required"],
      trim: true,
      default: "Weekly Balanced Diet",
    },
    startDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    endDate: {
      type: String, // YYYY-MM-DD
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    days: {
      type: [dayPlanSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

dietPlanSchema.index({ userId: 1, isActive: 1 });

const DietPlan = mongoose.model("DietPlan", dietPlanSchema);

module.exports = DietPlan;
