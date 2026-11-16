const admin = require("firebase-admin");
const config = require("../Config/env");
const DeviceToken = require("../Modals/DeviceToken");

let firebaseApp = null;
let firebaseInitialized = false;

/**
 * Safely initialize Firebase Admin SDK.
 * Supports:
 * 1. FIREBASE_SERVICE_ACCOUNT (raw JSON string)
 * 2. FIREBASE_CREDENTIALS_PATH (path to serviceAccountKey.json)
 * 3. Individual credentials (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY)
 * Gracefully stays uninitialized if no valid credentials exist.
 */
const initFirebase = () => {
  if (firebaseInitialized) return firebaseApp;

  try {
    if (admin.apps && admin.apps.length > 0) {
      firebaseApp = admin.apps[0];
      firebaseInitialized = true;
      return firebaseApp;
    }

    let credential = null;

    if (config.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const parsed = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(parsed);
      } catch (e) {
        console.warn("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
      }
    } else if (config.FIREBASE_CREDENTIALS_PATH) {
      try {
        credential = admin.credential.cert(config.FIREBASE_CREDENTIALS_PATH);
      } catch (e) {
        console.warn("[Firebase] Failed to load credentials from FIREBASE_CREDENTIALS_PATH:", e.message);
      }
    } else if (config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY,
      });
    }

    if (credential) {
      firebaseApp = admin.initializeApp({ credential });
      firebaseInitialized = true;
      console.log("🔥 Firebase Admin SDK initialized for native push notifications.");
      return firebaseApp;
    }
  } catch (err) {
    console.warn("[Firebase] Initialization skipped or error:", err.message);
  }

  firebaseInitialized = false;
  return null;
};

/**
 * Check if Firebase is currently ready to send notifications.
 */
const isFirebaseConfigured = () => {
  const app = initFirebase();
  return Boolean(app);
};

/**
 * Send a native push notification to all active Android/iOS devices for a user.
 */
const sendNativePushToUser = async (
  userId,
  {
    title,
    body,
    url = "/",
    type = "general",
    category = "general",
    tag = "fittogether",
    image = "",
    activityId = "",
    data = {},
  }
) => {
  if (!isFirebaseConfigured()) {
    return { skipped: "firebase_not_configured", sent: 0, removed: 0 };
  }

  const deviceTokens = await DeviceToken.find({
    userId,
    active: true,
    platform: { $in: ["android", "ios", "web"] },
  }).lean();

  if (!deviceTokens.length) {
    return { skipped: "no_active_devices", sent: 0, removed: 0 };
  }

  const tokens = deviceTokens.map((d) => d.token).filter(Boolean);
  if (!tokens.length) {
    return { skipped: "no_tokens", sent: 0, removed: 0 };
  }

  // Sanitize data payload (all values must be strings for FCM data)
  const stringifiedData = {
    url: String(url || "/"),
    type: String(type || "general"),
    category: String(category || "general"),
    tag: String(tag || "fittogether"),
    activityId: String(activityId || ""),
    title: String(title || "FitTogether"),
    body: String(body || ""),
  };

  if (image) stringifiedData.image = String(image);

  for (const [key, val] of Object.entries(data || {})) {
    if (val !== undefined && val !== null) {
      stringifiedData[key] = typeof val === "object" ? JSON.stringify(val) : String(val);
    }
  }

  const message = {
    tokens,
    notification: {
      title,
      body,
      ...(image ? { imageUrl: image } : {}),
    },
    data: stringifiedData,
    android: {
      priority: "high",
      notification: {
        channelId: "fittogether_social",
        icon: "ic_stat_fittogether",
        color: "#10B981", // Emerald / lime brand color
        tag,
        sound: "default",
        clickAction: "FCM_PLUGIN_ACTIVITY",
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title,
            body,
          },
          sound: "default",
          badge: 1,
          category: type,
        },
      },
    },
  };

  console.log("[Firebase NativePush Dispatch]", {
    userId: userId.toString(),
    tokensCount: tokens.length,
    finalTitle: title,
    finalBody: body,
    notificationPayload: message.notification,
    androidChannel: message.android.notification.channelId,
  });

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    let sent = 0;
    let removed = 0;
    const invalidTokens = [];

    response.responses.forEach((resp, idx) => {
      const token = tokens[idx];
      if (resp.success) {
        sent++;
      } else {
        const error = resp.error;
        const code = error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(token);
          removed++;
        } else {
          console.warn(`[Firebase] Delivery failed for token: ${code || error?.message}`);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await DeviceToken.updateMany(
        { token: { $in: invalidTokens } },
        { $set: { active: false } }
      );
    }

    // Touch lastUsedAt for active devices
    await DeviceToken.updateMany(
      { token: { $in: tokens }, active: true },
      { $set: { lastUsedAt: new Date() } }
    );

    return { sent, removed, total: tokens.length };
  } catch (err) {
    console.error("[Firebase] Multicast send error:", err.message);
    return { error: err.message, sent: 0, removed: 0 };
  }
};

module.exports = {
  initFirebase,
  isFirebaseConfigured,
  sendNativePushToUser,
};
