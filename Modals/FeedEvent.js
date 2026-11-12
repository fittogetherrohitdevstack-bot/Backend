const mongoose = require("mongoose");

const FEED_EVENT_TYPES = [
  "logged_weight",
  "water_goal",
  "diet_completed",
  "streak_milestone",
  "badge_earned",
  "challenge_won",
];

const FEED_REACTION_EMOJIS = ["👏", "💪", "🔥", "❤️"];

const reactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      enum: FEED_REACTION_EMOJIS,
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

const feedEventSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: FEED_EVENT_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    dateKey: {
      type: String, // YYYY-MM-DD in user's timezone
      required: true,
    },
    dedupeKey: {
      type: String,
      default: undefined,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

feedEventSchema.index({ groupId: 1, createdAt: -1, _id: -1 });
feedEventSchema.index(
  { groupId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

const FeedEvent = mongoose.model("FeedEvent", feedEventSchema);

module.exports = FeedEvent;
module.exports.FEED_EVENT_TYPES = FEED_EVENT_TYPES;
module.exports.FEED_REACTION_EMOJIS = FEED_REACTION_EMOJIS;
