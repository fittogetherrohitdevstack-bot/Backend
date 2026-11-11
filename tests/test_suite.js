const { test, before, after } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const { getLocalDateString, getDayOfWeek, getRecentDays } = require("../Utils/date");
const { sumFoodItems, calculateTDEE } = require("../Utils/nutrition");
const { calculateMealPoints, POINTS_RULES } = require("../Utils/gamification");
const app = require("../App");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const DietPlan = require("../Modals/DietPlan");
const MealLog = require("../Modals/MealLog");
const FitnessProfile = require("../Modals/FitnessProfile");

before(async () => {
  await connectToDb();
});

after(async () => {
  await mongoose.connection.close();
});

// 1. Unit Tests for Utilities
test("Utils: date normalization and day of week", () => {
  const dStr = getLocalDateString(new Date("2026-11-10T12:00:00Z"), "Asia/Kolkata");
  assert.match(dStr, /^\d{4}-\d{2}-\d{2}$/);

  // 2026-11-10 is Tuesday (day 2: Sun=0, Mon=1, Tue=2)
  const day = getDayOfWeek("2026-11-10");
  assert.strictEqual(day, 2);

  const recent = getRecentDays(7, "Asia/Kolkata");
  assert.strictEqual(recent.length, 7);
});

test("Utils: nutrition math and Mifflin-St Jeor TDEE calculations", () => {
  const foods = [
    { name: "Oats", calories: 300, protein: 10, carbs: 55, fats: 5 },
    { name: "Eggs", calories: 140, protein: 12, carbs: 1, fats: 10 },
  ];
  const totals = sumFoodItems(foods);
  assert.strictEqual(totals.calories, 440);
  assert.strictEqual(totals.protein, 22);
  assert.strictEqual(totals.carbs, 56);
  assert.strictEqual(totals.fats, 15);

  const tdee = calculateTDEE({
    gender: "male",
    age: 25,
    heightCm: 175,
    weightKg: 70,
    activityLevel: "moderate",
    goal: "maintenance",
  });
  assert.ok(tdee.targetCalories > 1500);
  assert.ok(tdee.disclaimer.includes("informational purposes"));
});

test("Utils: gamification points rules", () => {
  assert.strictEqual(calculateMealPoints(4, 4), 40);
  assert.strictEqual(calculateMealPoints(2, 4), 20);
  assert.strictEqual(POINTS_RULES.WORKOUT_COMPLETED, 30);
  assert.strictEqual(POINTS_RULES.WATER_GOAL_REACHED, 15);
});

// 2. Integration Tests with Supertest
let testUserToken = "";
let testUser = null;
let testGroup = null;

test("Integration: Auth flow (register & login)", async () => {
  const email = `testuser_${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Test Runner",
      email,
      password: "TestPassword123!",
      age: 28,
      height: 178,
      currentWeight: 74,
      fitnessGoal: "fat_loss",
    });

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.data.accessToken);
  testUserToken = res.body.data.accessToken;
  testUser = res.body.data.user;

  // Login
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "TestPassword123!" });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.body.data.accessToken);
});

test("Integration: Group creation and join via invite code", async () => {
  const createRes = await request(app)
    .post("/api/groups")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({ name: "Integration Test Group", maxMembers: 5 });

  assert.strictEqual(createRes.status, 201);
  testGroup = createRes.body.data.group;
  assert.ok(testGroup.inviteCode);

  // Verify membership
  const membersRes = await request(app)
    .get(`/api/groups/${testGroup._id}/members`)
    .set("Authorization", `Bearer ${testUserToken}`);
  assert.strictEqual(membersRes.status, 200);
  assert.strictEqual(membersRes.body.data.members.length, 1);
});

test("Integration: Diet plan creation and overlap deactivation", async () => {
  const plan1Res = await request(app)
    .post("/api/diet")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({
      name: "Plan Alpha",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      days: [
        {
          dayOfWeek: 2,
          meals: [
            {
              mealId: "meal_test_1",
              name: "Oatmeal Bowl",
              scheduledTime: "08:00",
              foodItems: [{ name: "Oats", quantity: 60, unit: "g", calories: 220, protein: 8, carbs: 40, fats: 4 }],
            },
          ],
        },
      ],
    });

  assert.strictEqual(plan1Res.status, 201);
  const plan1 = plan1Res.body.data.dietPlan;
  assert.strictEqual(plan1.isActive, true);

  // Overlapping plan should automatically deactivate older plan
  const plan2Res = await request(app)
    .post("/api/diet")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({
      name: "Plan Beta",
      startDate: "2026-11-15",
      endDate: "2026-12-15",
      days: [],
    });

  assert.strictEqual(plan2Res.status, 201);
  const updatedPlan1 = await DietPlan.findById(plan1._id);
  assert.strictEqual(updatedPlan1.isActive, false);
});

test("Integration: Daily meal log idempotent creation & status transitions", async () => {
  // Activate Plan Alpha for today
  const plan = await DietPlan.create({
    userId: testUser._id,
    name: "Active Test Plan",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    isActive: true,
    days: [
      {
        dayOfWeek: 2,
        meals: [
          {
            mealId: "m_test_a",
            name: "Morning Fuel",
            scheduledTime: "08:30",
            foodItems: [{ name: "Protein Shake", quantity: 300, unit: "ml", calories: 200, protein: 30, carbs: 5, fats: 3 }],
          },
        ],
      },
    ],
  });

  const logRes1 = await request(app)
    .post("/api/meals/log")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({ date: "2026-11-10" });

  assert.strictEqual(logRes1.status, 200);
  const logId = logRes1.body.data.mealLog._id;

  // Concurrent / second call should return same log without duplicates
  const logRes2 = await request(app)
    .post("/api/meals/log")
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({ date: "2026-11-10" });

  assert.strictEqual(logRes2.status, 200);
  assert.strictEqual(logRes2.body.data.mealLog._id, logId);

  // Transition to eaten
  const updateRes = await request(app)
    .patch(`/api/meals/log/${logId}`)
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({ mealId: "m_test_a", status: "eaten" });

  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.data.mealLog.meals[0].status, "eaten");

  // Undo back to pending
  const undoRes = await request(app)
    .patch(`/api/meals/log/${logId}`)
    .set("Authorization", `Bearer ${testUserToken}`)
    .send({ mealId: "m_test_a", status: "pending" });

  assert.strictEqual(undoRes.status, 200);
  assert.strictEqual(undoRes.body.data.mealLog.meals[0].status, "pending");
});

test("Integration: Privacy controls on group member endpoints", async () => {
  // Update test user's privacy to private
  await FitnessProfile.findOneAndUpdate(
    { userId: testUser._id },
    { $set: { "privacy.weight": "private" } }
  );

  // Another member views test group
  const otherUser = await User.create({
    name: "Other Member",
    email: `other_${Date.now()}@example.com`,
    password: "Password123!",
  });
  await Membership.create({
    groupId: testGroup._id,
    userId: otherUser._id,
    status: "active",
  });

  const otherToken = require("jsonwebtoken").sign(
    { id: otherUser._id, email: otherUser.email },
    require("../Config/env").JWT_ACCESS_SECRET
  );

  const membersRes = await request(app)
    .get(`/api/groups/${testGroup._id}/members`)
    .set("Authorization", `Bearer ${otherToken}`);

  assert.strictEqual(membersRes.status, 200);
  const targetMember = membersRes.body.data.members.find((m) => m.userId.toString() === testUser._id.toString());
  // Because privacy.weight is private and otherUser is viewing, weight should be hidden
  assert.strictEqual(targetMember.profile.weight, null);
});
