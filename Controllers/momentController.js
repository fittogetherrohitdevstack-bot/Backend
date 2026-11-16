const mongoose = require("mongoose");
const { SquadMoment, MOMENT_CATEGORIES, MOMENT_REACTION_EMOJIS } = require("../Modals/SquadMoment");
const MomentComment = require("../Modals/MomentComment");
const Membership = require("../Modals/Membership");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  validateImageFile,
  uploadSquadMomentPhoto,
  deleteSquadMomentPhoto,
} = require("../Utils/cloudinary");
const { emitGroupActivity } = require("../Utils/socket");
const {
  dispatchSocialActivityNotification,
  cleanupActivityNotifications,
} = require("../services/notificationService");

/**
 * Serializes a moment with user-specific reaction and breakdown summary.
 */
const serializeMoment = (momentDoc, currentUserId) => {
  const plain = momentDoc.toObject ? momentDoc.toObject() : { ...momentDoc };
  const userIdStr = currentUserId ? currentUserId.toString() : "";

  // Find if current user has an active reaction
  const userReactionEntry = (plain.reactions || []).find(
    (r) => r.userId && (r.userId._id || r.userId).toString() === userIdStr
  );
  const userReaction = userReactionEntry ? userReactionEntry.emoji : null;

  // Compute breakdown of reactions
  const breakdown = {};
  (plain.reactions || []).forEach((r) => {
    breakdown[r.emoji] = (breakdown[r.emoji] || 0) + 1;
  });

  return {
    ...plain,
    userReaction,
    reactionBreakdown: breakdown,
    reactionsCount: (plain.reactions || []).length,
  };
};

// @desc Get paginated squad moments (cursor-based, optional category filter)
// @route GET /api/groups/:id/moments
const getMoments = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
  const cursor = req.query.cursor ? String(req.query.cursor).trim() : null;
  const category = req.query.category ? String(req.query.category).trim() : null;

  const query = { groupId };
  if (category && category !== "all" && MOMENT_CATEGORIES.includes(category)) {
    query.category = category;
  }
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const moments = await SquadMoment.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("authorId", "name profileImage email")
    .lean();

  const hasMore = moments.length > limit;
  const items = hasMore ? moments.slice(0, limit) : moments;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id.toString() : null;

  // Fetch recent comments preview (last 2 per moment) for responsive social feed
  const momentIds = items.map((m) => m._id);
  const recentComments = await MomentComment.find({
    momentId: { $in: momentIds },
  })
    .sort({ createdAt: -1 })
    .populate("authorId", "name profileImage")
    .lean();

  const commentsByMoment = {};
  recentComments.forEach((c) => {
    const mId = c.momentId.toString();
    if (!commentsByMoment[mId]) commentsByMoment[mId] = [];
    if (commentsByMoment[mId].length < 2) {
      commentsByMoment[mId].unshift(c); // chronologically ordered preview
    }
  });

  const serialized = items.map((m) => {
    const s = serializeMoment(m, req.user._id);
    s.recentComments = commentsByMoment[m._id.toString()] || [];
    return s;
  });

  return sendSuccess(res, {
    moments: serialized,
    nextCursor,
    hasMore,
  });
});

// @desc Get single squad moment by ID
// @route GET /api/groups/:id/moments/:momentId
const getMomentById = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId })
    .populate("authorId", "name profileImage email")
    .lean();

  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const serialized = serializeMoment(moment, req.user._id);
  return sendSuccess(res, { moment: serialized });
});

