const webpush = require("web-push");
const config = require("../Config/env");
const PushSubscription = require("../Modals/PushSubscription");

let vapidConfigured = false;

const ensureVapidConfigured = () => {
  if (vapidConfigured) return true;
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(
        config.VAPID_SUBJECT || "mailto:support@fittogether.app",
        config.VAPID_PUBLIC_KEY,
        config.VAPID_PRIVATE_KEY
      );
      vapidConfigured = true;
      return true;
    } catch (e) {
      console.warn("[WebPush] VAPID configuration error:", e.message);
      return false;
    }
  }
  return false;
};

/**
 * Send a rich Web Push notification to all browser subscriptions for a user.
 */
const sendWebPushToUser = async (
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
  const hasVapid = deps.forceVapid ? true : ensureVapidConfigured();

  if (!hasVapid) {
    return { skipped: "vapid_not_configured", sent: 0, removed: 0 };
  }

  const subs = await subModel.find({ userId });
  if (!subs.length) {
    return { skipped: "no_subscriptions", sent: 0, removed: 0 };
  }

  // Build complete rich JSON payload
  const payloadObj = {
    title: String(title || "FitTogether"),
    body: String(body || ""),
    icon: icon || "/web-app-manifest-192x192.png",
    badge: badge || "/favicon-96x96.png",
    tag: String(tag || `fittogether-${type}`),
    category: String(category || "general"),
    type: String(type || "general"),
    timestamp: Date.now(),
    url: String(url || "/"),
    data: {
      ...data,
      url: String(url || "/"),
      type: String(type || "general"),
      category: String(category || "general"),
      activityId: String(activityId || ""),
      senderName: String(senderName || ""),
      senderImage: String(senderImage || ""),
    },
  };

  if (image) {
    payloadObj.image = image;
    payloadObj.data.image = image;
  }

  const payload = JSON.stringify(payloadObj);

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
        console.warn(`[WebPush] Failed delivery (${status || err.message}):`, sub.endpoint);
      }
    }
  }

  if (expiredIds.length > 0) {
    await subModel.deleteMany({ _id: { $in: expiredIds } });
  }

  return { sent, removed, total: subs.length };
};

module.exports = {
  ensureVapidConfigured,
  sendWebPushToUser,
};
