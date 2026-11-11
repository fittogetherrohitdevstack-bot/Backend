const { test } = require("node:test");
const assert = require("node:assert");

const Membership = require("../Modals/Membership");
const FitnessProfile = require("../Modals/FitnessProfile");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const PointsLedger = require("../Modals/PointsLedger");

const groupController = require("../Controllers/groupController");
const mealController = require("../Controllers/mealController");
const waterController = require("../Controllers/waterController");
const leaderboardController = require("../Controllers/leaderboardController");
const { getLocalDateString } = require("../Utils/date");

const invokeController = (fn, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve(this);
        return this;
      },
    };
    Promise.resolve(fn(req, res, (err) => (err ? reject(err) : resolve(res)))).catch(reject);
  });

const wrapLeanChain = (value) => ({
  select: () => wrapLeanChain(value),
  populate: () => wrapLeanChain(value),
  lean: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

test("Squad dashboard & account dashboard agree on meals without groupId, partial items, and profile water targets", async () => {
  const origMembershipFind = Membership.find;
  const origProfileFind = FitnessProfile.find;
  const origProfileFindOne = FitnessProfile.findOne;
  const origMealFind = MealLog.find;
  const origMealFindOne = MealLog.findOne;
  const origWorkoutFind = WorkoutSession.find;
  const origWorkoutFindOne = WorkoutSession.findOne;
  const origWaterFind = WaterLog.find;
  const origWaterFindOne = WaterLog.findOne;

  try {
    const userId = "65f000000000000000000001";
    const groupId = "65f000000000000000000099";
    const tz = "Asia/Kolkata";
    const todayStr = getLocalDateString(new Date(), tz);

    const sampleMealLog = {
      userId,
      groupId: null, // Created from DietTemplate / Tracker without groupId
      date: todayStr,
      meals: [
        {
          mealId: "m1",
          mealName: "Breakfast",
          status: "partial",
          plannedFoodItems: [
            { itemId: "i1", name: "Oats", quantity: 60, calories: 230, protein: 8, carbs: 40, fats: 4, eaten: true },
            { itemId: "i2", name: "Eggs", quantity: 2, calories: 140, protein: 12, carbs: 1, fats: 10, eaten: false },
          ],
        },
        {
          mealId: "m2",
          mealName: "Lunch",
          status: "eaten",
          plannedFoodItems: [
            { itemId: "i3", name: "Chicken", quantity: 150, calories: 247, protein: 46, carbs: 0, fats: 5, eaten: true },
          ],
        },
      ],
    };

    const sampleWaterLog = {
      userId,
      date: todayStr,
      targetMl: 3000, // Stale target on WaterLog before profile change
      entries: [{ amountMl: 1250 }, { amountMl: 500 }],
    };

    const sampleProfile = {
      userId,
      targets: { calories: 2200, protein: 140, carbs: 250, fats: 60, waterMl: 2500 },
    };

    let seenMealQuery = null;
    Membership.find = () =>
      wrapLeanChain([
        {
          role: "admin",
          userId: {
            _id: userId,
            name: "Rohit",
            email: "rohit@example.com",
            profileImage: "",
            timezone: tz,
            toObject() {
              return { _id: this._id, name: this.name, profileImage: this.profileImage, timezone: this.timezone };
            },
          },
        },
      ]);
    FitnessProfile.find = () => wrapLeanChain([sampleProfile]);
    FitnessProfile.findOne = () => wrapLeanChain(sampleProfile);
    MealLog.find = (q) => {
      seenMealQuery = q;
      return wrapLeanChain([sampleMealLog]);
    };
    MealLog.findOne = () => wrapLeanChain(sampleMealLog);
    WorkoutSession.find = () => wrapLeanChain([]);
    WorkoutSession.findOne = () => wrapLeanChain(null);
    WaterLog.find = () => wrapLeanChain([sampleWaterLog]);
    WaterLog.findOne = () => wrapLeanChain(sampleWaterLog);

    const sqRes = await invokeController(groupController.getGroupDashboard, {
      group: { _id: groupId },
      user: { _id: userId, timezone: tz },
    });

    const accRes = await invokeController(mealController.getMyDashboardSummary, {
      user: { _id: userId, timezone: tz },
    });

    // Must NOT filter MealLog by groupId
    assert.strictEqual(seenMealQuery.groupId, undefined);

    const sqToday = sqRes.body.data.members[0].today;
    const accNutrition = accRes.body.data.nutrition;
    const accWater = accRes.body.data.water;

    // 2 of 3 items eaten = 67%, 1 of 2 full meals eaten
    assert.strictEqual(sqToday.mealCompletionRate, 67);
    assert.strictEqual(sqToday.mealCompletionRate, accNutrition.mealCompletionPercent);
    assert.strictEqual(sqToday.itemsCompleted, accNutrition.itemsCompleted);
    assert.strictEqual(sqToday.totalItems, accNutrition.totalItems);
    assert.strictEqual(sqToday.eatenMeals, accNutrition.eatenMeals);
    assert.strictEqual(sqToday.totalMeals, accNutrition.totalMeals);

    // Profile water target (2500 ml) & progress (1750 / 2500 = 70%) match identically
    assert.strictEqual(sqToday.waterTarget, 2500);
    assert.strictEqual(sqToday.totalWaterMl, 1750);
    assert.strictEqual(sqToday.waterProgressPercent, 70);
    assert.strictEqual(sqToday.waterTarget, accWater.targetMl);
    assert.strictEqual(sqToday.totalWaterMl, accWater.consumedMl);
    assert.strictEqual(sqToday.waterProgressPercent, accWater.percent);
  } finally {
    Membership.find = origMembershipFind;
    FitnessProfile.find = origProfileFind;
    FitnessProfile.findOne = origProfileFindOne;
    MealLog.find = origMealFind;
    MealLog.findOne = origMealFindOne;
    WorkoutSession.find = origWorkoutFind;
    WorkoutSession.findOne = origWorkoutFindOne;
    WaterLog.find = origWaterFind;
    WaterLog.findOne = origWaterFindOne;
  }
});

test("Water deletion removes stale water PointsLedger entry when below profile target", async () => {
  const origProfileFindOne = FitnessProfile.findOne;
  const origWaterFindOne = WaterLog.findOne;
  const origMembershipFind = Membership.find;
  const origLedgerDeleteOne = PointsLedger.deleteOne;

  try {
    const userId = "65f000000000000000000002";
    const tz = "Asia/Kolkata";
    const todayStr = getLocalDateString(new Date(), tz);
    let deletedFilter = null;

    const fakeWaterDoc = {
      userId,
      date: todayStr,
      targetMl: 2500,
      entries: [
        { _id: { toString: () => "e1" }, amountMl: 1500 },
        { _id: { toString: () => "e2" }, amountMl: 1000 },
      ],
      async save() {
        return this;
      },
    };

    FitnessProfile.findOne = () => wrapLeanChain({ userId, targets: { waterMl: 2500 } });
    WaterLog.findOne = () => wrapLeanChain(fakeWaterDoc);
    Membership.find = () => wrapLeanChain([{ groupId: "65f000000000000000000077" }]);
    PointsLedger.deleteOne = async (filter) => {
      deletedFilter = filter;
      return { deletedCount: 1 };
    };

    const res = await invokeController(waterController.deleteWaterEntry, {
      params: { entryId: "e2" },
      user: { _id: userId, name: "A", timezone: tz },
    });

    assert.strictEqual(res.body.data.totalConsumed, 1500);
    assert.strictEqual(res.body.data.targetMl, 2500);
    assert.strictEqual(res.body.data.percent, 60);
    assert.deepStrictEqual(deletedFilter, { userId, date: todayStr, type: "water" });
  } finally {
    FitnessProfile.findOne = origProfileFindOne;
    WaterLog.findOne = origWaterFindOne;
    Membership.find = origMembershipFind;
    PointsLedger.deleteOne = origLedgerDeleteOne;
  }
});

test("Leaderboard sums active member points across squads without filtering out secondary squads", async () => {
  const origMembershipFind = Membership.find;
  const origLedgerFind = PointsLedger.find;

  try {
    const userId = "65f000000000000000000003";
    const groupB = "65f000000000000000000088";
    const groupA = "65f000000000000000000011";
    let capturedLedgerQuery = null;

    Membership.find = () =>
      wrapLeanChain([
        {
          role: "member",
          userId: { _id: userId, name: "Tester", profileImage: "" },
        },
      ]);
    PointsLedger.find = (q) => {
      capturedLedgerQuery = q;
      return wrapLeanChain([
        { userId, groupId: groupA, date: "2026-11-11", type: "meals", points: 40 },
        { userId, groupId: groupA, date: "2026-11-11", type: "water", points: 15 },
      ]);
    };

    const res = await invokeController(leaderboardController.getGroupLeaderboard, {
      group: { _id: groupB },
      query: { period: "week" },
      user: { timezone: "Asia/Kolkata" },
    });

    assert.strictEqual(capturedLedgerQuery.groupId, undefined);
    assert.strictEqual(res.body.data.leaderboard[0].mealPoints, 40);
    assert.strictEqual(res.body.data.leaderboard[0].waterPoints, 15);
    assert.strictEqual(res.body.data.leaderboard[0].totalPoints, 55);
  } finally {
    Membership.find = origMembershipFind;
    PointsLedger.find = origLedgerFind;
  }
});
