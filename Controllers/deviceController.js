const DeviceToken = require("../Modals/DeviceToken");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { sendNativePushToUser, isFirebaseConfigured } = require("../services/firebasePushService");

// @desc Register or update native mobile device token (FCM / APNs)
// @route POST /api/devices/register
const registerDevice = asyncHandler(async (req, res) => {
  const { installationId, platform, token, deviceModel, appVersion } = req.body;

  if (!installationId || !platform || !token) {
    return sendError(
      res,
      "installationId, platform (web/android/ios), and token are required",
      400
    );
  }

  if (!["web", "android", "ios"].includes(platform.toLowerCase())) {
    return sendError(res, "platform must be 'android', 'ios', or 'web'", 400);
  }

  const device = await DeviceToken.findOneAndUpdate(
    {
      userId: req.user._id,
      installationId: String(installationId).trim(),
    },
    {
      $set: {
        userId: req.user._id,
        installationId: String(installationId).trim(),
        platform: platform.toLowerCase(),
        token: String(token).trim(),
        active: true,
        deviceModel: String(deviceModel || ""),
        appVersion: String(appVersion || ""),
        lastUsedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return sendSuccess(
    res,
    { deviceId: device._id, platform: device.platform, active: device.active },
    "Device registered for notifications",
    201
  );
});

// @desc Deactivate or remove device token on logout
// @route POST /api/devices/unregister
const unregisterDevice = asyncHandler(async (req, res) => {
  const { installationId, token } = req.body;

  const query = { userId: req.user._id };
  if (installationId) {
    query.installationId = String(installationId).trim();
  } else if (token) {
    query.token = String(token).trim();
  }

  await DeviceToken.updateMany(query, { $set: { active: false } });

  return sendSuccess(res, null, "Device unregistered from notifications");
});

// @desc Send test native notification to current user's registered devices
// @route POST /api/devices/test
const sendTestNativeNotification = asyncHandler(async (req, res) => {
  if (!isFirebaseConfigured()) {
    return sendError(
      res,
      "Firebase Admin credentials are not yet configured on the server. Please add FIREBASE_SERVICE_ACCOUNT or credentials to .env.",
      503
    );
  }

  const result = await sendNativePushToUser(req.user._id, {
    title: "FitTogether Mobile Push 🔥",
    body: "Your native notification channel is connected and ready!",
    url: "/",
    type: "general",
    category: "general",
    tag: "fittogether-mobile-test",
    activityId: "test",
  });

  if (result.skipped === "no_active_devices") {
    return sendError(
      res,
      "No active mobile devices registered for this user yet.",
      400
    );
  }

  return sendSuccess(res, result, "Test native push sent");
});

module.exports = {
  registerDevice,
  unregisterDevice,
  sendTestNativeNotification,
};
