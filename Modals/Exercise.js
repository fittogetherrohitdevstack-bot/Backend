const mongoose = require("mongoose");

const EXERCISE_MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Legs",
  "Quads",
  "Hamstrings",
  "Calves",
  "Glutes",
  "Abs",
  "Full Body",
];

const EXERCISE_EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Cable",
  "Bodyweight",
  "Kettlebell",
  "Smith Machine",
  "Resistance Band",
  "Plate",
  "Other",
];

const EXERCISE_DIFFICULTY = ["Beginner", "Intermediate", "Advanced"];

const EXERCISE_CATEGORIES = [
  "Strength",
  "Hypertrophy",
  "Endurance",
  "Calisthenics",
  "Olympic",
  "Cardio",
  "Mobility",
];

const exerciseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    primaryMuscle: {
      type: String,
      required: true,
      enum: EXERCISE_MUSCLES,
      index: true,
    },
    secondaryMuscles: {
      type: [String],
      default: [],
    },
    equipment: {
      type: String,
      required: true,
      enum: EXERCISE_EQUIPMENT,
      index: true,
    },
    difficulty: {
      type: String,
      enum: EXERCISE_DIFFICULTY,
      default: "Intermediate",
      index: true,
    },
    category: {
      type: String,
      enum: EXERCISE_CATEGORIES,
      default: "Hypertrophy",
      index: true,
    },
    instructions: {
      type: [String],
      default: [],
    },
    commonMistakes: {
      type: [String],
      default: [],
    },
    alternatives: {
      type: [String],
      default: [],
    },
    tips: {
      type: [String],
      default: [],
    },
    isCustom: {
      type: Boolean,
      default: false,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    favoriteBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

exerciseSchema.index({ name: "text", description: "text" });

const Exercise = mongoose.model("Exercise", exerciseSchema);

module.exports = Exercise;
module.exports.Exercise = Exercise;
module.exports.EXERCISE_MUSCLES = EXERCISE_MUSCLES;
module.exports.EXERCISE_EQUIPMENT = EXERCISE_EQUIPMENT;
module.exports.EXERCISE_DIFFICULTY = EXERCISE_DIFFICULTY;
module.exports.EXERCISE_CATEGORIES = EXERCISE_CATEGORIES;
