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
  "Obliques",
  "Lower Back",
  "Full Body",
];

const EXERCISE_EQUIPMENT = [
  "Barbells",
  "Dumbbells",
  "Cable Machine",
  "Machines",
  "No Equipment",
  "Resistance Bands",
  "Kettlebells",
  "Pull-up Bar",
  "Bench",
  "Smith Machine",
  "Barbell",
  "Dumbbell",
  "Cable",
  "Machine",
  "Bodyweight",
  "Kettlebell",
  "Resistance Band",
  "Plate",
  "Other",
];

const EXERCISE_DIFFICULTY = ["Beginner", "Intermediate", "Advanced"];

const EXERCISE_CATEGORIES = [
  "Strength",
  "Hypertrophy",
  "Bodyweight",
  "Cardio",
  "HIIT",
  "Stretching",
  "Mobility",
  "Warm-up",
  "Cool-down",
  "Plyometrics",
  "Olympic",
  "Calisthenics",
  "Endurance",
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
    alternativeNames: {
      type: [String],
      default: [],
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
      default: "Strength",
      index: true,
    },
    instructions: {
      type: [String],
      default: [],
    },
    formCues: {
      type: [String],
      default: [],
    },
    commonMistakes: {
      type: [String],
      default: [],
    },
    breathingInstructions: {
      type: String,
      default: "",
    },
    alternatives: {
      type: [String],
      default: [],
    },
    tips: {
      type: [String],
      default: [],
    },
    mediaType: {
      type: String,
      enum: ["video", "gif", "images", "none"],
      default: "none",
      index: true,
    },
    videoUrl: {
      type: String,
      default: null,
    },
    videoUrlFemale: {
      type: String,
      default: null,
    },
    gifUrl: {
      type: String,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    source: {
      type: String,
      default: "fittogether",
      index: true,
    },
    sourceId: {
      type: String,
      default: null,
      index: true,
    },
    attribution: {
      type: String,
      default: "",
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

exerciseSchema.index({ name: "text", alternativeNames: "text", description: "text" });
exerciseSchema.index({ primaryMuscle: 1, equipment: 1, difficulty: 1, category: 1 });

const Exercise = mongoose.model("Exercise", exerciseSchema);

module.exports = Exercise;
module.exports.Exercise = Exercise;
module.exports.EXERCISE_MUSCLES = EXERCISE_MUSCLES;
module.exports.EXERCISE_EQUIPMENT = EXERCISE_EQUIPMENT;
module.exports.EXERCISE_DIFFICULTY = EXERCISE_DIFFICULTY;
module.exports.EXERCISE_CATEGORIES = EXERCISE_CATEGORIES;
