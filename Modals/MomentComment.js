const mongoose = require("mongoose");

const momentCommentSchema = new mongoose.Schema(
  {
    momentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SquadMoment",
      required: true,
      index: true,
    },
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
    },
    text: {
      type: String,
      required: [true, "Comment text is required"],
      trim: true,
      maxlength: [500, "Comment cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for sorted chronologically comments per moment
momentCommentSchema.index({ momentId: 1, createdAt: 1 });

const MomentComment = mongoose.model("MomentComment", momentCommentSchema);

module.exports = MomentComment;
