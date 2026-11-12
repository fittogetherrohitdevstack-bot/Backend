const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const NudgeLog = require("../Modals/NudgeLog");
const Notification = require("../Modals/Notification");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");
const { getSquadTodayMemberStatuses } = require("../Utils/streakService");
const { sendPushToUser } = require("../Utils/pushService");

// @desc Get "Who hasn't logged today?" strip for squad
// @route GET /api/groups/:id/today-status
const getSquadTodayStatus = asyncHandler(async (req, res) => {
  const summary = await getSquadTodayMemberStatuses(req.group._id, req.user._id);
  return sendSuccess(res, summary);
});

// @desc Nudge a pending squad member with rate limiting & mute support
// @route POST /api/groups/:id/nudge
const nudgeMember = asyncHandler(async (req, res) => {
  const { targetUserId, message } = req.body;
  const groupId = req.group._id;
  const senderId = req.user._id;

  if (!targetUserId) {
    return sendError(res, "targetUserId is required", 400);
  }

  if (targetUserId.toString() === senderId.toString()) {
    return sendError(res, "You can't nudge yourself — log something instead!", 400);
  }

  // Ensure receiver belongs to the same active squad
  const receiverMembership = await Membership.findOne({
    groupId,
    userId: targetUserId,
    status: "active",
  }).lean();

  if (!receiverMembership) {
    return sendError(res, "User is not an active member of this squad", 404);
  }

  const receiver = await User.findById(targetUserId).select("name timezone socialPrivacy").lean();
  if (!receiver) {
    return sendError(res, "Recipient not found", 404);
  }

  if (receiver.socialPrivacy?.allowNudges === false) {
    return sendError(res, `${receiver.name} has muted nudges in their settings.`, 400);
  }

  const receiverDate = getLocalDateString(new Date(), receiver.timezone || "Asia/Kolkata");

  // Rate limit 1: max 1 nudge per sender -> receiver per day
  const alreadyNudgedToday = await NudgeLog.countDocuments({
    senderId,
    receiverId: receiver._id,
    dateKey: receiverDate,
  });
  if (alreadyNudgedToday >= 1) {
    return sendError(res, `You already nudged ${receiver.name} today.`, 429);
  }

  // Rate limit 2: max 3 nudges received per user per day
  const receivedTodayCount = await NudgeLog.countDocuments({
    receiverId: receiver._id,
    dateKey: receiverDate,
  });
  if (receivedTodayCount >= 3) {
    return sendError(res, `${receiver.name} has already received 3 nudges today.`, 429);
  }

  const customNote = message ? String(message).trim().slice(0, 140) : "";
  await NudgeLog.create({
    groupId,
    senderId,
    receiverId: receiver._id,
    dateKey: receiverDate,
    message: customNote,
  });

  const title = `${req.user.name} nudged you 👋`;
  const body =
    customNote ||
    `Keep ${req.group.name}'s streak alive — log water, meals, or weight today!`;

  await Notification.create({
    userId: receiver._id,
    type: "nudge",
    title,
    body,
    data: {
      groupId,
      senderId,
      route: "/tracker",
    },
  });

  await sendPushToUser(receiver._id, {
    title,
    body,
    url: "/tracker",
    type: "nudge",
    tag: `nudge-${senderId}-${receiverDate}`,
  });

  const updated = await getSquadTodayMemberStatuses(groupId, senderId);
  return sendSuccess(res, updated, `Friendly nudge sent to ${receiver.name}!`, 201);
});

module.exports = {
  getSquadTodayStatus,
  nudgeMember,
};
