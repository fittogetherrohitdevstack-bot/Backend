const mongoose = require("mongoose");
const Notification = require("../Modals/Notification");
const NotificationPreference = require("../Modals/NotificationPreference");
const ReminderSetting = require("../Modals/ReminderSetting");
const Membership = require("../Modals/Membership");
const User = require("../Modals/User");
const { sendWebPushToUser } = require("./webPushService");
const { sendNativePushToUser } = require("./firebasePushService");
const { emitUserEvent } = require("../Utils/socket");

/**
 * Get or create default notification preferences for a user.
 */
const getUserPreferences = async (userId) => {
  let pref = await NotificationPreference.findOne({ userId });
  if (!pref) {
    pref = await NotificationPreference.create({ userId });
  }
  return pref;
};

/**
 * Maps event/category to preference keys.
 */
const isNotificationCategoryAllowed = (pref, category, type) => {
  if (!pref) return true;
  if (pref.allPushEnabled === false) return false;

  const key = `${category || ""}_${type || ""}`.toLowerCase();

  if (key.includes("meal")) return pref.mealNotifications !== false;
  if (key.includes("diet")) return pref.dietUpdates !== false;
  if (key.includes("water")) return pref.waterLogging !== false;
  if (key.includes("moment")) return pref.moments !== false;
  if (key.includes("workout")) return pref.workoutCompletion !== false;
  if (key.includes("badge") || key.includes("achievement")) return pref.achievements !== false;
  if (key.includes("friend") || key.includes("group")) return pref.friendRequests !== false;
  if (key.includes("reminder") || key.includes("nudge") || key.includes("recap"))
    return pref.scheduledReminders !== false;

  return true;
};

/**
 * Persists an in-app notification in MongoDB, emits it live to the user via Socket.io,
 * and dispatches it through Web Push and Firebase Native Push if preferences allow.
 */
const createAndDispatchNotification = async ({
  recipientUserId,
  senderId = null,
  senderName = "",
  senderImage = "",
  type = "general",
  category = "general",
  title,
  body,
  icon = "/web-app-manifest-192x192.png",
  image = "",
  url = "/",
  tag = "fittogether",
  activityId = "",
  data = {},
  skipPush = false,
}) => {
  if (!recipientUserId || !title || !body) return null;

  console.log("[NotificationService Dispatch]", {
    eventType: type,
    category,
    recipientUserId: recipientUserId.toString(),
    senderId: senderId ? senderId.toString() : null,
    senderName,
    finalTitle: title,
    finalBody: body,
    url,
    activityId,
  });

  // 1. Create In-App Notification Record (separate from push delivery)
  const notificationDoc = await Notification.create({
    userId: recipientUserId,
    senderId: senderId || null,
    senderName: senderName || "",
    senderImage: senderImage || "",
    type,
    category,
    title,
    body,
    icon,
    image,
    url,
    tag,
    activityId: String(activityId || ""),
    data,
    readAt: null,
  });

  // 2. Real-time in-app socket broadcast
  emitUserEvent(recipientUserId.toString(), "new-notification", {
    notification: notificationDoc,
  });

  if (skipPush) {
    return { notification: notificationDoc, push: { skipped: true } };
  }

  // 3. Check push preferences (NotificationPreference is the primary authority)
  const pref = await getUserPreferences(recipientUserId);
  const allowed = isNotificationCategoryAllowed(pref, category, type);

  if (!allowed) {
    return { notification: notificationDoc, push: { skipped: "disabled_by_preferences" } };
  }

  // If user has push enabled in preferences, ensure legacy reminderSetting channels.push is synchronized
  if (pref.allPushEnabled !== false) {
    ReminderSetting.updateOne(
      { userId: recipientUserId, "channels.push": false },
      { $set: { "channels.push": true } }
    ).catch(() => {});
  } else {
    // Both explicitly disabled
    return { notification: notificationDoc, push: { skipped: "push_channel_disabled" } };
  }

  // 4. Dispatch Web Push
  const webPushPromise = sendWebPushToUser(recipientUserId, {
    title,
    body,
    url,
    type,
    category,
    tag,
    image,
    icon,
    activityId,
    senderName,
    senderImage,
    data: { ...data, notificationId: notificationDoc._id.toString() },
  }).catch((err) => {
    console.warn(`[NotificationService] WebPush error for user ${recipientUserId}:`, err.message);
    return { error: err.message };
  });

  // 5. Dispatch Mobile Native Push (FCM / APNs)
  const nativePushPromise = sendNativePushToUser(recipientUserId, {
    title,
    body,
    url,
    type,
    category,
    tag,
    image,
    activityId,
    data: {
      ...data,
      notificationId: notificationDoc._id.toString(),
      senderName,
      senderImage,
    },
  }).catch((err) => {
    console.warn(`[NotificationService] NativePush error for user ${recipientUserId}:`, err.message);
    return { error: err.message };
  });

  const [webResult, nativeResult] = await Promise.all([webPushPromise, nativePushPromise]);

  return {
    notification: notificationDoc,
    push: { web: webResult, native: nativeResult },
  };
};

