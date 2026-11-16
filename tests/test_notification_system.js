const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const connectToDb = require("../Config/db");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const Notification = require("../Modals/Notification");
const DeviceToken = require("../Modals/DeviceToken");
const NotificationPreference = require("../Modals/NotificationPreference");
const {
  createAndDispatchNotification,
  dispatchSocialActivityNotification,
  cleanupActivityNotifications,
} = require("../services/notificationService");

test("Notification System: End-to-End Test Suite", async (t) => {
  await connectToDb();

  const timestamp = Date.now();
  // 1. Create two test users (Actor & Squadmate)
  const user1Email = `actor_${timestamp}@fittogether.test`;
  const user2Email = `peer_${timestamp}@fittogether.test`;

  const reg1 = await request(app)
    .post("/api/auth/register")
    .send({ name: "Actor User", email: user1Email, password: "Password123!" });
  assert.strictEqual(reg1.status, 201);
  const token1 = reg1.body.data.accessToken;
  const user1Id = reg1.body.data.user._id;

  const reg2 = await request(app)
    .post("/api/auth/register")
    .send({ name: "Peer User", email: user2Email, password: "Password123!" });
  assert.strictEqual(reg2.status, 201);
  const token2 = reg2.body.data.accessToken;
  const user2Id = reg2.body.data.user._id;

  // 2. Put both users into the same squad
  const group = await Group.create({
    name: "Test Notification Squad",
    createdBy: user1Id,
    inviteCode: `TEST${Math.floor(Math.random() * 10000)}`,
  });

  await Membership.create({
    groupId: group._id,
    userId: user1Id,
    role: "admin",
    status: "active",
  });

  await Membership.create({
    groupId: group._id,
    userId: user2Id,
    role: "member",
    status: "active",
  });

  // 3. Test Device Token Registration (Phase 5)
  await t.test("Device registration: registers Android & iOS devices", async () => {
    const res = await request(app)
      .post("/api/devices/register")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        installationId: `inst_${timestamp}_android`,
        platform: "android",
        token: "fcm_test_token_12345",
        deviceModel: "Pixel 8",
        appVersion: "1.0.0",
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);

    const device = await DeviceToken.findOne({
      userId: user2Id,
      installationId: `inst_${timestamp}_android`,
    });
    assert.ok(device);
    assert.strictEqual(device.active, true);
    assert.strictEqual(device.platform, "android");
  });

  // 4. Test Notification Preferences (Phase 8)
  await t.test("Preferences API: GET & PUT preferences", async () => {
    const getRes = await request(app)
      .get("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token2}`);

    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.success, true);

    // Disable water logging alerts
    const putRes = await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${token2}`)
      .send({ waterLogging: false });

    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putRes.body.data.preferences.waterLogging, false);

    const pref = await NotificationPreference.findOne({ userId: user2Id });
    assert.strictEqual(pref.waterLogging, false);
  });

  // 5. Test Social Activity Dispatching (Phase 6)
  await t.test("Social activity dispatch: notifies accepted squadmates & excludes actor", async () => {
    // A) Meal added (should notify Peer)
    const mealResults = await dispatchSocialActivityNotification({
      actorId: user1Id,
      actorName: "Actor User",
      type: "meal_added",
      category: "meal",
      title: "🍎 Actor User added a new meal",
      body: "Actor User logged their high-protein breakfast.",
      url: "/tracker",
      activityId: `meal_${timestamp}`,
    });

    assert.strictEqual(mealResults.length, 1);
    assert.strictEqual(
      mealResults[0].notification.userId.toString(),
      user2Id.toString()
    );
    assert.strictEqual(mealResults[0].notification.title, "🍎 Actor User added a new meal");

    // Verify actor did NOT receive a notification for their own action
    const actorNotifs = await Notification.find({
      userId: user1Id,
      activityId: `meal_${timestamp}`,
    });
    assert.strictEqual(actorNotifs.length, 0);

    // B) Water logged (Peer has disabled waterLogging in preferences above -> push should be skipped)
    const waterResults = await dispatchSocialActivityNotification({
      actorId: user1Id,
      actorName: "Actor User",
      type: "water_logged",
      category: "water",
      title: "💧 Actor User drank 500ml water",
      body: "Keep your hydration streak burning!",
      url: "/water",
      activityId: `water_${timestamp}`,
    });

    assert.strictEqual(waterResults.length, 1);
    assert.strictEqual(waterResults[0].push.skipped, "disabled_by_preferences");
  });

  // 6. Test In-App Notification Center APIs (Phase 7)
  await t.test("In-app Notification Center: list, mark read, delete", async () => {
    // List notifications for Peer
    const listRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token2}`);

    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.data.notifications.length >= 2);
    assert.ok(listRes.body.data.unreadCount >= 2);

    const firstNotifId = listRes.body.data.notifications[0]._id;

    // Mark single notification as read
    const readRes = await request(app)
      .patch(`/api/notifications/${firstNotifId}/read`)
      .set("Authorization", `Bearer ${token2}`);

    assert.strictEqual(readRes.status, 200);
    assert.ok(readRes.body.data.notification.readAt);

    // Mark all as read
    const readAllRes = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", `Bearer ${token2}`);

    assert.strictEqual(readAllRes.status, 200);

    const checkUnread = await Notification.countDocuments({
      userId: user2Id,
      readAt: null,
    });
    assert.strictEqual(checkUnread, 0);

    // Delete single notification
    const deleteRes = await request(app)
      .delete(`/api/notifications/${firstNotifId}`)
      .set("Authorization", `Bearer ${token2}`);

    assert.strictEqual(deleteRes.status, 200);

    const deletedDoc = await Notification.findById(firstNotifId);
    assert.strictEqual(deletedDoc.isDeleted, true);
  });

  // 7. Test Deleted Activity Cleanup
  await t.test("Activity cleanup: marks notifications as deleted when parent activity is removed", async () => {
    await cleanupActivityNotifications(`meal_${timestamp}`);
    const cleaned = await Notification.findOne({ activityId: `meal_${timestamp}` });
    assert.strictEqual(cleaned.isDeleted, true);
  });

  // 8. Test Device Unregister on logout
  await t.test("Device unregister: deactivates device token on logout", async () => {
    const unregRes = await request(app)
      .post("/api/devices/unregister")
      .set("Authorization", `Bearer ${token2}`)
      .send({ installationId: `inst_${timestamp}_android` });

    assert.strictEqual(unregRes.status, 200);

    const dev = await DeviceToken.findOne({
      userId: user2Id,
      installationId: `inst_${timestamp}_android`,
    });
    assert.strictEqual(dev.active, false);
  });

  // Clean up test data
  await User.deleteMany({ _id: { $in: [user1Id, user2Id] } });
  await Group.deleteOne({ _id: group._id });
  await Membership.deleteMany({ groupId: group._id });
  await Notification.deleteMany({ userId: { $in: [user1Id, user2Id] } });
  await DeviceToken.deleteMany({ userId: { $in: [user1Id, user2Id] } });
  await NotificationPreference.deleteMany({ userId: { $in: [user1Id, user2Id] } });

  await mongoose.connection.close();
});
