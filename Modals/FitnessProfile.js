const mongoose = require("mongoose");

const fitnessProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    age: {
      type: Number,
      min: 10,
      max: 120,
      default: 25,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: "male",
    },
    height: {
      type: Number, // in cm
      min: 50,
      max: 300,
      default: 175,
    },
    currentWeight: {
      type: Number, // in kg
      min: 20,
      max: 500,
      default: 70,
    },
    targetWeight: {
      type: Number, // in kg
      min: 20,
      max: 500,
      default: 68,
    },
    fitnessGoal: {
      type: String,
      enum: ["muscle_gain", "fat_loss", "maintenance", "general_fitness", "strength"],
      default: "maintenance",
    },
    activityLevel: {
      type: String,
      enum: ["sedentary", "light", "moderate", "active", "very_active"],
      default: "moderate",
    },
    dietPreference: {
      type: String,
      enum: ["vegetarian", "non_vegetarian", "vegan", "eggetarian", "custom"],
      default: "non_vegetarian",
    },
    allergies: {
      type: [String],
      default: [],
    },
    targets: {
      calories: { type: Number, default: 2200 },
      protein: { type: Number, default: 140 }, // grams
      carbs: { type: Number, default: 250 },   // grams
      fats: { type: Number, default: 60 },     // grams
      waterMl: { type: Number, default: 3000 },// ml
    },
    privacy: {
      weight: {
        type: String,
        enum: ["private", "group"],
        default: "private",
      },
      measurements: {
        type: String,
        enum: ["private", "group"],
        default: "private",
      },
      photos: {
        type: String,
        enum: ["private", "group"],
        default: "private",
      },
    },
    featureFlags: {
      reminders: { type: Boolean, default: false },
      weeklyTargets: { type: Boolean, default: false },
      photoCheckins: { type: Boolean, default: false },
    },
    featureFlagsConfigured: {
      type: Boolean,
      default: false,
    },
    targetDefaults: {
      enabled: { type: Boolean, default: false },
      weightChangeKgPerWeek: { type: Number, default: null },
      weighInsTarget: { type: Number, min: 1, max: 7, default: 5 },
      waistChangeCm: { type: Number, default: null },
      note: { type: String, trim: true, maxlength: 300, default: "" },
    },
    hideWeightNumbers: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const FitnessProfile = mongoose.model("FitnessProfile", fitnessProfileSchema);

module.exports = FitnessProfile;
