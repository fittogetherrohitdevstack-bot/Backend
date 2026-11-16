const mongoose = require("mongoose");
const Message = require("../Modals/Message");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const { createAndDispatchNotification } = require("./notificationService");
const { isUserActiveInSquadChat } = require("../Sockets");

const ALLOWED_EMOJIS = ["❤️", "🔥", "💪", "😂", "👍", "👏"];

/**
 * Validates whether a user is an active member of a group.
 */
const validateSquadMembership = async (groupId, userId) => {
  if (!groupId || !userId) return { isMember: false };
  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return { isMember: false };
  }

  const membership = await Membership.findOne({
    groupId,
    userId,
    status: "active",
  }).lean();

  if (!membership) {
    return { isMember: false };
  }

  return {
    isMember: true,
    role: membership.role, // 'admin' | 'member'
    membership,
  };
};

/**
 * Format message for API response (safe serialization, soft-delete masking)
 */
const formatMessage = (msg, currentUserId = null) => {
  const isDeleted = Boolean(msg.deletedAt);
  const sender = msg.senderId || {};
  const reply = msg.replyTo || null;

  return {
    _id: msg._id,
    groupId: msg.groupId,
    sender: {
      _id: sender._id || sender,
      name: sender.name || "Squadmate",
      profileImage: sender.profileImage || "",
    },
    text: isDeleted ? "This message was deleted" : msg.text,
    messageType: msg.messageType || "text",
    isDeleted,
    editedAt: msg.editedAt || null,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
    reactions: (msg.reactions || []).map((r) => ({
      emoji: r.emoji,
      userId: r.userId,
      createdAt: r.createdAt,
    })),
    replyTo: reply
      ? {
          _id: reply._id,
          text: reply.deletedAt ? "This message was deleted" : reply.text,
          senderName: reply.senderId?.name || "Squadmate",
          isDeleted: Boolean(reply.deletedAt),
        }
      : null,
    readByCount: (msg.readBy || []).length,
    isReadByMe: currentUserId
      ? (msg.readBy || []).some((r) => String(r.userId) === String(currentUserId))
      : false,
    isMine: currentUserId ? String(sender._id || sender) === String(currentUserId) : false,
  };
};

/**
 * Retrieve paginated message history for a Squad
 */
const getSquadMessages = async ({ groupId, userId, before = null, limit = 30 }) => {
  const { isMember } = await validateSquadMembership(groupId, userId);
  if (!isMember) {
    throw new Error("UNAUTHORIZED_SQUAD_ACCESS");
  }

  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 30));
  const query = { groupId };

  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    }
  }

  const rawMessages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .populate("senderId", "name profileImage email")
    .populate({
      path: "replyTo",
      select: "text senderId deletedAt",
      populate: { path: "senderId", select: "name profileImage" },
    })
    .lean();

  // Return chronological order (oldest to newest)
  const messages = rawMessages.reverse().map((m) => formatMessage(m, userId));

  // Asynchronously mark fetched unread messages as read by this user
  if (messages.length > 0) {
    markSquadAsRead({ groupId, userId }).catch(() => {});
  }

  return {
    messages,
    hasMore: rawMessages.length === parsedLimit,
    oldestTimestamp: messages.length > 0 ? messages[0].createdAt : null,
    latestTimestamp: messages.length > 0 ? messages[messages.length - 1].createdAt : null,
  };
};

/**
 * Send a new Squad Chat message
 */
const sendMessage = async ({ groupId, userId, text, replyToId = null, messageType = "text" }, socketEmitter = null) => {
  const { isMember } = await validateSquadMembership(groupId, userId);
  if (!isMember) {
    throw new Error("UNAUTHORIZED_SQUAD_ACCESS");
  }

  const trimmedText = String(text || "").trim();
  if (!trimmedText) {
    throw new Error("EMPTY_MESSAGE");
  }
  if (trimmedText.length > 2000) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  let verifiedReplyId = null;
  if (replyToId && mongoose.Types.ObjectId.isValid(replyToId)) {
    const parentMsg = await Message.findOne({ _id: replyToId, groupId }).lean();
    if (parentMsg) {
      verifiedReplyId = parentMsg._id;
    }
  }

  // Persist in MongoDB
  const newMsg = await Message.create({
    groupId,
    senderId: userId,
    text: trimmedText,
    messageType: messageType || "text",
    replyTo: verifiedReplyId,
    reactions: [],
    readBy: [{ userId, readAt: new Date() }],
  });

  const populated = await Message.findById(newMsg._id)
    .populate("senderId", "name profileImage email")
    .populate({
      path: "replyTo",
      select: "text senderId deletedAt",
      populate: { path: "senderId", select: "name profileImage" },
    })
    .lean();

  const formatted = formatMessage(populated, userId);

  // Real-time broadcast via Socket.io
  if (socketEmitter) {
    socketEmitter(groupId, "chat:message", formatted);
  }

  // Dispatch push / in-app notifications to squadmates not actively in the chat room
  dispatchChatNotifications({
    groupId,
    senderId: userId,
    senderName: populated.senderId?.name || "Squadmate",
    senderImage: populated.senderId?.profileImage || "",
    text: trimmedText,
    messageId: newMsg._id.toString(),
  }).catch((err) => {
    console.warn("[ChatService] Notification dispatch error:", err.message);
  });

  return formatted;
};

