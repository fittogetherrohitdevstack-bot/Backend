const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const app = require("../app");
const connectToDb = require("../Config/db");
const User = require("../Modals/User");
const WaterLog = require("../Modals/WaterLog");
const FitnessProfile = require("../Modals/FitnessProfile");

test("Water Target API: PUT /api/water/target updates goal and synchronizes", async (t) => {
  await connectToDb();

  // Create or get test user
  const email = `test_water_user_${Date.now()}@example.com`;
  const registerRes = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Water Tester",
      email,
      password: "Password123!",
      timezone: "Asia/Kolkata",
    });

  assert.strictEqual(registerRes.status, 201);
  const token = registerRes.body.data.accessToken;
  const userId = registerRes.body.data.user._id;

  // 1. Test validation: target < 500
  const lowRes = await request(app)
    .put("/api/water/target")
    .set("Authorization", `Bearer ${token}`)
    .send({ targetMl: 400 });
  assert.strictEqual(lowRes.status, 400);

  // 2. Test validation: target > 10000
  const highRes = await request(app)
    .put("/api/water/target")
    .set("Authorization", `Bearer ${token}`)
    .send({ targetMl: 12000 });
  assert.strictEqual(highRes.status, 400);

  // 3. Test valid target update
  const validRes = await request(app)
    .put("/api/water/target")
    .set("Authorization", `Bearer ${token}`)
    .send({ targetMl: 3200 });

  assert.strictEqual(validRes.status, 200);
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.data.targetMl, 3200);

  // Verify FitnessProfile updated
  const profile = await FitnessProfile.findOne({ userId });
  assert.ok(profile);
  assert.strictEqual(profile.targets.waterMl, 3200);

  // Clean up
  await User.deleteOne({ _id: userId });
  await FitnessProfile.deleteOne({ userId });
  await WaterLog.deleteMany({ userId });
  await mongoose.connection.close();
});

