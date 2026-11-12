const FeedEvent = require("../Modals/FeedEvent");
const { FEED_REACTION_EMOJIS } = require("../Modals/FeedEvent");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const { getLocalDateString } = require("./date");
const { emitGroupActivity } = require("./socket");

/**
 * Formats a FeedEvent document for safe client display, stripping raw weight numbers
 * unless explicit permission is stored on the event or owner settings allow it.
 */
const serializeFeedEvent = (eventDoc, viewerUserId = null) => {
  const raw = typeof eventDoc.toObject === "function" ? eventDoc.toObject() : eventDoc;
  const userObj = raw.userId && typeof raw.userId === "object" ? raw.userId : null;
  const ownerId = userObj?._id ? userObj._id.toString() : raw.userId?.toString();
  const isOwner = Boolean(viewerUserId && ownerId && viewerUserId.toString() === ownerId);

  // Enforce default weight privacy unless owner explicitly opted in
  const showWeight =
    raw.type === "logged_weight" &&
    (userObj?.socialPrivacy?.showWeightInFeed === true || raw.meta?.showWeight === true);

  let title = raw.title;
  const safeMeta = { ...(raw.meta || {}) };
  if (raw.type === "logged_weight") {
    if (!showWeight) {
      delete safeMeta.weightKg;
      title = "logged weight ✅";
    } else if (safeMeta.weightKg && !title.includes("kg")) {
      title = `logged weight (${safeMeta.weightKg} kg) ✅`;
    }
  }

  // Group reaction counts by allowed emoji
  const reactionCounts = {};
  const myReactions = [];
  for (const emoji of FEED_REACTION_EMOJIS) {
    reactionCounts[emoji] = 0;
  }

  for (const r of raw.reactions || []) {
    if (reactionCounts[r.emoji] !== undefined) {
      reactionCounts[r.emoji] += 1;
      if (viewerUserId && r.userId?.toString() === viewerUserId.toString()) {
        myReactions.push(r.emoji);
      }
    }
  }

  return {
    _id: raw._id,
    groupId: raw.groupId,
    userId: ownerId,
    user: userObj
      ? {
          _id: userObj._id,
          name: userObj.name,
          profileImage: userObj.profileImage || "",
        }
      : { _id: ownerId, name: safeMeta.userName || "Squad Member", profileImage: "" },
    isOwner,
    type: raw.type,
    title,
    dateKey: raw.dateKey,
    meta: safeMeta,
    reactionCounts,
    myReactions,
    createdAt: raw.createdAt,
  };
};

/**
 * Persists a FeedEvent to every active squad the user belongs to (or a specific groupId)
 * and broadcasts over Socket.io so the squad feed updates live.
 */
const emitSquadFeedEvent = async ({
  userId,
  groupId = null,
  type,
  title,
  meta = {},
  dateKey = null,
  dedupeKey = null,
  weightKg = null,
}) => {
  const user = await User.findById(userId).select("name timezone socialPrivacy").lean();
  if (!user) return [];

  const effectiveDate = dateKey || getLocalDateString(new Date(), user.timezone || "Asia/Kolkata");
  const showWeightInFeed = Boolean(user.socialPrivacy?.showWeightInFeed);

  let resolvedTitle = title;
  const resolvedMeta = { ...meta, userName: user.name };

  if (type === "logged_weight") {
    if (showWeightInFeed && weightKg !== null && weightKg !== undefined) {
      resolvedMeta.weightKg = Number(weightKg);
      resolvedMeta.showWeight = true;
      resolvedTitle = `logged weight (${resolvedMeta.weightKg} kg) ✅`;
    } else {
      delete resolvedMeta.weightKg;
      resolvedMeta.showWeight = false;
      resolvedTitle = "logged weight ✅";
    }
  }

  let groupIds = [];
  if (groupId) {
    groupIds = [groupId];
  } else {
    const memberships = await Membership.find({ userId, status: "active" })
      .select("groupId")
      .lean();
    groupIds = memberships.map((m) => m.groupId);
  }

  const createdEvents = [];
  for (const gId of groupIds) {
    try {
      const docPayload = {
        groupId: gId,
        userId,
        type,
        title: resolvedTitle,
        dateKey: effectiveDate,
        meta: resolvedMeta,
        reactions: [],
      };
      if (dedupeKey) {
        docPayload.dedupeKey = dedupeKey;
      }

      const event = await FeedEvent.create(docPayload);
      createdEvents.push(event);

      emitGroupActivity(gId.toString(), "feed-event", serializeFeedEvent(event, null));
    } catch (err) {
      // Ignore duplicate dedupeKey conflicts (E11000) idempotently
      if (err?.code !== 11000) {
        console.warn("[Feed] Failed to emit FeedEvent:", err.message);
      }
    }
  }

  return createdEvents;
};

/**
 * Toggles a user's emoji reaction on a FeedEvent (one reaction per user per emoji type).
 */
const toggleFeedEventReaction = async ({ eventId, userId, emoji }) => {
  if (!FEED_REACTION_EMOJIS.includes(emoji)) {
    const err = new Error(`Invalid reaction emoji. Allowed: ${FEED_REACTION_EMOJIS.join(" ")}`);
    err.statusCode = 400;
    throw err;
  }

  const event = await FeedEvent.findById(eventId);
  if (!event) {
    const err = new Error("Feed event not found");
    err.statusCode = 404;
    throw err;
  }

  const existingIndex = event.reactions.findIndex(
    (r) => r.emoji === emoji && r.userId.toString() === userId.toString()
  );

  let reacted = false;
  if (existingIndex >= 0) {
    event.reactions.splice(existingIndex, 1);
    reacted = false;
  } else {
    event.reactions.push({ emoji, userId, createdAt: new Date() });
    reacted = true;
  }

  await event.save();
  await event.populate("userId", "name profileImage socialPrivacy");
  const serialized = serializeFeedEvent(event, userId);

  emitGroupActivity(event.groupId.toString(), "feed-reaction", {
    eventId: event._id,
    reactionCounts: serialized.reactionCounts,
  });

  return { event: serialized, reacted };
};

module.exports = {
  FEED_REACTION_EMOJIS,
  serializeFeedEvent,
  emitSquadFeedEvent,
  toggleFeedEventReaction,
};
