const mongoose = require("mongoose");

const aiNutritionCacheSchema = new mongoose.Schema(
  {
    normalizedText: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    mealSlot: {
      type: String,
      default: "Breakfast",
    },
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        unit: { type: String, default: "serving" },
        calories: { type: Number, default: 0 },
        protein: { type: Number, default: 0 },
        carbs: { type: Number, default: 0 },
        fats: { type: Number, default: 0 },
        isEstimate: { type: Boolean, default: false },
      },
    ],
    totals: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fats: { type: Number, default: 0 },
    },
    source: {
      type: String,
      enum: ["gemini-ai", "cache", "verified-db", "offline-nlp"],
      default: "gemini-ai",
    },
  },
  { timestamps: true }
);

const AiNutritionCache = mongoose.model("AiNutritionCache", aiNutritionCacheSchema);

module.exports = AiNutritionCache;