// @desc Create a new squad moment with photo(s)
// @route POST /api/groups/:id/moments
const createMoment = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const { caption, category } = req.body;

  let uploadedImages = [];

  // Check if images were uploaded via multipart/form-data
  if (req.files && req.files.length > 0) {
    if (req.files.length > 6) {
      return sendError(res, "You can upload a maximum of 6 photos per moment", 400);
    }

    for (const file of req.files) {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        return sendError(res, validation.message || "Invalid image file", 400);
      }
    }

    // Process uploads
    for (const file of req.files) {
      const result = await uploadSquadMomentPhoto(file.buffer, {
        userId: req.user._id,
        groupId,
        mimeType: file.mimetype || "image/jpeg",
      });
      uploadedImages.push({
        url: result.url,
        publicId: result.publicId || "",
        width: result.width || null,
        height: result.height || null,
      });
    }
  } else if (req.body.images && Array.isArray(req.body.images) && req.body.images.length > 0) {
    // If client supplied pre-resolved images array
    uploadedImages = req.body.images.map((img) => ({
      url: typeof img === "string" ? img : img.url,
      publicId: img.publicId || "",
      width: img.width || null,
      height: img.height || null,
    }));
  }

  if (uploadedImages.length === 0) {
    return sendError(res, "At least one photo is required to share a Squad Moment", 400);
  }

  const selectedCategory =
    category && MOMENT_CATEGORIES.includes(category) ? category : "gym";

  const moment = await SquadMoment.create({
    groupId,
    authorId: req.user._id,
    images: uploadedImages,
    caption: String(caption || "").trim(),
    category: selectedCategory,
    reactions: [],
    reactionsCount: 0,
    commentsCount: 0,
  });

  const populated = await SquadMoment.findById(moment._id)
    .populate("authorId", "name profileImage email")
    .lean();

  const serialized = serializeMoment(populated, req.user._id);

  // Broadcast to squad room via socket
  emitGroupActivity(groupId.toString(), "squad-moment-created", {
    momentId: moment._id,
    authorName: req.user.name,
    category: selectedCategory,
  });

  // Dispatch social notification to squadmates
  dispatchSocialActivityNotification({
    actorId: req.user._id,
    actorName: req.user.name,
    actorImage: req.user.profileImage || "",
    type: "moment_posted",
    category: "moment",
    title: `📸 ${req.user.name} shared a new moment`,
    body: populated.caption ? `"${populated.caption}"` : "See what they are up to in the squad feed!",
    image: uploadedImages[0]?.url || "",
    url: `/moments`,
    activityId: moment._id.toString(),
    groupId,
  }).catch((err) => console.warn("[Notification] Moment notify error:", err.message));

  return sendSuccess(res, { moment: serialized }, "Moment shared with your squad! 🔥", 201);
});

// @desc Update squad moment caption or category (author only)
// @route PUT /api/groups/:id/moments/:momentId
const updateMoment = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;
  const { caption, category } = req.body;

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId });
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  // Security: Author only can edit
  if (moment.authorId.toString() !== req.user._id.toString()) {
    return sendError(res, "Forbidden: Only the author can edit this moment", 403);
  }

  if (caption !== undefined) {
    moment.caption = String(caption).trim();
  }
  if (category && MOMENT_CATEGORIES.includes(category)) {
    moment.category = category;
  }

  await moment.save();

  const updated = await SquadMoment.findById(moment._id)
    .populate("authorId", "name profileImage email")
    .lean();

  return sendSuccess(res, { moment: serializeMoment(updated, req.user._id) }, "Moment updated");
});

// @desc Delete squad moment (author or squad admin)
// @route DELETE /api/groups/:id/moments/:momentId
const deleteMoment = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId });
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const isAuthor = moment.authorId.toString() === req.user._id.toString();
  const isAdmin = req.membership && req.membership.role === "admin";

  if (!isAuthor && !isAdmin) {
    return sendError(res, "Forbidden: Only the author or a Squad Admin can delete this moment", 403);
  }

  // Clean up associated comments
  await MomentComment.deleteMany({ momentId: moment._id });

  // Clean up Cloudinary assets
  if (Array.isArray(moment.images)) {
    for (const img of moment.images) {
      if (img.publicId) {
        deleteSquadMomentPhoto(img.publicId).catch(() => {});
      }
    }
  }

  await SquadMoment.findByIdAndDelete(moment._id);
  cleanupActivityNotifications(moment._id.toString()).catch(() => {});

  emitGroupActivity(groupId.toString(), "squad-moment-deleted", {
    momentId: moment._id,
  });

  return sendSuccess(res, { momentId: moment._id }, "Moment deleted successfully");
});

