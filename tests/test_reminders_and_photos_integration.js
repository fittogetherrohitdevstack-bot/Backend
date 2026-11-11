const test = require("node:test");
const assert = require("assert");
const mongoose = require("mongoose");
const request = require("supertest");
const config = require("../Config/env");
const connectToDb = require("../Config/db");
const app = require("../App");
const User = require("../Modals/User");
const FitnessProfile = require("../Modals/FitnessProfile");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const WeightLog = require("../Modals/WeightLog");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const ReminderSetting = require("../Modals/ReminderSetting");
const ReminderEvent = require("../Modals/ReminderEvent");
const Notification = require("../Modals/Notification");
const ProgressPhotoSet = require("../Modals/ProgressPhotoSet");
const PointsLedger = require("../Modals/PointsLedger");
const { processUserReminders } = require("../Utils/reminderScheduler");
const { getLocalClockDetails, getISOWeekDetails } = require("../Utils/date");

let testUserIds = [];
let createdGroupId = null;

test.before(async () => {
  await connectToDb();
});

test.after(async () => {
  if (createdGroupId) {
    await Group.deleteOne({ _id: createdGroupId });
    await Membership.deleteMany({ groupId: createdGroupId });
  }
  if (testUserIds.length > 0) {
    await User.deleteMany({ _id: { $in: testUserIds } });
    await FitnessProfile.deleteMany({ userId: { $in: testUserIds } });
    await Membership.deleteMany({ userId: { $in: testUserIds } });
    await WeightLog.deleteMany({ userId: { $in: testUserIds } });
    await BodyMeasurement.deleteMany({ userId: { $in: testUserIds } });
    await ReminderSetting.deleteMany({ userId: { $in: testUserIds } });
    await ReminderEvent.deleteMany({ userId: { $in: testUserIds } });
    await Notification.deleteMany({ userId: { $in: testUserIds } });
    await ProgressPhotoSet.deleteMany({ userId: { $in: testUserIds } });
    await PointsLedger.deleteMany({ userId: { $in: testUserIds } });
  }
  await mongoose.connection.close();
});

