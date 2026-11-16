const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const chatService = require("../services/chatService");
const { emitSquadChat } = require("../Utils/socket");
const Membership = require("../Modals/Membership");
const Group = require("../Modals/Group");
const Message = require("../Modals/Message");
const { getOnlineSquadMembers } = require("../Sockets");

// Helper to bridge chatService and Socket.IO
const socketEmitter = (groupId, eventName, payload) => {
  emitSquadChat(groupId, eventName, payload);
};

// @desc Get all squads of current user with latest message snippet and unread counts
// @route GET /api/chat/squads
const getUserSquads = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const memberships = await Membership.find({ userId, status: "active" })
    .populate("groupId")
    .lean();

  const validMemberships = memberships.filter((m) => m.groupId && m.groupId.isActive !== false);

  const squadList = await Promise.all(
    validMemberships.map(async (m) => {
      const g = m.groupId;

      // Get latest message in this squad
      const lastMsg = await Message.findOne({ groupId: g._id })
        .sort({ createdAt: -1 })
        .populate("senderId", "name profileImage")
        .lean();

      // Count unread messages for this user in this squad
      const unreadCount = await Message.countDocuments({
        groupId: g._id,
        deletedAt: null,
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId },
      });

      // Total members count
      const totalMembers = await Membership.countDocuments({
        groupId: g._id,
        status: "active",
      });

      // Online count
      const onlineMembers = getOnlineSquadMembers(g._id.toString());

      return {
        _id: g._id,
        name: g.name,
        description: g.description || "",
        inviteCode: g.inviteCode,
        currentStreak: g.currentStreak || 0,
        myRole: m.role,
        totalMembers,
        onlineCount: onlineMembers.length,
        unreadCount,
        lastMessage: lastMsg
          ? {
              _id: lastMsg._id,
              text: lastMsg.deletedAt ? "This message was deleted" : lastMsg.text,
              senderName: lastMsg.senderId?.name || "Squadmate",
              senderImage: lastMsg.senderId?.profileImage || "",
              createdAt: lastMsg.createdAt,
              isDeleted: Boolean(lastMsg.deletedAt),
            }
          : null,
      };
    })
  );

  // Sort squads by latest activity (or creation date)
  squadList.sort((a, b) => {
    const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return timeB - timeA;
  });

  return sendSuccess(res, squadList, "User squads retrieved successfully");
});

// @desc Get message history for a Squad (paginated, latest 30 by default)
// @route GET /api/chat/squads/:squadId/messages
const getMessages = asyncHandler(async (req, res) => {
  const { squadId } = req.params;
  const { before, limit } = req.query;

  try {
    const result = await chatService.getSquadMessages({
      groupId: squadId,
      userId: req.user._id,
      before,
      limit,
    });
    return sendSuccess(res, result, "Messages retrieved successfully");
  } catch (err) {
    if (err.message === "UNAUTHORIZED_SQUAD_ACCESS") {
      return sendError(res, "You are not an active member of this squad", 403);
    }
    return sendError(res, err.message, 400);
  }
});

// @desc Send a message in a Squad
// @route POST /api/chat/squads/:squadId/messages
const sendMessage = asyncHandler(async (req, res) => {
  const { squadId } = req.params;
  const { text, replyToId, messageType } = req.body;

  try {
    const result = await chatService.sendMessage(
      {
        groupId: squadId,
        userId: req.user._id,
        text,
        replyToId,
        messageType,
      },
      socketEmitter
    );
    return sendSuccess(res, result, "Message sent successfully", 201);
  } catch (err) {
    if (err.message === "UNAUTHORIZED_SQUAD_ACCESS") {
      return sendError(res, "You are not an active member of this squad", 403);
    }
    if (err.message === "EMPTY_MESSAGE") {
      return sendError(res, "Message text cannot be empty", 400);
    }
    if (err.message === "MESSAGE_TOO_LONG") {
      return sendError(res, "Message cannot exceed 2000 characters", 400);
    }
    return sendError(res, err.message, 400);
  }
});