// @desc Toggle or switch reaction on a squad moment
// @route POST /api/groups/:id/moments/:momentId/react
const reactToMoment = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;
  const { emoji } = req.body;

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  if (!emoji || !MOMENT_REACTION_EMOJIS.includes(emoji)) {
    return sendError(
      res,
      `Invalid reaction emoji. Supported: ${MOMENT_REACTION_EMOJIS.join(" ")}`,
      400
    );
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId });
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const userIdStr = req.user._id.toString();
  const existingIndex = moment.reactions.findIndex(
    (r) => r.userId.toString() === userIdStr
  );

  let userReaction = null;

  if (existingIndex > -1) {
    if (moment.reactions[existingIndex].emoji === emoji) {
      // Toggle off (remove)
      moment.reactions.splice(existingIndex, 1);
      userReaction = null;
    } else {
      // Switch reaction to new emoji
      moment.reactions[existingIndex].emoji = emoji;
      moment.reactions[existingIndex].createdAt = new Date();
      userReaction = emoji;
    }
  } else {
    // Add new reaction
    moment.reactions.push({
      emoji,
      userId: req.user._id,
      createdAt: new Date(),
    });
    userReaction = emoji;
  }

  moment.reactionsCount = moment.reactions.length;
  await moment.save();

  // Compute breakdown
  const breakdown = {};
  moment.reactions.forEach((r) => {
    breakdown[r.emoji] = (breakdown[r.emoji] || 0) + 1;
  });

  emitGroupActivity(groupId.toString(), "squad-moment-reacted", {
    momentId: moment._id,
    userId: req.user._id,
    userName: req.user.name,
    emoji: userReaction,
  });

  return sendSuccess(
    res,
    {
      momentId: moment._id,
      userReaction,
      reactionsCount: moment.reactionsCount,
      reactionBreakdown: breakdown,
    },
    userReaction ? `Reacted with ${userReaction}` : "Reaction removed"
  );
});

// @desc Get comments for a squad moment
// @route GET /api/groups/:id/moments/:momentId/comments
const getMomentComments = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId }).select("_id").lean();
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const comments = await MomentComment.find({ momentId, groupId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .populate("authorId", "name profileImage email")
    .lean();

  return sendSuccess(res, { comments });
});

// @desc Add comment to a squad moment
// @route POST /api/groups/:id/moments/:momentId/comments
const addMomentComment = asyncHandler(async (req, res) => {
  const { momentId } = req.params;
  const groupId = req.group._id;
  const { text } = req.body;

  if (!mongoose.Types.ObjectId.isValid(momentId)) {
    return sendError(res, "Invalid moment ID", 400);
  }

  const trimmedText = String(text || "").trim();
  if (!trimmedText) {
    return sendError(res, "Comment text cannot be empty", 400);
  }
  if (trimmedText.length > 500) {
    return sendError(res, "Comment cannot exceed 500 characters", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId });
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const comment = await MomentComment.create({
    momentId: moment._id,
    groupId,
    authorId: req.user._id,
    text: trimmedText,
  });

  // Increment comments count on moment
  moment.commentsCount = (moment.commentsCount || 0) + 1;
  await moment.save();

  const populated = await MomentComment.findById(comment._id)
    .populate("authorId", "name profileImage email")
    .lean();

  emitGroupActivity(groupId.toString(), "squad-moment-commented", {
    momentId: moment._id,
    authorName: req.user.name,
    commentId: comment._id,
  });

  return sendSuccess(
    res,
    {
      comment: populated,
      commentsCount: moment.commentsCount,
    },
    "Comment posted!",
    201
  );
});

// @desc Delete a moment comment (comment author, moment author, or squad admin)
// @route DELETE /api/groups/:id/moments/:momentId/comments/:commentId
const deleteMomentComment = asyncHandler(async (req, res) => {
  const { momentId, commentId } = req.params;
  const groupId = req.group._id;

  if (!mongoose.Types.ObjectId.isValid(momentId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    return sendError(res, "Invalid ID parameter", 400);
  }

  const moment = await SquadMoment.findOne({ _id: momentId, groupId });
  if (!moment) {
    return sendError(res, "Squad moment not found", 404);
  }

  const comment = await MomentComment.findOne({ _id: commentId, momentId, groupId });
  if (!comment) {
    return sendError(res, "Comment not found", 404);
  }

  const isCommentAuthor = comment.authorId.toString() === req.user._id.toString();
  const isMomentAuthor = moment.authorId.toString() === req.user._id.toString();
  const isAdmin = req.membership && req.membership.role === "admin";

  if (!isCommentAuthor && !isMomentAuthor && !isAdmin) {
    return sendError(res, "Forbidden: You are not authorized to delete this comment", 403);
  }

  await MomentComment.findByIdAndDelete(comment._id);

  moment.commentsCount = Math.max(0, (moment.commentsCount || 1) - 1);
  await moment.save();

  return sendSuccess(
    res,
    {
      commentId: comment._id,
      commentsCount: moment.commentsCount,
    },
    "Comment deleted"
  );
});

module.exports = {
  serializeMoment,
  getMoments,
  getMomentById,
  createMoment,
  updateMoment,
  deleteMoment,
  reactToMoment,
  getMomentComments,
  addMomentComment,
  deleteMomentComment,
};