/**
 * Edit an existing message (author only)
 */
const editMessage = async ({ messageId, userId, newText }, socketEmitter = null) => {
  if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new Error("INVALID_MESSAGE_ID");
  }

  const trimmedText = String(newText || "").trim();
  if (!trimmedText) {
    throw new Error("EMPTY_MESSAGE");
  }
  if (trimmedText.length > 2000) {
    throw new Error("MESSAGE_TOO_LONG");
  }

  const msg = await Message.findById(messageId);
  if (!msg) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  if (String(msg.senderId) !== String(userId)) {
    throw new Error("UNAUTHORIZED_EDIT");
  }

  if (msg.deletedAt) {
    throw new Error("CANNOT_EDIT_DELETED_MESSAGE");
  }

  msg.text = trimmedText;
  msg.editedAt = new Date();
  await msg.save();

  const populated = await Message.findById(msg._id)
    .populate("senderId", "name profileImage email")
    .populate({
      path: "replyTo",
      select: "text senderId deletedAt",
      populate: { path: "senderId", select: "name profileImage" },
    })
    .lean();

  const formatted = formatMessage(populated, userId);

  if (socketEmitter) {
    socketEmitter(msg.groupId, "chat:message_updated", formatted);
  }

  return formatted;
};

/**
 * Delete a message (author or group admin)
 */
const deleteMessage = async ({ messageId, userId }, socketEmitter = null) => {
  if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new Error("INVALID_MESSAGE_ID");
  }

  const msg = await Message.findById(messageId);
  if (!msg) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  const { isMember, role } = await validateSquadMembership(msg.groupId, userId);
  if (!isMember) {
    throw new Error("UNAUTHORIZED_SQUAD_ACCESS");
  }

  const isAuthor = String(msg.senderId) === String(userId);
  const isAdmin = role === "admin";

  if (!isAuthor && !isAdmin) {
    throw new Error("UNAUTHORIZED_DELETE");
  }

  msg.deletedAt = new Date();
  msg.text = "This message was deleted";
  await msg.save();

  const populated = await Message.findById(msg._id)
    .populate("senderId", "name profileImage email")
    .populate({
      path: "replyTo",
      select: "text senderId deletedAt",
      populate: { path: "senderId", select: "name profileImage" },
    })
    .lean();

  const formatted = formatMessage(populated, userId);

  if (socketEmitter) {
    socketEmitter(msg.groupId, "chat:message_deleted", formatted);
  }

  return formatted;
};

/**
 * Toggle an emoji reaction on a message
 */
const toggleReaction = async ({ messageId, userId, emoji }, socketEmitter = null) => {
  if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
    throw new Error("INVALID_MESSAGE_ID");
  }

  const cleanEmoji = String(emoji || "").trim();
  if (!ALLOWED_EMOJIS.includes(cleanEmoji)) {
    throw new Error("INVALID_EMOJI");
  }

  const msg = await Message.findById(messageId);
  if (!msg) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  const { isMember } = await validateSquadMembership(msg.groupId, userId);
  if (!isMember) {
    throw new Error("UNAUTHORIZED_SQUAD_ACCESS");
  }

  if (msg.deletedAt) {
    throw new Error("CANNOT_REACT_TO_DELETED_MESSAGE");
  }

  // Find if user already reacted with this emoji
  const existingIdx = msg.reactions.findIndex(
    (r) => String(r.userId) === String(userId) && r.emoji === cleanEmoji
  );

  if (existingIdx > -1) {
    // Remove reaction (toggle off)
    msg.reactions.splice(existingIdx, 1);
  } else {
    // Add reaction
    msg.reactions.push({
      emoji: cleanEmoji,
      userId,
      createdAt: new Date(),
    });
  }

  await msg.save();

  const reactionData = {
    messageId: msg._id,
    groupId: msg.groupId,
    reactions: msg.reactions.map((r) => ({
      emoji: r.emoji,
      userId: r.userId,
      createdAt: r.createdAt,
    })),
  };

  if (socketEmitter) {
    socketEmitter(msg.groupId, "chat:reaction_updated", reactionData);
  }

  return reactionData;
};

