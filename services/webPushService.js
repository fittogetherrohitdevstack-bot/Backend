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
 * Builds a universal push payload conforming to all client expectations:
 * - Direct root attributes (title, body, icon, badge, tag, url, data)
 * - FCM Web Push nested structure (notification: { title, body, icon, ... })
 * - Data-only structure (data: { title, body, ... })
 */
const buildWebPushPayload = ({
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
}) => {
  const finalTitle = String(title || "FitTogether");
  const finalBody = String(body || "Time to keep your squad streak burning!");
  const finalIcon = icon || "/web-app-manifest-192x192.png";
  const finalBadge = badge || "/favicon-96x96.png";
  const finalTag = String(tag || `fittogether-${type}`);
  const finalUrl = String(url || "/");

  const commonData = {
    ...data,
    title: finalTitle,
    body: finalBody,
    url: finalUrl,
    type: String(type || "general"),
    category: String(category || "general"),
    activityId: String(activityId || ""),
    senderName: String(senderName || ""),
    senderImage: String(senderImage || ""),
    tag: finalTag,
    icon: finalIcon,
    badge: finalBadge,
  };

  if (image) commonData.image = image;

  const payloadObj = {
    // 1. Root properties for direct Service Worker listeners
    title: finalTitle,
    body: finalBody,
    icon: finalIcon,
    badge: finalBadge,
    tag: finalTag,
    category: String(category || "general"),
    type: String(type || "general"),
    timestamp: Date.now(),
    url: finalUrl,
    senderName: String(senderName || ""),
    senderImage: String(senderImage || ""),
    activityId: String(activityId || ""),

    // 2. Nested FCM Web Push standard notification object
    notification: {
      title: finalTitle,
      body: finalBody,
      icon: finalIcon,
      badge: finalBadge,
      tag: finalTag,
      url: finalUrl,
      ...(image ? { image, imageUrl: image } : {}),
    },

    // 3. Nested data object for service workers or clients extracting from event.data.data
    data: commonData,
  };

  if (image) {
    payloadObj.image = image;
  }

  return payloadObj;
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
    console.warn("[WebPush Dispatch Skipped]: VAPID keys not configured");
    return { skipped: "vapid_not_configured", sent: 0, removed: 0 };
  }

  const subs = await subModel.find({ userId });
  if (!subs.length) {
    console.log(`[WebPush Dispatch Skipped]: No active subscriptions found for user ${userId}`);
    return { skipped: "no_subscriptions", sent: 0, removed: 0 };
  }

  // Build complete rich universal payload
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

  // Diagnostic logging
  console.log("[WebPush Dispatch Starting]", {
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
      console.log("[WebPush Delivery Success]", {
        endpoint: sub.endpoint.substring(0, 50) + "...",
        statusCode: response?.statusCode || 201,
      });

      if (typeof sub.save === "function") {
        sub.lastUsedAt = new Date();
        await sub.save();
      }
    } catch (err) {
      const status = err?.statusCode;
      console.error("[WebPush Delivery Error]", {
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

  return { sent, removed, total: subs.length };
};

module.exports = {
  ensureVapidConfigured,
  buildWebPushPayload,
  sendWebPushToUser,
};
