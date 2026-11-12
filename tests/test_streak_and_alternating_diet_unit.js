const { test } = require("node:test");
const assert = require("node:assert");

const DietPlan = require("../Modals/DietPlan");
const MealLog = require("../Modals/MealLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const FitnessProfile = require("../Modals/FitnessProfile");

const mealController = require("../Controllers/mealController");
const dietController = require("../Controllers/dietController");
const { resolvePlanMealsForDate } = require("../Utils/dietSchedule");
const { getLocalDateString, addDaysToDateString } = require("../Utils/date");

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

test("resolvePlanMealsForDate handles simple, alternating A/B, and legacy weekly schedules", () => {
  const simplePlan = {
    scheduleMode: "simple",
    simpleMeals: [{ mealId: "s1", name: "Daily Breakfast", foodItems: [] }],
    days: [{ dayOfWeek: 1, meals: [{ mealId: "w1", name: "Legacy Mon", foodItems: [] }] }],
  };
  assert.strictEqual(resolvePlanMealsForDate(simplePlan, "2026-11-12").meals[0].name, "Daily Breakfast");

  const altPlan = {
    scheduleMode: "alternating",
    startDate: "2026-11-10",
    alternatingConfig: {
      anchorDate: "2026-11-12",
      dietAName: "High Carb",
      dietBName: "Low Carb",
      dietAMeals: [{ mealId: "a1", name: "Oats & Rice", foodItems: [] }],
      dietBMeals: [{ mealId: "b1", name: "Eggs & Paneer", foodItems: [] }],
    },
    days: [{ dayOfWeek: 4, meals: [{ mealId: "w4", name: "Legacy Thu", foodItems: [] }] }],
  };

  const day0 = resolvePlanMealsForDate(altPlan, "2026-11-12");
  const day1 = resolvePlanMealsForDate(altPlan, "2026-11-13");
  const day2 = resolvePlanMealsForDate(altPlan, "2026-11-14");
  const prev1 = resolvePlanMealsForDate(altPlan, "2026-11-11");
  const prev2 = resolvePlanMealsForDate(altPlan, "2026-11-10");

  assert.strictEqual(day0.variantKey, "A");
  assert.strictEqual(day0.meals[0].name, "Oats & Rice");
  assert.strictEqual(day1.variantKey, "B");
  assert.strictEqual(day1.meals[0].name, "Eggs & Paneer");
  assert.strictEqual(day2.variantKey, "A");
  assert.strictEqual(prev1.variantKey, "B");
  assert.strictEqual(prev2.variantKey, "A");

  // Legacy plan without scheduleMode still uses weekly dayOfWeek
  const legacyWeekly = {
    days: [{ dayOfWeek: 4, meals: [{ mealId: "w4", name: "Legacy Thu", foodItems: [] }] }],
  };
  // 2026-11-12 is Thursday (dayOfWeek = 4)
  assert.strictEqual(resolvePlanMealsForDate(legacyWeekly, "2026-11-12").meals[0].name, "Legacy Thu");
});

test("getMyDashboardSummary preserves multi-day active streak mid-day and counts today when active", async () => {
  const origProfileFindOne = FitnessProfile.findOne;
  const origMealFind = MealLog.find;
  const origMealFindOne = MealLog.findOne;
  const origWorkoutFind = WorkoutSession.find;
  const origWorkoutFindOne = WorkoutSession.findOne;
  const origWaterFind = WaterLog.find;
  const origWaterFindOne = WaterLog.findOne;

  try {
    const tz = "Asia/Kolkata";
    const todayStr = getLocalDateString(new Date(), tz);
    const d1 = addDaysToDateString(todayStr, -1);
    const d2 = addDaysToDateString(todayStr, -2);
    const d3 = addDaysToDateString(todayStr, -3);
    const d4 = addDaysToDateString(todayStr, -4);

    // 4 consecutive days ending yesterday: d-1 (water >=75%), d-2 (workout rest), d-3 (meal), d-4 (workout completed)
    const pastMeals = [
      {
        date: d3,
        meals: [
          {
            mealId: "m1",
            mealName: "Lunch",
            status: "eaten",
            plannedFoodItems: [{ itemId: "i1", name: "Rice", quantity: 100, calories: 200, eaten: true }],
          },
        ],
      },
    ];
    const pastWorkouts = [
      { date: d2, status: "rest", workoutName: "Rest" },
      { date: d4, status: "completed", workoutName: "Push" },
    ];
    const pastWater = [{ date: d1, targetMl: 3000, entries: [{ amountMl: 2500 }] }];

    FitnessProfile.findOne = async () => ({ targets: { calories: 2200, waterMl: 3000 } });
    MealLog.findOne = async () => null;
    WorkoutSession.findOne = async () => null;
    WaterLog.findOne = async () => null;
    MealLog.find = () => wrapLeanChain(pastMeals);
    WorkoutSession.find = () => wrapLeanChain(pastWorkouts);
    WaterLog.find = () => wrapLeanChain(pastWater);

    const req = { user: { _id: "u1", timezone: tz } };
    const morningRes = await invokeController(mealController.getMyDashboardSummary, req);
    assert.strictEqual(morningRes.statusCode, 200);
    assert.strictEqual(morningRes.body.data.streak, 4);
    assert.strictEqual(morningRes.body.data.streakDetails.todayActive, false);

    // Now user completes today's workout -> streak becomes 5
    WorkoutSession.findOne = async () => ({ date: todayStr, status: "completed", workoutName: "Pull" });
    WorkoutSession.find = () => wrapLeanChain([...pastWorkouts, { date: todayStr, status: "completed" }]);

    const eveningRes = await invokeController(mealController.getMyDashboardSummary, req);
    assert.strictEqual(eveningRes.body.data.streak, 5);
    assert.strictEqual(eveningRes.body.data.streakDetails.todayActive, true);
  } finally {
    FitnessProfile.findOne = origProfileFindOne;
    MealLog.find = origMealFind;
    MealLog.findOne = origMealFindOne;
    WorkoutSession.find = origWorkoutFind;
    WorkoutSession.findOne = origWorkoutFindOne;
    WaterLog.find = origWaterFind;
    WaterLog.findOne = origWaterFindOne;
  }
});

test("getMealsSummary preserves active >=80% adherence streak mid-day before today hits 80%", async () => {
  const origProfileFindOne = FitnessProfile.findOne;
  const origMealFind = MealLog.find;

  try {
    const tz = "Asia/Kolkata";
    const todayStr = getLocalDateString(new Date(), tz);
    const yest = addDaysToDateString(todayStr, -1);
    const dayBefore = addDaysToDateString(todayStr, -2);

    const logs = [
      {
        date: dayBefore,
        meals: [
          {
            mealId: "m1",
            mealName: "B",
            status: "eaten",
            plannedFoodItems: [{ itemId: "1", name: "Oats", quantity: 1, calories: 200, eaten: true }],
          },
        ],
      },
      {
        date: yest,
        meals: [
          {
            mealId: "m2",
            mealName: "B",
            status: "eaten",
            plannedFoodItems: [{ itemId: "2", name: "Eggs", quantity: 1, calories: 200, eaten: true }],
          },
        ],
      },
      {
        date: todayStr,
        meals: [
          {
            mealId: "m3",
            mealName: "B",
            status: "pending",
            plannedFoodItems: [{ itemId: "3", name: "Lunch", quantity: 1, calories: 400, eaten: false }],
          },
        ],
      },
    ];

    FitnessProfile.findOne = () =>
      wrapLeanChain({ targets: { calories: 2200, protein: 140, carbs: 250, fats: 60 } });
    MealLog.find = () => wrapLeanChain(logs);

    const res = await invokeController(mealController.getMealsSummary, {
      user: { _id: "u1", timezone: tz },
      query: { range: "7d" },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.summary.currentStreak, 2);
  } finally {
    FitnessProfile.findOne = origProfileFindOne;
    MealLog.find = origMealFind;
  }
});

test("updateDietPlan preserves weekly days and already-logged today MealLog when switching to alternating mode", async () => {
  const origPlanFindOne = DietPlan.findOne;
  const origMealFindOne = MealLog.findOne;

  try {
    const tz = "Asia/Kolkata";
    const todayStr = getLocalDateString(new Date(), tz);

    const existingDays = [
      {
        dayOfWeek: 1,
        meals: [{ mealId: "w1", name: "Monday Special", scheduledTime: "09:00", foodItems: [] }],
      },
    ];

    const planDoc = {
      _id: "plan1",
      userId: "u1",
      name: "My Plan",
      startDate: "2026-01-01",
      endDate: "2035-12-31",
      isActive: true,
      scheduleMode: "weekly",
      simpleMeals: [],
      alternatingConfig: { anchorDate: todayStr, dietAName: "Diet A", dietBName: "Diet B", dietAMeals: [], dietBMeals: [] },
      days: existingDays,
      saveCalled: false,
      async save() {
        this.saveCalled = true;
      },
    };

    const todayLoggedMealLog = {
      _id: "log1",
      userId: "u1",
      date: todayStr,
      meals: [
        {
          mealId: "w1",
          mealName: "Monday Special",
          status: "eaten",
          plannedFoodItems: [{ itemId: "i1", name: "Oats", quantity: 50, calories: 200, eaten: true }],
          actualFoodItems: [],
        },
      ],
      saved: false,
      async save() {
        this.saved = true;
      },
    };

    DietPlan.findOne = async () => planDoc;
    MealLog.findOne = async () => todayLoggedMealLog;

    const req = {
      params: { id: "plan1" },
      user: { _id: "u1", timezone: tz },
      body: {
        scheduleMode: "alternating",
        alternatingConfig: {
          anchorDate: todayStr,
          dietAName: "Veg Day",
          dietBName: "Eggs Day",
          dietAMeals: [{ mealId: "a1", name: "Paneer Bowl", scheduledTime: "13:00", foodItems: [] }],
          dietBMeals: [{ mealId: "b1", name: "Egg Bhurji", scheduledTime: "13:00", foodItems: [] }],
        },
      },
    };

    const res = await invokeController(dietController.updateDietPlan, req);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(planDoc.saveCalled, true);
    // Original weekly days preserved intact!
    assert.strictEqual(planDoc.days[0].meals[0].name, "Monday Special");
    // Today's logged MealLog preserved untouched!
    assert.strictEqual(todayLoggedMealLog.saved, false);
    assert.strictEqual(res.body.data.preserved, true);

    // Case 2: Untouched auto-generated today MealLog (0 eaten items) gets safely synced!
    const untouchedTodayLog = {
      _id: "log2",
      userId: "u1",
      date: todayStr,
      meals: [
        {
          mealId: "w1",
          mealName: "Old Auto Meal",
          status: "pending",
          plannedFoodItems: [{ itemId: "i1", name: "Old Food", quantity: 50, calories: 200, eaten: false }],
          actualFoodItems: [],
        },
      ],
      saved: false,
      async save() {
        this.saved = true;
      },
    };
    MealLog.findOne = async () => untouchedTodayLog;
    const res2 = await invokeController(dietController.updateDietPlan, req);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(untouchedTodayLog.saved, true);
    assert.strictEqual(untouchedTodayLog.meals[0].mealName, "Paneer Bowl");
    assert.strictEqual(res2.body.data.synced, true);
  } finally {
    DietPlan.findOne = origPlanFindOne;
    MealLog.findOne = origMealFindOne;
  }
});
