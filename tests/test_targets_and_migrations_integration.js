const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const app = require("../App");
const User = require("../Modals/User");
const FitnessProfile = require("../Modals/FitnessProfile");
const WeightLog = require("../Modals/WeightLog");
const WeeklyTarget = require("../Modals/WeeklyTarget");
const BodyMeasurement = require("../Modals/BodyMeasurement");
const migration001 = require("../src/migrations/001_feature_flags_and_defaults");
const migration002 = require("../src/migrations/002_legacy_photos_audit_and_link");
const { getISOWeekDetails, getPreviousWeekStart, addDaysToDateString } = require("../Utils/date");

let existingUser = null;
let existingProfileId = null;
let newUser = null;
let newUserToken = "";

before(async () => {
  await connectToDb();
});

after(async () => {
  // Clean up only records created during this integration test run
  const ids = [existingUser?._id, newUser?._id].filter(Boolean);
  if (ids.length > 0) {
    await Promise.all([
      User.deleteMany({ _id: { $in: ids } }),
      FitnessProfile.deleteMany({ userId: { $in: ids } }),
      WeightLog.deleteMany({ userId: { $in: ids } }),
      WeeklyTarget.deleteMany({ userId: { $in: ids } }),
      BodyMeasurement.deleteMany({ userId: { $in: ids } }),
    ]);
  }
  await mongoose.connection.close();
});

test("Migrations: 001 is idempotent and preserves existing user opt-in safety", async () => {
  existingUser = await User.create({
    name: "Legacy User",
    email: `legacy_${Date.now()}@example.com`,
    password: "Password123!",
    timezone: "Asia/Kolkata",
  });

  // Simulate pre-update document without featureFlags
  const insertRes = await FitnessProfile.collection.insertOne({
    userId: existingUser._id,
    age: 29,
    gender: "male",
    height: 175,
    currentWeight: 78,
    targetWeight: 72,
    fitnessGoal: "fat_loss",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  existingProfileId = insertRes.insertedId;

  // Dry-run must report needsUpdate >= 1 and perform 0 writes
  const dryRes = await migration001.run({ dryRun: true });
  assert.ok(dryRes.needsUpdate >= 1);
  assert.strictEqual(dryRes.updated, 0);

  const untouched = await FitnessProfile.collection.findOne({ _id: existingProfileId });
  assert.strictEqual(untouched.featureFlags, undefined);

  // Apply run #1
  const run1 = await migration001.run({ dryRun: false });
  assert.ok(run1.updated >= 1);

  const migrated = await FitnessProfile.findById(existingProfileId).lean();
  assert.strictEqual(migrated.featureFlags.reminders, false);
  assert.strictEqual(migrated.featureFlags.weeklyTargets, false);
  assert.strictEqual(migrated.featureFlags.photoCheckins, false);
  assert.strictEqual(migrated.featureFlagsConfigured, false);

  // Apply run #2 (idempotency check -> 0 updates)
  const run2 = await migration001.run({ dryRun: false });
  assert.strictEqual(run2.needsUpdate, 0);
  assert.strictEqual(run2.updated, 0);
});

test("Migrations: 002 preserves existing bodyMeasurements.progressImage untouched", async () => {
  const m = await BodyMeasurement.create({
    userId: existingUser._id,
    date: "2026-11-08",
    weekStart: "2026-11-02",
    measurementsCm: { waist: 82 },
    progressImage: "https://example.com/legacy-photo.jpg",
  });

  const auditRes = await migration002.run({ dryRun: false });
  assert.ok(auditRes.legacyBodyMeasurementPhotos >= 1);

  const reloaded = await BodyMeasurement.findById(m._id).lean();
  assert.strictEqual(reloaded.progressImage, "https://example.com/legacy-photo.jpg");
});

test("Auth & Feature Flags: New users default to enabled flags while existing users stay off until configured", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      name: "New Phase5 User",
      email: `newuser_${Date.now()}@example.com`,
      password: "Password123!",
      currentWeight: 80,
      targetWeight: 74,
      fitnessGoal: "fat_loss",
    });

  assert.strictEqual(res.status, 201);
  newUserToken = res.body.data.accessToken;
  newUser = res.body.data.user;
  assert.strictEqual(res.body.data.profile.featureFlags.reminders, true);
  assert.strictEqual(res.body.data.profile.featureFlags.weeklyTargets, true);
  assert.strictEqual(res.body.data.profile.featureFlags.photoCheckins, true);

  // Existing pre-existing endpoint shapes remain identical
  const meRes = await request(app)
    .get("/api/users/me")
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(meRes.status, 200);
  assert.ok(meRes.body.data.user);
  assert.ok(meRes.body.data.profile);
});