// @desc Edit an existing message
// @route PATCH /api/chat/messages/:messageId
const editMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { text } = req.body;

  try {
    const result = await chatService.editMessage(
      {
        messageId,
        userId: req.user._id,
        newText: text,
      },
      socketEmitter
    );
    return sendSuccess(res, result, "Message updated successfully");
  } catch (err) {
    if (err.message === "UNAUTHORIZED_EDIT") {
      return sendError(res, "You can only edit your own messages", 403);
    }
    if (err.message === "CANNOT_EDIT_DELETED_MESSAGE") {
      return sendError(res, "Cannot edit a deleted message", 400);
    }
    if (err.message === "MESSAGE_NOT_FOUND") {
      return sendError(res, "Message not found", 404);
    }
    return sendError(res, err.message, 400);
  }
});

// @desc Soft-delete a message
// @route DELETE /api/chat/messages/:messageId
const deleteMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;

  try {
    const result = await chatService.deleteMessage(
      {
        messageId,
        userId: req.user._id,
      },
      socketEmitter
    );
    return sendSuccess(res, result, "Message deleted successfully");
  } catch (err) {
    if (err.message === "UNAUTHORIZED_DELETE") {
      return sendError(res, "You are not authorized to delete this message", 403);
    }
    if (err.message === "MESSAGE_NOT_FOUND") {
      return sendError(res, "Message not found", 404);
    }
    return sendError(res, err.message, 400);
  }
});

// @desc Toggle an emoji reaction on a message
// @route POST /api/chat/messages/:messageId/reactions
const toggleReaction = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;

  try {
    const result = await chatService.toggleReaction(
      {
        messageId,
        userId: req.user._id,
        emoji,
      },
      socketEmitter
    );
    return sendSuccess(res, result, "Reaction updated successfully");
  } catch (err) {
    if (err.message === "INVALID_EMOJI") {
      return sendError(res, `Invalid emoji. Supported: ${chatService.ALLOWED_EMOJIS.join(" ")}`, 400);
    }
    if (err.message === "UNAUTHORIZED_SQUAD_ACCESS") {
      return sendError(res, "You are not an active member of this squad", 403);
    }
    if (err.message === "MESSAGE_NOT_FOUND") {
      return sendError(res, "Message not found", 404);
    }
    return sendError(res, err.message, 400);
  }
});

// @desc Mark all messages in a squad as read
// @route POST /api/chat/squads/:squadId/read
const markSquadAsRead = asyncHandler(async (req, res) => {
  const { squadId } = req.params;

  const result = await chatService.markSquadAsRead(
    {
      groupId: squadId,
      userId: req.user._id,
    },
    socketEmitter
  );

  return sendSuccess(res, result, "Squad messages marked as read");
});

// @desc Get global unread message counts across all squads
// @route GET /api/chat/unread-counts
const getUnreadCounts = asyncHandler(async (req, res) => {
  const result = await chatService.getUnreadCounts(req.user._id);
  return sendSuccess(res, result, "Unread counts retrieved");
});

// @desc Get squad chat info (metadata, roster, online count)
// @route GET /api/chat/squads/:squadId/info
const getSquadChatInfo = asyncHandler(async (req, res) => {
  const { squadId } = req.params;

  try {
    const result = await chatService.getSquadChatInfo({
      groupId: squadId,
      userId: req.user._id,
    });

    const onlineUserIds = getOnlineSquadMembers(squadId);
    result.members.forEach((m) => {
      m.isOnline = onlineUserIds.includes(String(m._id));
    });
    result.onlineCount = onlineUserIds.length;

    return sendSuccess(res, result, "Squad chat info retrieved");
  } catch (err) {
    if (err.message === "UNAUTHORIZED_SQUAD_ACCESS") {
      return sendError(res, "You are not an active member of this squad", 403);
    }
    return sendError(res, err.message, 400);
  }
});

module.exports = {
  getUserSquads,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markSquadAsRead,
  getUnreadCounts,
  getSquadChatInfo,
};
