const Notification = require("../Modals/Notification");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");

// @desc Get user's notifications
// @route GET /api/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    readAt: null,
  });

  return sendSuccess(res, {
    notifications,
    unreadCount,
  });
});

// @desc Mark notification as read
// @route PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
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
    { userId: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return sendSuccess(res, null, "All notifications marked as read");
});

// @desc Update reminder preferences
// @route PUT /api/notifications/preferences
const updatePreferences = asyncHandler(async (req, res) => {
  // In-app preference echo
  const preferences = req.body;
  return sendSuccess(res, { preferences }, "Reminder preferences updated");
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  updatePreferences,
};
