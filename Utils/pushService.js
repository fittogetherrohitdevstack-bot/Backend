const webpush = require("web-push");
const config = require("../Config/env");
const PushSubscription = require("../Modals/PushSubscription");
const ReminderSetting = require("../Modals/ReminderSetting");
const { sendNativePushToUser } = require("../services/firebasePushService");
const { buildWebPushPayload, ensureVapidConfigured } = require("../services/webPushService");

const isPushCategoryEnabled = (setting, category) => {
  if (!setting) return true;
  if (setting.channels && setting.channels.push === false) return false;

  switch (category) {
    case "daily_reminder":
      return setting.dailyReminder?.enabled !== false;
    case "streak_risk":
      return setting.squadStreakAtRisk?.enabled !== false;
    case "nudge":
      return setting.nudges?.enabled !== false;
    case "challenge":
      return setting.challengeUpdates?.enabled !== false;
    case "recap":
      return setting.weeklyRecapReady?.enabled !== false;
    default:
      return true;
  }
};

/**
 * Sends a Web Push notification to all registered devices for a user,
 * respecting user preferences and removing expired (404/410) subscriptions.
 */
const sendPushToUser = async (
  userId,
  {
    title,
    body,
    url = "/",
    type = "general",
    category = "general",
    tag = "fittogether",
    image = "",
    icon = "/web-app-manifest-192x192.png",
    badge = "/favicon-96x96.png",
    activityId = "",
    senderName = "",
    senderImage = "",
    data = {},
  },
  deps = {}
) => {
  const sendFn = deps.sendNotification || webpush.sendNotification.bind(webpush);
  const subModel = deps.PushSubscription || PushSubscription;
  const settingModel = deps.ReminderSetting || ReminderSetting;
  const hasVapid = deps.forceVapid ? true : ensureVapidConfigured();

  if (!hasVapid) {
    console.warn("[Push] VAPID keys not configured, skipping web push");
    return { skipped: "vapid_not_configured", sent: 0, removed: 0 };
  }

  const setting = await settingModel.findOne({ userId }).lean();
  if (!isPushCategoryEnabled(setting, type)) {
    console.log(`[Push] User ${userId} has category ${type} disabled in reminderSettings`);
    return { skipped: "disabled_by_user", sent: 0, removed: 0 };
  }

  const subs = await subModel.find({ userId });
  if (!subs.length) {
    console.log(`[Push] No subscriptions found for user ${userId}`);
    return { skipped: "no_subscriptions", sent: 0, removed: 0 };
  }

  // Build universal multi-format payload
  const payloadObj = buildWebPushPayload({
    title,
    body,
    url,
    type,
    category,
    tag,
    image,
    icon,
    badge,
    activityId,
    senderName,
    senderImage,
    data,
  });

  const payload = JSON.stringify(payloadObj);

  console.log("[Push Dispatch Starting]", {
    eventType: type,
    recipientUserId: userId.toString(),
    deliveryChannel: "web_push",
    finalTitle: payloadObj.title,
    finalBody: payloadObj.body,
    subscriptionsCount: subs.length,
    payloadStructure: {
      rootTitle: payloadObj.title,
      rootBody: payloadObj.body,
      notificationTitle: payloadObj.notification.title,
      dataTitle: payloadObj.data.title,
      tag: payloadObj.tag,
      url: payloadObj.url,
    },
  });

  let sent = 0;
  let removed = 0;
  const expiredIds = [];

  for (const sub of subs) {
    try {
      const response = await sendFn(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime || null,
          keys: sub.keys,
        },
        payload
      );
      sent++;
      console.log("[Push Delivery Success]", {
        endpoint: sub.endpoint.substring(0, 50) + "...",
        statusCode: response?.statusCode || 201,
      });

      if (typeof sub.save === "function") {
        sub.lastUsedAt = new Date();
        await sub.save();
      }
    } catch (err) {
      const status = err?.statusCode;
      console.error("[Push Delivery Error]", {
        endpoint: sub.endpoint.substring(0, 50) + "...",
        statusCode: status,
        message: err.message,
      });

      if (status === 404 || status === 410) {
        expiredIds.push(sub._id);
        removed++;
      }
    }
  }

  if (expiredIds.length > 0) {
    await subModel.deleteMany({ _id: { $in: expiredIds } });
  }

  // Also dispatch to registered native mobile devices (Android/iOS)
  sendNativePushToUser(userId, {
    title: payloadObj.title,
    body: payloadObj.body,
    url,
    type,
    category,
    tag,
    image,
    activityId,
    data: {
      ...data,
      senderName,
      senderImage,
    },
  }).catch((err) => {
    console.warn("[Push] NativePush non-blocking error:", err.message);
  });

  return { sent, removed, total: subs.length };
};

module.exports = {
  ensureVapidConfigured,
  isPushCategoryEnabled,
  sendPushToUser,
};
