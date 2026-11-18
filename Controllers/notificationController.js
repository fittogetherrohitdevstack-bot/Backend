const mongoose = require("mongoose");
const Notification = require("../Modals/Notification");
const NotificationPreference = require("../Modals/NotificationPreference");
const ReminderSetting = require("../Modals/ReminderSetting");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");

// @desc Get user's notifications (paginated, excluding soft-deleted)
// @route GET /api/notifications?page=1&limit=20
const getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = {
    userId: req.user._id,
    isDeleted: { $ne: true },
  };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "name profileImage email")
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...query, readAt: null }),
  ]);

  const serialized = notifications.map((n) => ({
    ...n,
    senderName: n.senderId?.name || n.senderName || "",
    senderImage: n.senderId?.profileImage || n.senderImage || "",
    senderId: n.senderId?._id || n.senderId || null,
  }));

  return sendSuccess(res, {
    notifications: serialized,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      hasMore: skip + notifications.length < total,
    },
  });
});

// @desc Mark notification as read
// @route PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, "Invalid notification ID", 400);
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!notification) {
    return sendError(res, "Notification not found", 404);
  }

  return sendSuccess(res, { notification }, "Notification marked as read");
});

// @desc Mark all notifications as read
// @route PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, readAt: null, isDeleted: { $ne: true } },
    { $set: { readAt: new Date() } }
  );

  return sendSuccess(res, null, "All notifications marked as read");
});

// @desc Delete a single notification (soft-delete)
// @route DELETE /api/notifications/:id
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, "Invalid notification ID", 400);
  }

  const result = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { $set: { isDeleted: true } }
  );

  if (!result) {
    return sendError(res, "Notification not found", 404);
  }

  return sendSuccess(res, null, "Notification deleted");
});

// @desc Clear all read notifications
// @route DELETE /api/notifications
const clearReadNotifications = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, readAt: { $ne: null } },
    { $set: { isDeleted: true } }
  );

  return sendSuccess(res, null, "Read notifications cleared");
});

// @desc Get notification preferences
// @route GET /api/notifications/preferences
const getPreferences = asyncHandler(async (req, res) => {
  let pref = await NotificationPreference.findOne({ userId: req.user._id }).lean();
  if (!pref) {
    pref = await NotificationPreference.create({ userId: req.user._id });
  }

  // Also read channels from reminderSettings for completeness
  const reminderSetting = await ReminderSetting.findOne({ userId: req.user._id }).lean();

  return sendSuccess(res, {
    preferences: pref,
    channels: reminderSetting?.channels || { inApp: true, push: true },
  });
});

// @desc Update notification preferences
// @route PUT /api/notifications/preferences
const updatePreferences = asyncHandler(async (req, res) => {
  const allowedKeys = [
    "allPushEnabled",
    "mealNotifications",
    "dietUpdates",
    "waterLogging",
    "moments",
    "workoutCompletion",
    "achievements",
    "friendRequests",
    "chatNotifications",
    "scheduledReminders",
    "soundEnabled",
  ];

  const updateFields = {};
  allowedKeys.forEach((key) => {
    if (req.body[key] !== undefined) {
      updateFields[key] = Boolean(req.body[key]);
    }
  });

  const pref = await NotificationPreference.findOneAndUpdate(
    { userId: req.user._id },
    { $set: updateFields },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  // If allPushEnabled is set, sync with ReminderSetting channels.push
  if (req.body.allPushEnabled !== undefined) {
    await ReminderSetting.updateOne(
      { userId: req.user._id },
      { $set: { "channels.push": Boolean(req.body.allPushEnabled) } }
    );
  }

  return sendSuccess(res, { preferences: pref }, "Notification preferences updated");
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  getPreferences,
  updatePreferences,
};
