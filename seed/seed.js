const mongoose = require("mongoose");
const config = require("../Config/env");
const User = require("../Modals/User");
const FitnessProfile = require("../Modals/FitnessProfile");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const DietPlan = require("../Modals/DietPlan");
const MealLog = require("../Modals/MealLog");
const WorkoutPlan = require("../Modals/WorkoutPlan");
const WorkoutSession = require("../Modals/WorkoutSession");
const WaterLog = require("../Modals/WaterLog");
const BodyMetric = require("../Modals/BodyMetric");
const Challenge = require("../Modals/Challenge");
const ChallengeEntry = require("../Modals/ChallengeEntry");
const PointsLedger = require("../Modals/PointsLedger");
const Badge = require("../Modals/Badge");
const UserBadge = require("../Modals/UserBadge");
const WeeklyTarget = require("../Modals/WeeklyTarget");
const WeightLog = require("../Modals/WeightLog");
const ReminderSetting = require("../Modals/ReminderSetting");
const ReminderEvent = require("../Modals/ReminderEvent");
const ProgressPhotoSet = require("../Modals/ProgressPhotoSet");
const { getLocalDateString, getISOWeekDetails, addDaysToDateString, anchorDateFromLocalString } = require("../Utils/date");
const { SEEDED_BADGES, POINTS_RULES } = require("../Utils/gamification");