const registerUser = async (prefix) => {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}@fittogether.test`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      name: `${prefix} Tester`,
      email,
      password: "Password123!",
      timezone: "Asia/Kolkata",
      fitnessProfile: {
        age: 26,
        gender: "male",
        height: 175,
        currentWeight: 74,
        targetWeight: 70,
        fitnessGoal: "fat_loss",
      },
    });
  assert.strictEqual(res.status, 201);
  testUserIds.push(res.body.data.user._id);
  return {
    user: res.body.data.user,
    token: res.body.data.accessToken,
  };
};

test("Reminders API: Dedupe prevents duplicate sends, Skip-if-logged suppresses notification, Snooze & Skip work", async () => {
  const { user, token } = await registerUser("rem_dedupe");

  // Lazy settings read
  const settingsRes = await request(app)
    .get("/api/reminders/settings")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(settingsRes.status, 200);
  assert.strictEqual(settingsRes.body.data.enabled, true);

  // Determine exact local clock for test instant and configure dailyWeight time to match
  const fixedNow = new Date("2026-11-11T02:00:00.000Z"); // 07:30 IST (Wed)
  const istClock = getLocalClockDetails(fixedNow, "Asia/Kolkata");

  await request(app)
    .put("/api/reminders/settings")
    .set("Authorization", `Bearer ${token}`)
    .send({
      dailyWeight: { enabled: true, time: istClock.hhmm, days: [0, 1, 2, 3, 4, 5, 6], onlyIfNotLogged: true },
      weeklyMeasurements: { enabled: false },
      biweeklyPhotos: { enabled: false },
      weeklyTarget: { enabled: false },
    });

  // Pass 1 & Pass 2 at exact same instant (simulating two cron workers / retries)
  const r1 = await processUserReminders(user._id, { now: fixedNow });
  const r2 = await processUserReminders(user._id, { now: fixedNow });
  assert.strictEqual(r1.sentCount, 1);
  assert.strictEqual(r2.sentCount, 0, "Dedupe ledger must prevent duplicate send");

  const notifsAfter = await Notification.countDocuments({
    userId: user._id,
    type: "weight",
  });
  assert.strictEqual(notifsAfter, 1);

  // Skip-if-logged: log weight for another day, then trigger reminder on that exact day -> skipped!
  const nextDayNow = new Date("2026-11-12T02:00:00.000Z"); // 07:30 IST (Thu)
  const nextClock = getLocalClockDetails(nextDayNow, "Asia/Kolkata");
  await WeightLog.create({
    userId: user._id,
    date: nextClock.dateString,
    weightKg: 73.8,
  });

  const rNextDay = await processUserReminders(user._id, { now: nextDayNow });
  assert.strictEqual(rNextDay.sentCount, 0, "Must skip reminder when weight is already logged");

  // Snooze removes reminder from /api/reminders/due while active
  const dueBefore = await request(app)
    .get("/api/reminders/due")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(dueBefore.status, 200);

  await request(app)
    .post("/api/reminders/snooze")
    .set("Authorization", `Bearer ${token}`)
    .send({ type: "daily_weight", minutes: 60 });

  const dueSnoozed = await request(app)
    .get("/api/reminders/due")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(
    dueSnoozed.body.data.items.some((i) => i.type === "daily_weight"),
    false
  );

  // Skip occurrence for current period
  const skipRes = await request(app)
    .post("/api/reminders/skip")
    .set("Authorization", `Bearer ${token}`)
    .send({ type: "daily_weight" });
  assert.strictEqual(skipRes.status, 200);
});

test("Jobs endpoint: POST /api/jobs/reminders/tick enforces CRON_SECRET", async () => {
  const originalSecret = config.CRON_SECRET;
  try {
    config.CRON_SECRET = "test_secret_123";
    const badRes = await request(app)
      .post("/api/jobs/reminders/tick")
      .set("x-cron-secret", "wrong_secret");
    assert.strictEqual(badRes.status, 401);

    const goodRes = await request(app)
      .post("/api/jobs/reminders/tick")
      .set("x-cron-secret", "test_secret_123");
    assert.strictEqual(goodRes.status, 200);
    assert.strictEqual(goodRes.body.success, true);
  } finally {
    config.CRON_SECRET = originalSecret;
  }
});

test("Progress Photos: Upload validation + Private-by-default group filtering + Anchor stability", async () => {
  const owner = await registerUser("photo_owner");
  const teammate = await registerUser("photo_mate");

  // Create squad & add teammate
  const groupRes = await request(app)
    .post("/api/groups")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ name: "Photo Privacy Squad" });
  assert.strictEqual(groupRes.status, 201);
  createdGroupId = groupRes.body.data.group._id;
  const inviteCode = groupRes.body.data.group.inviteCode;

  const joinRes = await request(app)
    .post("/api/groups/join")
    .set("Authorization", `Bearer ${teammate.token}`)
    .send({ inviteCode });
  assert.strictEqual(joinRes.status, 200);

  // Reject invalid MIME type on upload
  const badMimeRes = await request(app)
    .put("/api/progress/photo-sets/current/photo")
    .set("Authorization", `Bearer ${owner.token}`)
    .field("pose", "front_relaxed")
    .attach("photo", Buffer.from("not an image"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });
  assert.strictEqual(badMimeRes.status, 400);

  // Create private photo set & shared-photos group filter check
  const privateSet = await ProgressPhotoSet.create({
    userId: owner.user._id,
    date: "2026-11-01",
    cycleNumber: 1,
    photos: {
      front_relaxed: { url: "https://example.com/private-front.jpg", publicId: "seed_priv_1" },
    },
    visibility: "private",
  });

  // Teammate must NOT see private photo set
  const sharedWhilePrivate = await request(app)
    .get(`/api/groups/${createdGroupId}/shared-photos`)
    .set("Authorization", `Bearer ${teammate.token}`);
  assert.strictEqual(sharedWhilePrivate.status, 200);
  assert.strictEqual(sharedWhilePrivate.body.data.sharedSets.length, 0);

  // Owner updates visibility to group
  const shareRes = await request(app)
    .put(`/api/progress/photo-sets/${privateSet._id}/visibility`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ visibility: "group" });
  assert.strictEqual(shareRes.status, 200);

  const sharedAfterOptIn = await request(app)
    .get(`/api/groups/${createdGroupId}/shared-photos`)
    .set("Authorization", `Bearer ${teammate.token}`);
  assert.strictEqual(sharedAfterOptIn.body.data.sharedSets.length, 1);

  // Owner revokes back to private -> hidden again
  await request(app)
    .put(`/api/progress/photo-sets/${privateSet._id}/visibility`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ visibility: "private" });

  const sharedAfterRevoke = await request(app)
    .get(`/api/groups/${createdGroupId}/shared-photos`)
    .set("Authorization", `Bearer ${teammate.token}`);
  assert.strictEqual(sharedAfterRevoke.body.data.sharedSets.length, 0);

  // Anchor update must preserve history
  const anchorRes = await request(app)
    .put("/api/progress/photo-sets/anchor")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ anchorDate: "2026-11-10" });
  assert.strictEqual(anchorRes.status, 200);

  const preservedSet = await ProgressPhotoSet.findById(privateSet._id);
  assert.strictEqual(preservedSet.date, "2026-11-01");

  // Consistency points idempotency for weigh_in and measurements
  await request(app)
    .put("/api/progress/weight")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ date: "2026-11-11", weightKg: 73.5 });
  await request(app)
    .put("/api/progress/weight")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ date: "2026-11-11", weightKg: 73.4 });

  const weighInPts = await PointsLedger.find({
    userId: owner.user._id,
    type: "weigh_in",
    date: "2026-11-11",
  });
  assert.strictEqual(weighInPts.length, 1);

  const { weekStart } = getISOWeekDetails("2026-11-11");
  await request(app)
    .put("/api/progress/measurements")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ date: "2026-11-11", measurementsCm: { waist: 82 } });
  await request(app)
    .put("/api/progress/measurements")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ date: "2026-11-12", measurementsCm: { waist: 81.8 } });

  const measPts = await PointsLedger.find({
    userId: owner.user._id,
    type: "measurements",
    "meta.weekStart": weekStart,
  });
  assert.strictEqual(measPts.length, 1);

  // Pre-existing endpoints still return expected response shapes
  const [meRes, grpRes, dashRes] = await Promise.all([
    request(app).get("/api/users/me").set("Authorization", `Bearer ${owner.token}`),
    request(app).get("/api/groups/mine").set("Authorization", `Bearer ${owner.token}`),
    request(app).get("/api/dashboard/me").set("Authorization", `Bearer ${owner.token}`),
  ]);
  assert.strictEqual(meRes.status, 200);
  assert.ok(meRes.body.data.profile.featureFlags);
  assert.strictEqual(grpRes.status, 200);
  assert.ok(Array.isArray(grpRes.body.data.groups));
  assert.strictEqual(dashRes.status, 200);
  assert.ok(dashRes.body.data.nutrition);
});

test("Profile Avatar API: Preset avatar selection, validation, multipart rejection, and removal work", async () => {
  const { token } = await registerUser("avatar_flow");

  // Select built-in preset avatar
  const presetRes = await request(app)
    .post("/api/users/avatar")
    .set("Authorization", `Bearer ${token}`)
    .send({ avatarId: "flame" });
  assert.strictEqual(presetRes.status, 200);
  assert.strictEqual(presetRes.body.data.user.profileImage, "avatar:flame");
  assert.strictEqual(presetRes.body.data.user.profileImagePublicId, undefined);

  // Reject invalid preset ID
  const invalidPresetRes = await request(app)
    .post("/api/users/avatar")
    .set("Authorization", `Bearer ${token}`)
    .send({ avatarId: "not_a_preset" });
  assert.strictEqual(invalidPresetRes.status, 400);

  // Verify persistence in GET /api/users/me without exposing internal publicId
  const meRes = await request(app)
    .get("/api/users/me")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.data.user.profileImage, "avatar:flame");
  assert.strictEqual(meRes.body.data.user.profileImagePublicId, undefined);

  // Reject non-image multipart upload before touching external storage
  const badUploadRes = await request(app)
    .post("/api/users/avatar")
    .set("Authorization", `Bearer ${token}`)
    .attach("photo", Buffer.from("not-an-image"), {
      filename: "bad.txt",
      contentType: "text/plain",
    });
  assert.strictEqual(badUploadRes.status, 400);

  // Reset to initials
  const delRes = await request(app)
    .delete("/api/users/avatar")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(delRes.status, 200);
  assert.strictEqual(delRes.body.data.user.profileImage, "");

  const meAfterRes = await request(app)
    .get("/api/users/me")
    .set("Authorization", `Bearer ${token}`);
  assert.strictEqual(meAfterRes.status, 200);
  assert.strictEqual(meAfterRes.body.data.user.profileImage, "");
});
