const webpush = require("web-push");
const config = require("../Config/env");
const PushSubscription = require("../Modals/PushSubscription");
const ReminderSetting = require("../Modals/ReminderSetting");

let vapidConfigured = false;

const ensureVapidConfigured = () => {
  if (vapidConfigured) return true;
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      config.VAPID_SUBJECT || "mailto:support@fittogether.app",
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
    return true;
  }
  return false;
};

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
  { title, body, url = "/", type = "general", tag = "fittogether", data = {} },
  deps = {}
) => {
  const sendFn = deps.sendNotification || webpush.sendNotification.bind(webpush);
  const subModel = deps.PushSubscription || PushSubscription;
  const settingModel = deps.ReminderSetting || ReminderSetting;
  const hasVapid = deps.forceVapid ? true : ensureVapidConfigured();

  if (!hasVapid) {
    return { skipped: "vapid_not_configured", sent: 0, removed: 0 };
  }

  const setting = await settingModel.findOne({ userId }).lean();
  if (!isPushCategoryEnabled(setting, type)) {
    return { skipped: "disabled_by_user", sent: 0, removed: 0 };
  }

  const subs = await subModel.find({ userId });
  if (!subs.length) {
    return { skipped: "no_subscriptions", sent: 0, removed: 0 };
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    type,
    tag,
    icon: "/web-app-manifest-192x192.png",
    badge: "/favicon-96x96.png",
    data: { ...data, url, type },
  });

  let sent = 0;
  let removed = 0;
  const expiredIds = [];

  for (const sub of subs) {
    try {
      await sendFn(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime || null,
          keys: sub.keys,
        },
        payload
      );
      sent++;
      if (typeof sub.save === "function") {
        sub.lastUsedAt = new Date();
        await sub.save();
      }
    } catch (err) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        expiredIds.push(sub._id);
        removed++;
      } else {
        console.warn(`[Push] Failed delivery (${status || err.message}):`, sub.endpoint);
      }
    }
  }

  if (expiredIds.length > 0) {
    await subModel.deleteMany({ _id: { $in: expiredIds } });
  }

  return { sent, removed };
};

module.exports = {
  ensureVapidConfigured,
  isPushCategoryEnabled,
  sendPushToUser,
};
