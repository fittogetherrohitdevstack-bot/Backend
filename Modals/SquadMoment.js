const mongoose = require("mongoose");

const MOMENT_CATEGORIES = [
  "gym",         // 💪 Gym
  "cheat_meal",  // 🍕 Cheat Meal
  "funny",       // 😂 Funny
  "achievement", // 🏆 Achievement
  "squad",       // 👥 Squad
  "daily",       // 🌿 Daily Life
];

const MOMENT_REACTION_EMOJIS = ["❤️", "😂", "💪", "🔥", "👏", "😭"];

const momentImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      default: "",
      trim: true,
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
    caption: {
      type: String,
      default: "",
      maxlength: 200,
    },
  },
  { _id: false }
);

const momentReactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      enum: MOMENT_REACTION_EMOJIS,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const squadMomentSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    images: {
      type: [momentImageSchema],
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length >= 1 && val.length <= 6;
        },
        message: "A moment must include between 1 and 6 photos",
      },
      required: true,
    },
    caption: {
      type: String,
      default: "",
      maxlength: [1000, "Caption cannot exceed 1000 characters"],
      trim: true,
    },
    category: {
      type: String,
      enum: MOMENT_CATEGORIES,
      default: "gym",
      index: true,
    },
    reactions: {
      type: [momentReactionSchema],
      default: [],
    },
    reactionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal mobile feed queries and filtering
squadMomentSchema.index({ groupId: 1, createdAt: -1 });
squadMomentSchema.index({ groupId: 1, category: 1, createdAt: -1 });

const SquadMoment = mongoose.model("SquadMoment", squadMomentSchema);

module.exports = {
  SquadMoment,
  MOMENT_CATEGORIES,
  MOMENT_REACTION_EMOJIS,
};