const seedDatabase = async () => {
  try {
    console.log("🌱 Connecting to database for seeding...");
    await mongoose.connect(config.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Clear existing test/demo data
    console.log("🧹 Cleaning old demo data...");
    const demoEmails = [
      "alex@fittogether.test",
      "sam@fittogether.test",
      "maya@fittogether.test",
      "liam@fittogether.test",
      "zoe@fittogether.test",
    ];

    const existingUsers = await User.find({ email: { $in: demoEmails } });
    const userIds = existingUsers.map((u) => u._id);

    await User.deleteMany({ _id: { $in: userIds } });
    await FitnessProfile.deleteMany({ userId: { $in: userIds } });
    await Group.deleteMany({ inviteCode: "SQUAD123" });
    await Membership.deleteMany({ userId: { $in: userIds } });
    await DietPlan.deleteMany({ userId: { $in: userIds } });
    await MealLog.deleteMany({ userId: { $in: userIds } });
    await WorkoutPlan.deleteMany({ userId: { $in: userIds } });
    await WorkoutSession.deleteMany({ userId: { $in: userIds } });
    await WaterLog.deleteMany({ userId: { $in: userIds } });
    await BodyMetric.deleteMany({ userId: { $in: userIds } });
    await PointsLedger.deleteMany({ userId: { $in: userIds } });
    await ChallengeEntry.deleteMany({ userId: { $in: userIds } });
    await UserBadge.deleteMany({ userId: { $in: userIds } });
    await WeeklyTarget.deleteMany({ userId: { $in: userIds } });
    await WeightLog.deleteMany({ userId: { $in: userIds } });
    await ReminderSetting.deleteMany({ userId: { $in: userIds } });
    await ReminderEvent.deleteMany({ userId: { $in: userIds } });
    await ProgressPhotoSet.deleteMany({ userId: { $in: userIds } });

    // Seed Badges catalogue
    console.log("🏅 Seeding badges catalogue...");
    for (const b of SEEDED_BADGES) {
      await Badge.findOneAndUpdate({ code: b.code }, { $set: b }, { upsert: true });
    }

    // 1. Create 5 Users
    console.log("👥 Creating 5 demo users...");
    const usersData = [
      { name: "Alex Rivera", email: "alex@fittogether.test", timezone: "Asia/Kolkata" },
      { name: "Sam Chen", email: "sam@fittogether.test", timezone: "Asia/Kolkata" },
      { name: "Maya Patel", email: "maya@fittogether.test", timezone: "Asia/Kolkata" },
      { name: "Liam Walker", email: "liam@fittogether.test", timezone: "Asia/Kolkata" },
      { name: "Zoe Taylor", email: "zoe@fittogether.test", timezone: "Asia/Kolkata" },
    ];

    const users = [];
    for (const ud of usersData) {
      const u = await User.create({
        name: ud.name,
        email: ud.email,
        password: "Password123!",
        timezone: ud.timezone,
      });
      users.push(u);
    }

    // 2. Create Fitness Profiles
    console.log("📊 Creating fitness profiles...");
    const profilesData = [
      { goal: "muscle_gain", weight: 75, target: 80, cal: 2600, p: 160, c: 300, f: 70, water: 3500 },
      { goal: "fat_loss", weight: 82, target: 74, cal: 1900, p: 150, c: 180, f: 50, water: 3200 },
      { goal: "strength", weight: 68, target: 70, cal: 2300, p: 140, c: 260, f: 65, water: 3000 },
      { goal: "general_fitness", weight: 62, target: 60, cal: 1800, p: 110, c: 200, f: 55, water: 2800 },
      { goal: "maintenance", weight: 70, target: 70, cal: 2100, p: 130, c: 240, f: 60, water: 3000 },
    ];

    for (let i = 0; i < users.length; i++) {
      const p = profilesData[i];
      await FitnessProfile.create({
        userId: users[i]._id,
        age: 26 + i,
        gender: i % 2 === 0 ? "male" : "female",
        height: 170 + i * 2,
        currentWeight: p.weight,
        targetWeight: p.target,
        fitnessGoal: p.goal,
        activityLevel: "moderate",
        dietPreference: i === 2 ? "vegetarian" : "non_vegetarian",
        targets: {
          calories: p.cal,
          protein: p.p,
          carbs: p.c,
          fats: p.f,
          waterMl: p.water,
        },
        privacy: {
          weight: i === 0 ? "private" : "group",
          measurements: i === 0 ? "private" : "group",
          photos: "private",
        },
        featureFlags: {
          reminders: true,
          weeklyTargets: true,
          photoCheckins: true,
        },
        featureFlagsConfigured: true,
        targetDefaults: {
          enabled: i === 0,
          weightChangeKgPerWeek: i === 0 ? 0.25 : i === 1 ? -0.4 : 0,
          weighInsTarget: 5,
          waistChangeCm: null,
          note: "Consistent weekly pace",
        },
      });
    }

    // 3. Create Group & Memberships
    console.log("🛡️ Creating group FitSquad Alpha...");
    const group = await Group.create({
      name: "FitSquad Alpha",
      description: "Daily consistency squad: food, workouts, and unbroken streaks!",
      createdBy: users[0]._id,
      inviteCode: "SQUAD123",
      maxMembers: 15,
    });

    for (let i = 0; i < users.length; i++) {
      await Membership.create({
        groupId: group._id,
        userId: users[i]._id,
        role: i === 0 ? "admin" : "member",
        status: "active",
      });
    }

    const todayStr = getLocalDateString(new Date(), "Asia/Kolkata");
    const past7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      past7Days.push(getLocalDateString(d, "Asia/Kolkata"));
    }

    // 4. Create Diet Plans & Meal Logs
    console.log("🥗 Creating diet plans and logs...");
    const sampleMeals = [
      {
        mealId: "m1",
        name: "Power Breakfast",
        scheduledTime: "08:30",
        foodItems: [
          { name: "Oats with berries", quantity: 80, unit: "g", calories: 300, protein: 12, carbs: 54, fats: 5 },
          { name: "Eggs / Tofu", quantity: 3, unit: "pieces", calories: 210, protein: 18, carbs: 2, fats: 14 },
        ],
      },
      {
        mealId: "m2",
        name: "Nutrient Lunch",
        scheduledTime: "13:00",
        foodItems: [
          { name: "Brown Rice", quantity: 150, unit: "g", calories: 330, protein: 8, carbs: 68, fats: 3 },
          { name: "Grilled Chicken Breast / Paneer", quantity: 150, unit: "g", calories: 250, protein: 35, carbs: 3, fats: 9 },
          { name: "Mixed Veggies", quantity: 100, unit: "g", calories: 50, protein: 2, carbs: 10, fats: 1 },
        ],
      },
      {
        mealId: "m3",
        name: "Pre-Workout Snack",
        scheduledTime: "17:00",
        foodItems: [
          { name: "Banana with Peanut Butter", quantity: 1, unit: "serving", calories: 220, protein: 6, carbs: 32, fats: 9 },
        ],
      },
      {
        mealId: "m4",
        name: "Recovery Dinner",
        scheduledTime: "20:30",
        foodItems: [
          { name: "Quinoa Bowl / Roti", quantity: 2, unit: "servings", calories: 280, protein: 10, carbs: 50, fats: 4 },
          { name: "Lentil Soup / Dal", quantity: 200, unit: "ml", calories: 180, protein: 14, carbs: 26, fats: 3 },
        ],
      },
    ];

    const days = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      meals: sampleMeals,
    }));

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const dietPlan = await DietPlan.create({
        userId: u._id,
        groupId: group._id,
        name: `${u.name}'s Consistency Plan`,
        startDate: past7Days[0],
        endDate: "2026-12-31",
        isActive: true,
        days,
      });

      // Populate logs for past days
      for (const d of past7Days) {
        const isToday = d === todayStr;
        const mealsLog = sampleMeals.map((m, mIdx) => ({
          mealId: m.mealId,
          mealName: m.name,
          scheduledTime: m.scheduledTime,
          plannedFoodItems: m.foodItems,
          actualFoodItems: m.foodItems,
          status: isToday && mIdx > 1 ? (i % 2 === 0 ? "eaten" : "pending") : "eaten",
          completedAt: new Date(),
        }));

        await MealLog.create({
          userId: u._id,
          groupId: group._id,
          dietPlanId: dietPlan._id,
          date: d,
          meals: mealsLog,
        });

        // Add Points
        const eatenCount = mealsLog.filter((m) => m.status === "eaten").length;
        await PointsLedger.create({
          userId: u._id,
          groupId: group._id,
          date: d,
          type: "meals",
          points: eatenCount * 10,
          meta: { eatenMeals: eatenCount, totalMeals: mealsLog.length },
        });

        // Water Log
        await WaterLog.create({
          userId: u._id,
          date: d,
          targetMl: 3000,
          entries: [
            { amountMl: 500, consumedAt: new Date() },
            { amountMl: 500, consumedAt: new Date() },
            { amountMl: 500, consumedAt: new Date() },
            { amountMl: 500, consumedAt: new Date() },
            { amountMl: 1000, consumedAt: new Date() },
          ],
        });

        await PointsLedger.create({
          userId: u._id,
          groupId: group._id,
          date: d,
          type: "water",
          points: POINTS_RULES.WATER_GOAL_REACHED,
        });
      }

      // 5. Workout Plan & Session
      await WorkoutPlan.create({
        userId: u._id,
        groupId: group._id,
        name: "Strength & Hypertrophy",
        isActive: true,
        schedule: [
          {
            dayOfWeek: 1,
            workoutName: "Chest & Triceps",
            exercises: [
              { name: "Bench Press", targetSets: 4, targetReps: 8, targetWeight: 70, restSeconds: 90 },
              { name: "Incline DB Press", targetSets: 3, targetReps: 10, targetWeight: 24, restSeconds: 60 },
            ],
          },
          {
            dayOfWeek: 2,
            workoutName: "Back & Biceps",
            exercises: [
              { name: "Pull-Ups", targetSets: 4, targetReps: 8, targetWeight: 0, restSeconds: 90 },
              { name: "Barbell Rows", targetSets: 3, targetReps: 10, targetWeight: 60, restSeconds: 60 },
            ],
          },
        ],
      });

      await WorkoutSession.create({
        userId: u._id,
        date: todayStr,
        workoutName: "Full Body Functional",
        status: "completed",
        durationMinutes: 45,
        exercises: [
          {
            name: "Goblet Squats",
            sets: [
              { setNumber: 1, reps: 12, weight: 20, completed: true },
              { setNumber: 2, reps: 10, weight: 24, completed: true },
            ],
          },
        ],
      });

      await PointsLedger.create({
        userId: u._id,
        groupId: group._id,
        date: todayStr,
        type: "workout",
        points: POINTS_RULES.WORKOUT_COMPLETED,
      });

      // Award Initial Badges
      await UserBadge.create({
        userId: u._id,
        groupId: group._id,
        badgeCode: "FIRST_LOG",
        earnedAt: new Date(),
      });
      if (i < 3) {
        await UserBadge.create({
          userId: u._id,
          groupId: group._id,
          badgeCode: "STREAK_7",
          earnedAt: new Date(),
        });
      }
    }

    // 6. Create Active Group Challenge
    console.log("🏆 Creating group challenge...");
    const challenge = await Challenge.create({
      groupId: group._id,
      title: "7-Day Consistency Rush",
      description: "Hit your daily meal plan targets 5 out of 7 days to earn the Champion title!",
      challengeType: "meal_completion",
      target: 5,
      startDate: past7Days[0],
      endDate: past7Days[6],
      createdBy: users[0]._id,
      status: "active",
    });

    for (let i = 0; i < users.length; i++) {
      await ChallengeEntry.create({
        challengeId: challenge._id,
        userId: users[i]._id,
        progress: 4 + (i % 2),
        completed: 4 + (i % 2) >= 5,
        completedAt: 4 + (i % 2) >= 5 ? new Date() : null,
      });
    }

    // 7. Seed Demo Weekly Targets (8 weeks), Reminder Settings & 3 Bi-Weekly Photo Sets for Alex
    console.log("📅 Seeding 8 weeks of targets, smart reminders & 3 progress photo sets...");
    const demoUser = users[0];
    const demoTz = demoUser.timezone || "Asia/Kolkata";
    const todayLocal = getLocalDateString(new Date(), demoTz);
    const { weekStart: currentWeekMonday } = getISOWeekDetails(todayLocal);
    const photoAnchorStr = addDaysToDateString(currentWeekMonday, -42); // 6 weeks ago -> 3 completed cycles

    await ReminderSetting.create({
      userId: demoUser._id,
      timezone: demoTz,
      dailyWeight: { enabled: true, time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], onlyIfNotLogged: true },
      weeklyMeasurements: { enabled: true, weekday: 0, time: "08:00" },
      biweeklyPhotos: {
        enabled: true,
        weekday: 0,
        time: "08:30",
        anchorDate: anchorDateFromLocalString(photoAnchorStr, demoTz),
      },
      weeklyTarget: { enabled: true, weekday: 0, time: "20:00" },
      quietHours: { enabled: true, from: "22:00", to: "06:00" },
      channels: { inApp: true, push: false },
      snoozeMinutes: 60,
    });

    // Seed 9 weeks of daily weights so the 8 weekly target comparisons have on-track & behind mix
    // Demo user goal is lean gain (+0.25 kg/wk) from 73.2 kg -> ~75.0 kg
    const weeklyAvgDeltas = [0.22, 0.28, 0.05, 0.3, 0.25, 0.08, 0.26, 0.24];
    let runningAvg = 73.0;

    // Baseline week (-8 weeks back)
    const baselineMonday = addDaysToDateString(currentWeekMonday, -56);
    for (let d = 0; d < 5; d++) {
      await WeightLog.findOneAndUpdate(
        { userId: demoUser._id, date: addDaysToDateString(baselineMonday, d) },
        { $set: { weightKg: +(runningAvg + (d % 2 === 0 ? -0.1 : 0.1)).toFixed(1), timeOfDay: "morning" } },
        { upsert: true }
      );
    }

    for (let w = 0; w < 8; w++) {
      const weeksAgo = 7 - w;
      const ws = addDaysToDateString(currentWeekMonday, -7 * weeksAgo);
      runningAvg = +(runningAvg + weeklyAvgDeltas[w]).toFixed(2);

      await WeeklyTarget.create({
        userId: demoUser._id,
        weekStart: ws,
        weightChangeKgPerWeek: 0.25,
        weighInsTarget: 5,
        waistChangeCm: null,
        note: w % 3 === 2 ? "Busy travel week — stayed steady" : "Clean lean-gain progression",
        source: w === 0 ? "manual" : "carried_over",
      });

      const logsThisWeek = w === 7 ? 3 : 5;
      for (let d = 0; d < logsThisWeek; d++) {
        const logDate = addDaysToDateString(ws, d);
        if (logDate <= todayLocal) {
          const jitter = ((d % 3) - 1) * 0.1;
          await WeightLog.findOneAndUpdate(
            { userId: demoUser._id, date: logDate },
            { $set: { weightKg: +(runningAvg + jitter).toFixed(1), timeOfDay: "morning" } },
            { upsert: true }
          );
        }
      }
    }

    const buildPosePlaceholder = (poseLabel, cycleNum, dateStr, hue) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue},65%,92%)"/><stop offset="100%" stop-color="hsl(${hue},55%,82%)"/></linearGradient></defs><rect width="480" height="640" rx="24" fill="url(#g)"/><circle cx="240" cy="180" r="46" fill="rgba(15,23,42,0.16)"/><rect x="175" y="238" width="130" height="210" rx="44" fill="rgba(15,23,42,0.14)"/><text x="240" y="520" text-anchor="middle" font-family="sans-serif" font-size="24" font-weight="800" fill="#0F172A">${poseLabel}</text><text x="240" y="555" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#475569">Cycle ${cycleNum} · ${dateStr}</text></svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };

    for (let c = 1; c <= 3; c++) {
      const cycleDate = addDaysToDateString(photoAnchorStr, (c - 1) * 14);
      const snapWeight = +(73.2 + (c - 1) * 0.6).toFixed(1);
      await ProgressPhotoSet.create({
        userId: demoUser._id,
        date: cycleDate,
        cycleNumber: c,
        weightKg: snapWeight,
        note: `Bi-weekly check-in #${c} (consistent morning lighting)`,
        visibility: "private",
        photos: {
          front_relaxed: {
            url: buildPosePlaceholder("Front Relaxed", c, cycleDate, 140 + c * 25),
            publicId: `seed_c${c}_front`,
            takenAt: anchorDateFromLocalString(cycleDate, demoTz),
          },
          side_relaxed: {
            url: buildPosePlaceholder("Side Relaxed", c, cycleDate, 160 + c * 25),
            publicId: `seed_c${c}_side`,
            takenAt: anchorDateFromLocalString(cycleDate, demoTz),
          },
          back_relaxed: {
            url: buildPosePlaceholder("Back Relaxed", c, cycleDate, 180 + c * 25),
            publicId: `seed_c${c}_back`,
            takenAt: anchorDateFromLocalString(cycleDate, demoTz),
          },
        },
      });
    }

    console.log("==================================================");
    console.log("🎉 FitTogether Seed completed successfully!");
    console.log("Group: FitSquad Alpha (Invite Code: SQUAD123)");
    console.log("Demo Users (Password: Password123!):");
    users.forEach((u) => console.log(`  - ${u.name} (${u.email})`));
    console.log("==================================================");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exit(1);
  }
};

seedDatabase();