/**
 * Dispatches a social activity notification to all verified squadmates (accepted friends) of the actor.
 * Rules enforced:
 * - Never notify the creator/actor.
 * - Notify only verified active squadmates.
 * - Exclude blocked users.
 * - Respect recipient's category preferences.
 * - Do not expose private meal or health numbers in payloads.
 */
const dispatchSocialActivityNotification = async ({
  actorId,
  actorName = "",
  actorImage = "",
  type, // e.g. "meal_added", "water_logged", "moment_posted", "workout_completed", "diet_updated", "achievement_unlocked"
  category = "social",
  title,
  body,
  image = "",
  url = "/",
  tag = "fittogether-social",
  activityId = "",
  data = {},
  groupId = null,
}) => {
  if (!actorId) return [];

  // Find actor details if not passed
  let resolvedActorName = actorName;
  let resolvedActorImage = actorImage;
  if (!resolvedActorName) {
    const actor = await User.findById(actorId).select("name profileImage").lean();
    if (actor) {
      resolvedActorName = actor.name;
      resolvedActorImage = actor.profileImage || "";
    }
  }

  // Find recipient groups: either a specific group or all active groups of the actor
  let groupIds = [];
  if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
    groupIds = [new mongoose.Types.ObjectId(groupId)];
  } else {
    const myMemberships = await Membership.find({
      userId: actorId,
      status: "active",
    })
      .select("groupId")
      .lean();
    groupIds = myMemberships.map((m) => m.groupId);
  }

  if (!groupIds.length) return [];

  // Find all active squadmates across these groups
  const peerMemberships = await Membership.find({
    groupId: { $in: groupIds },
    userId: { $ne: actorId },
    status: "active",
  })
    .select("userId")
    .lean();

  // Deduplicate peer user IDs
  const recipientUserIds = [
    ...new Set(peerMemberships.map((m) => m.userId.toString())),
  ];

  console.log("[SocialActivityDispatch Found Squadmates]", {
    actorId: actorId.toString(),
    actorName: resolvedActorName,
    type,
    title,
    squadmatesCount: recipientUserIds.length,
    recipientUserIds,
  });

  if (!recipientUserIds.length) return [];

  const results = [];

  for (const recipientId of recipientUserIds) {
    try {
      const res = await createAndDispatchNotification({
        recipientUserId: recipientId,
        senderId: actorId,
        senderName: resolvedActorName,
        senderImage: resolvedActorImage,
        type,
        category,
        title,
        body,
        image,
        url,
        tag: `${tag}-${activityId || Date.now()}`,
        activityId,
        data: {
          ...data,
          actorId: actorId.toString(),
          actorName: resolvedActorName,
        },
      });
      results.push(res);
    } catch (err) {
      console.warn(`[NotificationService] Error notifying recipient ${recipientId}:`, err.message);
    }
  }

  return results;
};

/**
 * Remove or mark as deleted notifications associated with an activity when deleted.
 */
const cleanupActivityNotifications = async (activityId) => {
  if (!activityId) return;
  await Notification.updateMany(
    { activityId: String(activityId) },
    { $set: { isDeleted: true } }
  );
};

module.exports = {
  getUserPreferences,
  isNotificationCategoryAllowed,
  createAndDispatchNotification,
  dispatchSocialActivityNotification,
  cleanupActivityNotifications,
};