/**
 * Mark all unread messages in a squad as read by the user
 */
const markSquadAsRead = async ({ groupId, userId }, socketEmitter = null) => {
  if (!groupId || !userId) return { marked: 0 };

  const res = await Message.updateMany(
    {
      groupId,
      deletedAt: null,
      "readBy.userId": { $ne: userId },
    },
    {
      $addToSet: {
        readBy: { userId, readAt: new Date() },
      },
    }
  );

  if (socketEmitter && res.modifiedCount > 0) {
    socketEmitter(groupId, "chat:read_updated", {
      groupId,
      userId,
      readAt: new Date().toISOString(),
    });
  }

  return { marked: res.modifiedCount };
};

/**
 * Get unread chat message counts across all squads for a user
 */
const getUnreadCounts = async (userId) => {
  if (!userId) return { totalUnread: 0, bySquad: {} };

  // Find all active memberships
  const memberships = await Membership.find({ userId, status: "active" }).select("groupId").lean();
  const groupIds = memberships.map((m) => m.groupId);

  if (!groupIds.length) {
    return { totalUnread: 0, bySquad: {} };
  }

  // Aggregate unread count per groupId
  const unreadCounts = await Message.aggregate([
    {
      $match: {
        groupId: { $in: groupIds },
        deletedAt: null,
        "readBy.userId": { $ne: new mongoose.Types.ObjectId(userId) },
        senderId: { $ne: new mongoose.Types.ObjectId(userId) },
      },
    },
    {
      $group: {
        _id: "$groupId",
        count: { $sum: 1 },
      },
    },
  ]);

  const bySquad = {};
  let totalUnread = 0;

  unreadCounts.forEach((item) => {
    const sId = item._id.toString();
    bySquad[sId] = item.count;
    totalUnread += item.count;
  });

  return { totalUnread, bySquad };
};

/**
 * Get Squad chat info (metadata, member list, online count)
 */
const getSquadChatInfo = async ({ groupId, userId }) => {
  const { isMember } = await validateSquadMembership(groupId, userId);
  if (!isMember) {
    throw new Error("UNAUTHORIZED_SQUAD_ACCESS");
  }

  const group = await Group.findById(groupId).lean();
  if (!group) {
    throw new Error("SQUAD_NOT_FOUND");
  }

  const memberships = await Membership.find({ groupId, status: "active" })
    .populate("userId", "name email profileImage currentStreak")
    .lean();

  const members = memberships.map((m) => ({
    _id: m.userId?._id,
    name: m.userId?.name || "Squadmate",
    email: m.userId?.email || "",
    profileImage: m.userId?.profileImage || "",
    currentStreak: m.userId?.currentStreak || 0,
    role: m.role,
    joinedAt: m.joinedAt,
    isOnline: false, // populated dynamically via socket room inspection if available
  }));

  return {
    _id: group._id,
    name: group.name,
    description: group.description || "",
    inviteCode: group.inviteCode,
    currentStreak: group.currentStreak || 0,
    totalMembers: members.length,
    members,
  };
};

/**
 * Dispatches push & in-app notifications for a new chat message
 */
const dispatchChatNotifications = async ({ groupId, senderId, senderName, senderImage, text, messageId }) => {
  const group = await Group.findById(groupId).select("name").lean();
  if (!group) return;

  const peerMemberships = await Membership.find({
    groupId,
    userId: { $ne: senderId },
    status: "active",
  }).select("userId").lean();

  const previewText = text.length > 90 ? text.slice(0, 87) + "..." : text;

  for (const peer of peerMemberships) {
    const recipientId = peer.userId.toString();

    // Check if user is currently active in this squad's chat room (suppress duplicate push)
    if (typeof isUserActiveInSquadChat === "function" && isUserActiveInSquadChat(groupId.toString(), recipientId)) {
      continue;
    }

    createAndDispatchNotification({
      recipientUserId: recipientId,
      senderId,
      senderName,
      senderImage,
      type: "chat_message",
      category: "chat",
      title: `${senderName} in ${group.name}`,
      body: previewText,
      url: `/chat/${groupId}`,
      tag: `fittogether-chat-${groupId}`,
      activityId: messageId,
      data: {
        groupId: groupId.toString(),
        squadName: group.name,
        messageId,
      },
    }).catch(() => {});
  }
};

module.exports = {
  ALLOWED_EMOJIS,
  validateSquadMembership,
  formatMessage,
  getSquadMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markSquadAsRead,
  getUnreadCounts,
  getSquadChatInfo,
  dispatchChatNotifications,
};
