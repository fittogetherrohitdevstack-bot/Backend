const config = require("../Config/env");
const PushSubscription = require("../Modals/PushSubscription");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { sendPushToUser } = require("../Utils/pushService");

// @desc Get public VAPID key for Web Push subscription
// @route GET /api/push/vapid-key
const getVapidPublicKey = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    publicKey: config.VAPID_PUBLIC_KEY || "",
    configured: Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY),
  });
});

// @desc Register / update Web Push subscription for current user
// @route POST /api/push/subscribe
const subscribePush = asyncHandler(async (req, res) => {
  const { subscription, userAgent } = req.body;
  const subObj = subscription || req.body;

  if (!subObj?.endpoint || !subObj?.keys?.p256dh || !subObj?.keys?.auth) {
    return sendError(res, "Valid Web Push subscription object is required", 400);
  }

  const saved = await PushSubscription.findOneAndUpdate(
    { endpoint: subObj.endpoint },
    {
      $set: {
        userId: req.user._id,
        endpoint: subObj.endpoint,
        expirationTime: subObj.expirationTime || null,
        keys: {
          p256dh: subObj.keys.p256dh,
          auth: subObj.keys.auth,
        },
        userAgent: userAgent || req.headers["user-agent"] || "",
        lastUsedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return sendSuccess(res, { subscriptionId: saved._id }, "Push notifications subscribed", 201);
});

// @desc Unregister a device push subscription
// @route POST /api/push/unsubscribe
const unsubscribePush = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    await PushSubscription.deleteOne({ userId: req.user._id, endpoint });
  } else {
    await PushSubscription.deleteMany({ userId: req.user._id });
  }
  return sendSuccess(res, null, "Push subscription removed");
});

// @desc Send test push notification to current user's subscribed devices
// @route POST /api/push/test
const sendTestPush = asyncHandler(async (req, res) => {
  const customTitle = req.body?.title;
  const customBody = req.body?.body;

  const title = customTitle || "FitTogether Push Ready 🔥";
  const body = customBody || "Squad nudges, streak reminders, and Sunday recaps are connected!";
  const url = req.body?.url || "/";
  const type = req.body?.type || "general";
  const tag = req.body?.tag || "fittogether-test";

  console.log("[PushController] /api/push/test initiated for user:", req.user._id, {
    title,
    body,
    url,
  });

  const result = await sendPushToUser(req.user._id, {
    title,
    body,
    url,
    type,
    tag,
    data: req.body?.data || {},
  });

  if (result.skipped === "vapid_not_configured") {
    return sendError(
      res,
      "VAPID keys are not configured on the backend yet. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env.",
      503
    );
  }
  if (result.skipped === "no_subscriptions") {
    return sendError(res, "No push-enabled browser/device subscribed for this account yet.", 400);
  }

  return sendSuccess(res, result, "Test push notification sent successfully");
});

module.exports = {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  sendTestPush,
};
