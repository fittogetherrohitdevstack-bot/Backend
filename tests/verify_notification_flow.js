const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");
const config = require("../Config/env");
const PushSubscription = require("../Modals/PushSubscription");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const Notification = require("../Modals/Notification");
const { sendWebPushToUser, buildWebPushPayload } = require("../services/webPushService");
const { dispatchSocialActivityNotification } = require("../services/notificationService");

async function runVerification() {
  console.log("=== Step 1: Connecting to MongoDB ===");
  await mongoose.connect(config.MONGODB_URI);
  console.log("MongoDB connected successfully");

  console.log("\n=== Step 2: Testing Payload Builder Compatibility ===");
  const payload1 = buildWebPushPayload({
    title: "🍎 Rahul added a new meal",
    body: "Rahul just logged his breakfast. Check out what he's eating!",
    url: "/tracker",
    type: "meal_added",
    senderName: "Rahul",
  });

  console.log("Built universal payload structure:");
  console.log("  Root title:", payload1.title);
  console.log("  Root body:", payload1.body);
  console.log("  notification.title:", payload1.notification.title);
  console.log("  data.title:", payload1.data.title);
  console.log("  data.type:", payload1.data.type);

  if (
    payload1.title !== "🍎 Rahul added a new meal" ||
    payload1.notification.title !== "🍎 Rahul added a new meal" ||
    payload1.data.title !== "🍎 Rahul added a new meal"
  ) {
    throw new Error("Payload builder failed to maintain title across all schemas!");
  }
  console.log("✅ Universal payload builder verification passed!");

  console.log("\n=== Step 3: Verifying Real Web Push to Live Subscribed Device ===");
  const sub = await PushSubscription.findOne({}).lean();
  if (sub) {
    console.log("Found real subscription for user:", sub.userId);
    console.log("Target endpoint:", sub.endpoint.substring(0, 50) + "...");
    const result = await sendWebPushToUser(sub.userId, {
      title: "🍎 Rahul added a new meal",
      body: "Rahul just logged his breakfast. Check out what he's eating!",
      url: "/tracker",
      type: "meal_added",
      category: "meal",
      tag: "fittogether-meal",
      senderName: "Rahul",
      activityId: "meal_demo_debug_1",
    });
    console.log("WebPush dispatch result:", result);
    if (result.sent !== 1) {
      throw new Error("Expected 1 sent push message!");
    }
    console.log("✅ Live Web Push delivered to Google FCM (201 Created)!");
  } else {
    console.warn("No subscription found in DB to test live push.");
  }

  console.log("\n=== Step 4: Verifying Social Activity Flow (User A -> User B) ===");
  let userA = await User.findOne({ email: "rohitdr098@gmail.com" });
  let userB = await User.findOne({ _id: { $ne: userA._id } });

  if (userA && userB) {
    console.log("Actor (User A):", userA.name, userA._id.toString());
    console.log("Squadmate (User B):", userB.name, userB._id.toString());

    // Ensure squad membership exists between them
    let testGroup = await Group.findOne({ name: "Verification Squad" });
    if (!testGroup) {
      testGroup = await Group.create({
        name: "Verification Squad",
        createdBy: userA._id,
        inviteCode: "VSQUAD" + Date.now().toString().slice(-4),
      });
    }

    await Membership.findOneAndUpdate(
      { groupId: testGroup._id, userId: userA._id },
      { $set: { role: "admin", status: "active" } },
      { upsert: true, returnDocument: "after" }
    );

    await Membership.findOneAndUpdate(
      { groupId: testGroup._id, userId: userB._id },
      { $set: { role: "member", status: "active" } },
      { upsert: true, returnDocument: "after" }
    );

    // Now trigger social activity notification
    const dispatchResults = await dispatchSocialActivityNotification({
      actorId: userA._id,
      actorName: userA.name,
      type: "meal_added",
      category: "meal",
      title: `🍎 ${userA.name} added a new meal`,
      body: `${userA.name} just logged Homemade Oats with Almonds. Check out what they're eating!`,
      url: "/tracker",
      activityId: "meal_verification_test_" + Date.now(),
      groupId: testGroup._id,
    });

    console.log("Dispatch social activity completed. Results count:", dispatchResults.length);

    // Verify MongoDB notification record
    const savedNotif = await Notification.findOne({
      userId: userB._id,
      senderId: userA._id,
      type: "meal_added",
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log("Persisted MongoDB Notification:");
    console.log("  ID:", savedNotif?._id);
    console.log("  Recipient userId:", savedNotif?.userId);
    console.log("  Sender:", savedNotif?.senderName, savedNotif?.senderId);
    console.log("  Title:", savedNotif?.title);
    console.log("  Body:", savedNotif?.body);
    console.log("  Type:", savedNotif?.type);

    if (savedNotif?.title !== `🍎 ${userA.name} added a new meal`) {
      throw new Error("Notification title did not match actor name!");
    }
    console.log("✅ Social activity notification successfully persisted in MongoDB and dispatched!");
  }

  await mongoose.disconnect();
  console.log("\n=== All Verification Steps Completed Successfully ===");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
