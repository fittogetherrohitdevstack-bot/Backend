const mongoose = require("mongoose");
const FeedEvent = require("../Modals/FeedEvent");
const Membership = require("../Modals/Membership");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  serializeFeedEvent,
  toggleFeedEventReaction,
} = require("../Utils/feedService");

// @desc Get paginated squad activity feed (cursor-based)
// @route GET /api/groups/:id/feed?cursor=<lastId>&limit=15
const getGroupFeed = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const limit = Math.min(30, Math.max(5, Number(req.query.limit) || 15));
  const cursor = req.query.cursor ? String(req.query.cursor).trim() : null;

  const query = { groupId };
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const rows = await FeedEvent.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("userId", "name profileImage socialPrivacy");

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id.toString() : null;

  return sendSuccess(res, {
    events: items.map((e) => serializeFeedEvent(e, req.user._id)),
    nextCursor,
    hasMore,
  });
});

// @desc Toggle emoji reaction on a feed event
// @route POST /api/feed/:eventId/react
const reactToFeedEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { emoji } = req.body;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return sendError(res, "Invalid feed event ID", 400);
  }

  const targetEvent = await FeedEvent.findById(eventId).select("groupId").lean();
  if (!targetEvent) {
    return sendError(res, "Feed event not found", 404);
  }

  // Enforce squad isolation: only members of the event's squad can react
  const membership = await Membership.findOne({
    groupId: targetEvent.groupId,
    userId: req.user._id,
    status: "active",
  }).lean();

  if (!membership) {
    return sendError(res, "Forbidden: you must be a member of this squad to react", 403);
  }

  const result = await toggleFeedEventReaction({
    eventId,
    userId: req.user._id,
    emoji,
  });

  return sendSuccess(res, result, result.reacted ? "Reaction added" : "Reaction removed");
});

module.exports = {
  getGroupFeed,
  reactToFeedEvent,
};