test("Weekly Targets API: Defaults carry over lazily & manual overrides stay isolated", async () => {
  // Set defaults carrying over
  const defRes = await request(app)
    .put("/api/targets/defaults")
    .set("Authorization", `Bearer ${newUserToken}`)
    .send({
      enabled: true,
      weightChangeKgPerWeek: -0.5,
      weighInsTarget: 5,
      waistChangeCm: -0.5,
      note: "Steady fat loss pace",
    });
  assert.strictEqual(defRes.status, 200);
  assert.strictEqual(defRes.body.data.targetDefaults.enabled, true);

  // Ask for a future week -> should lazily carry over
  const nextWeekDate = "2026-12-07";
  const getNextRes1 = await request(app)
    .get(`/api/targets/weekly?week=${nextWeekDate}`)
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(getNextRes1.status, 200);
  assert.strictEqual(getNextRes1.body.data.target.weightChangeKgPerWeek, -0.5);
  assert.strictEqual(getNextRes1.body.data.target.source, "carried_over");

  // Repeated request is idempotent (same ID, 1 DB row)
  const getNextRes2 = await request(app)
    .get(`/api/targets/weekly?week=${nextWeekDate}`)
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(getNextRes2.status, 200);
  assert.strictEqual(
    getNextRes2.body.data.target._id,
    getNextRes1.body.data.target._id
  );

  // Override that single week manually without disabling defaults
  const overrideRes = await request(app)
    .put("/api/targets/weekly")
    .set("Authorization", `Bearer ${newUserToken}`)
    .send({
      week: nextWeekDate,
      weightChangeKgPerWeek: -0.2,
      weighInsTarget: 4,
      source: "manual",
    });
  assert.strictEqual(overrideRes.status, 200);
  assert.strictEqual(overrideRes.body.data.target.weightChangeKgPerWeek, -0.2);
  assert.strictEqual(overrideRes.body.data.target.source, "manual");

  // Following week still carries over -0.5 default
  const followingWeekDate = "2026-12-14";
  const followingRes = await request(app)
    .get(`/api/targets/weekly?week=${followingWeekDate}`)
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(followingRes.status, 200);
  assert.strictEqual(followingRes.body.data.target.weightChangeKgPerWeek, -0.5);
  assert.strictEqual(followingRes.body.data.target.source, "carried_over");

  // Zod validation rejects invalid weighInsTarget or missing bounds
  const badRes = await request(app)
    .put("/api/targets/weekly")
    .set("Authorization", `Bearer ${newUserToken}`)
    .send({ weightChangeKgPerWeek: -9.5, weighInsTarget: 12 });
  assert.strictEqual(badRes.status, 400);

  // Seed 2 weeks of weigh-ins & verify history endpoint
  const { weekStart: curWeekStart } = getISOWeekDetails("2026-11-09");
  const prevWeekStart = getPreviousWeekStart(curWeekStart, 1);

  await WeightLog.insertMany([
    { userId: newUser._id, date: prevWeekStart, weightKg: 80.2 },
    { userId: newUser._id, date: addDaysToDateString(prevWeekStart, 1), weightKg: 80.0 },
    { userId: newUser._id, date: addDaysToDateString(prevWeekStart, 2), weightKg: 79.8 },
    { userId: newUser._id, date: curWeekStart, weightKg: 79.6 },
    { userId: newUser._id, date: addDaysToDateString(curWeekStart, 1), weightKg: 79.4 },
    { userId: newUser._id, date: addDaysToDateString(curWeekStart, 2), weightKg: 79.5 },
  ]);

  const weekProgressRes = await request(app)
    .get(`/api/targets/weekly?week=${curWeekStart}`)
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(weekProgressRes.status, 200);
  assert.strictEqual(weekProgressRes.body.data.progress.thisWeekAvgWeight, 79.5);
  assert.strictEqual(weekProgressRes.body.data.progress.prevWeekAvgWeight, 80);
  assert.strictEqual(weekProgressRes.body.data.progress.actualChangeKg, -0.5);

  const histRes = await request(app)
    .get("/api/targets/history?weeks=4")
    .set("Authorization", `Bearer ${newUserToken}`);
  assert.strictEqual(histRes.status, 200);
  assert.strictEqual(histRes.body.data.weeks.length, 4);
});
