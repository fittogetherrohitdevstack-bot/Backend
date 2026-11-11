const mongoose = require("mongoose");

const templateFoodItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 100 },
    unit: { type: String, default: "g" },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fats: { type: Number, default: 0 },
  },
  { _id: false }
);

const templateMealSchema = new mongoose.Schema(
  {
    mealId: { type: String, required: true },
    mealName: { type: String, required: true, trim: true },
    scheduledTime: { type: String, default: "08:00" },
    plannedFoodItems: { type: [templateFoodItemSchema], default: [] },
  },
  { _id: false }
);

const dietTemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    meals: {
      type: [templateMealSchema],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

dietTemplateSchema.index({ userId: 1, name: 1 });

const DietTemplate = mongoose.model("DietTemplate", dietTemplateSchema);

module.exports = DietTemplate;
