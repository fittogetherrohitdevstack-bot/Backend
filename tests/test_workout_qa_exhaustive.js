const assert = require("assert");
const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const Exercise = require("../Modals/Exercise");
const WorkoutPlan = require("../Modals/WorkoutPlan");
const WorkoutSession = require("../Modals/WorkoutSession");
const PersonalRecord = require("../Modals/PersonalRecord");
const User = require("../Modals/User");
const Membership = require("../Modals/Membership");
const Group = require("../Modals/Group");
const WORKOUT_TEMPLATES = require("../seed/workoutTemplatesData");
const workoutController = require("../Controllers/workoutController");

console.log("=================================================");
console.log("FITTOGETHER - EXHAUSTIVE WORKOUT QA TEST SUITE");
console.log("=================================================");

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

async function runExhaustiveQA() {
  await connectToDb();
  console.log("✓ Connected to MongoDB for Live QA");

  // Create two isolated test users for QA & Security tests
  const testEmailA = `qa_workout_a_${Date.now()}@example.com`;
  const testEmailB = `qa_workout_b_${Date.now()}@example.com`;

  const userA = await User.create({
    name: "QA Athlete Alpha",
    email: testEmailA,
    password: "Password123!",
    currentStreak: 5,
    highestStreak: 12,
  });

  const userB = await User.create({
    name: "QA Athlete Beta",
    email: testEmailB,
    password: "Password123!",
    currentStreak: 1,
    highestStreak: 3,
  });

  console.log(`✓ Created test accounts: ${userA.name} and ${userB.name}`);

  try {
    // -------------------------------------------------------------
    // PHASE 2 & 3: TEMPLATES & PLANS
    // -------------------------------------------------------------
    console.log("\n--- Testing Workout Templates & Plan Management ---");

    // 1. Get templates
    const resTemplates = mockRes();
    await workoutController.getTemplates({}, resTemplates);
    assert.strictEqual(resTemplates.statusCode, 200);
    assert(resTemplates.body.data.templates.length >= 7, "Should return at least 7 split templates");
    console.log(`✓ GET /api/workouts/templates returned ${resTemplates.body.data.templates.length} templates`);

    // 2. Apply template for User A
    const resApply = mockRes();
    await workoutController.applyTemplate(
      { user: userA, body: { templateKey: "ppl", makeActive: true } },
      resApply
    );
    assert.strictEqual(resApply.statusCode, 201);
    const appliedPlan = resApply.body.data.plan;
    assert.strictEqual(appliedPlan.name, "Push Pull Legs (PPL)");
    assert.strictEqual(appliedPlan.isActive, true);
    console.log(`✓ Applied template PPL successfully (Plan ID: ${appliedPlan._id})`);

    // 3. User A creates custom plan
    const resCustom = mockRes();
    await workoutController.createWorkoutPlan(
      {
        user: userA,
        body: {
          name: "Alpha Heavy Duty Split",
          description: "High intensity single set failure",
          fitnessLevel: "Advanced",
          goal: "Maximum Muscle Hypertrophy",
          daysPerWeek: 3,
          schedule: [
            {
              dayOfWeek: 1,
              dayName: "Chest & Back Day",
              isRestDay: false,
              targetMuscles: ["Chest", "Back"],
              exercises: [
                { name: "Incline Barbell Bench Press", targetSets: 2, targetReps: 6, restSeconds: 120, primaryMuscle: "Chest" },
                { name: "Weighted Chin-Up", targetSets: 2, targetReps: 6, restSeconds: 120, primaryMuscle: "Back" },
              ],
            },
            {
              dayOfWeek: 2,
              dayName: "Active Recovery",
              isRestDay: true,
              targetMuscles: [],
              exercises: [],
            },
          ],
          isActive: false,
        },
      },
      resCustom
    );
    assert.strictEqual(resCustom.statusCode, 201);
    const customPlan = resCustom.body.data.workoutPlan;
    assert.strictEqual(customPlan.name, "Alpha Heavy Duty Split");
    console.log(`✓ Created custom plan "${customPlan.name}"`);

    // 4. Duplicate custom plan
    const resDup = mockRes();
    await workoutController.duplicateWorkoutPlan(
      { user: userA, params: { id: customPlan._id } },
      resDup
    );
    assert.strictEqual(resDup.statusCode, 201);
    const dupPlan = resDup.body.data.plan;
    assert(dupPlan.name.includes("Copy"), "Duplicate should contain (Copy)");
    console.log(`✓ Duplicated plan: ${dupPlan.name}`);

    // 5. Activate duplicate plan
    const resActivate = mockRes();
    await workoutController.activateWorkoutPlan(
      { user: userA, params: { id: dupPlan._id } },
      resActivate
    );
    assert.strictEqual(resActivate.statusCode, 200);
    assert.strictEqual(resActivate.body.data.plan.isActive, true);

    // Verify previously applied PPL plan is now inactive
    const checkPpl = await WorkoutPlan.findById(appliedPlan._id);
    assert.strictEqual(checkPpl.isActive, false, "Original plan should now be inactive");
    console.log("✓ Exclusive single active plan enforced correctly");

    // 6. Delete duplicate plan
    const resDel = mockRes();
    await workoutController.deleteWorkoutPlan(
      { user: userA, params: { id: dupPlan._id } },
      resDel
    );
    assert.strictEqual(resDel.statusCode, 200);
    const checkDeleted = await WorkoutPlan.findById(dupPlan._id);
    assert.strictEqual(checkDeleted, null, "Deleted plan must not exist in DB");
    console.log("✓ Plan deletion verified");

    // Re-activate PPL for subsequent tests
    appliedPlan.isActive = true;
    await appliedPlan.save();

    // -------------------------------------------------------------
    // PHASE 4 & 5: EXERCISE LIBRARY & SEARCH AUDIT
    // -------------------------------------------------------------
    console.log("\n--- Testing Exercise Library & Filter Matrix ---");

    const totalExercises = await Exercise.countDocuments();
    assert(totalExercises >= 2000, `Expected >= 2000 exercises, found ${totalExercises}`);
    console.log(`✓ Total catalogue verified: ${totalExercises} exercises in DB`);

    // Test Exercise Filters API
    const resFilters = mockRes();
    await workoutController.getExerciseFilters({}, resFilters);
    assert.strictEqual(resFilters.statusCode, 200);
    assert(resFilters.body.data.mediaCounts.video >= 300, "Should have >= 300 videos");
    assert(resFilters.body.data.mediaCounts.gif >= 1000, "Should have >= 1000 GIFs");
    console.log(`✓ Live media breakdown verified: Videos=${resFilters.body.data.mediaCounts.video}, GIFs=${resFilters.body.data.mediaCounts.gif}`);

    // Test Search by Name & Special Characters
    const searchTests = [
      { q: "bench press", expectedMin: 1 },
      { q: "BENCH PRESS", expectedMin: 1 },
      { q: "  squat  ", expectedMin: 1 },
      { q: "pull-up", expectedMin: 1 },
      { q: "curl (dumbbell)", expectedMin: 0 }, // Parentheses should not crash
      { q: "nonexistent_xyz_exercise_query_12345", expectedMin: 0, expectedMax: 0 },
    ];

    for (const st of searchTests) {
      const resSearch = mockRes();
      await workoutController.getExercises(
        { user: userA, query: { search: st.q, page: 1, limit: 10 } },
        resSearch
      );
      assert.strictEqual(resSearch.statusCode, 200);
      const count = resSearch.body.data.exercises.length;
      assert(count >= st.expectedMin, `Search "${st.q}" returned ${count}, expected >= ${st.expectedMin}`);
      if (st.expectedMax !== undefined) {
        assert(count <= st.expectedMax, `Search "${st.q}" returned ${count}, expected <= ${st.expectedMax}`);
      }
    }
    console.log("✓ Search query parsing and special character safety verified");

    // Test Toggle Favorite
    const sampleEx = await Exercise.findOne();
    const resFav = mockRes();
    await workoutController.toggleFavoriteExercise(
      { user: userA, params: { id: sampleEx._id } },
      resFav
    );
    assert.strictEqual(resFav.statusCode, 200);
    assert.strictEqual(resFav.body.data.isFavorite, true);

    // Toggle off
    const resUnfav = mockRes();
    await workoutController.toggleFavoriteExercise(
      { user: userA, params: { id: sampleEx._id } },
      resUnfav
    );
    assert.strictEqual(resUnfav.statusCode, 200);
    assert.strictEqual(resUnfav.body.data.isFavorite, false);
    console.log("✓ Exercise favorite toggle verified");

    // -------------------------------------------------------------
    // PHASE 6, 7, 8: LIVE WORKOUT TRACKER & LIFECYCLE
    // -------------------------------------------------------------
    console.log("\n--- Testing Live Workout Session Lifecycle ---");

    // 1. Start workout session
    const resStart = mockRes();
    await workoutController.startWorkoutSession(
      {
        user: userA,
        body: {
          workoutPlanId: appliedPlan._id,
          workoutName: "Push Day Heavy",
          targetMuscles: ["Chest", "Triceps"],
          exercises: [
            {
              name: "Barbell Bench Press",
              primaryMuscle: "Chest",
              targetSets: 3,
              targetReps: 8,
            },
            {
              name: "Tricep Pushdown",
              primaryMuscle: "Triceps",
              targetSets: 3,
              targetReps: 12,
            },
          ],
        },
      },
      resStart
    );
    assert.strictEqual(resStart.statusCode, 201);
    const session = resStart.body.data.session;
    assert.strictEqual(session.status, "in_progress");
    assert.strictEqual(session.exercises.length, 2);
    console.log(`✓ Started live session "${session.workoutName}" (ID: ${session._id})`);

    // 2. Duplicate start session prevention test
    const resStartDup = mockRes();
    await workoutController.startWorkoutSession(
      {
        user: userA,
        body: { workoutName: "Attempted Duplicate Session" },
      },
      resStartDup
    );
    assert.strictEqual(resStartDup.statusCode, 200);
    assert.strictEqual(resStartDup.body.data.resumed, true);
    assert.strictEqual(resStartDup.body.data.session._id.toString(), session._id.toString());
    console.log("✓ Duplicate session creation prevented (resumed active session)");

    // 3. Live autosave sets and reps
    const updatedExercises = [
      {
        name: "Barbell Bench Press",
        primaryMuscle: "Chest",
        sets: [
          { setNumber: 1, weight: 80, reps: 10, completed: true },
          { setNumber: 2, weight: 90, reps: 8, completed: true },
          { setNumber: 3, weight: 100, reps: 6, completed: true },
        ],
      },
      {
        name: "Tricep Pushdown",
        primaryMuscle: "Triceps",
        sets: [
          { setNumber: 1, weight: 35, reps: 12, completed: true },
          { setNumber: 2, weight: 40, reps: 10, completed: true },
          { setNumber: 3, weight: 40, reps: 9, completed: false }, // Incomplete set should not count in volume
        ],
      },
    ];

    const resLiveSave = mockRes();
    await workoutController.updateLiveSession(
      {
        user: userA,
        params: { id: session._id },
        body: {
          exercises: updatedExercises,
          durationSeconds: 2700, // 45 minutes
          notes: "Felt strong on bench press today!",
        },
      },
      resLiveSave
    );
    assert.strictEqual(resLiveSave.statusCode, 200);
    assert.strictEqual(resLiveSave.body.data.session.durationMinutes, 45);
    console.log("✓ Live autosave succeeded (45 min duration persisted)");

    // 4. Finish session and verify mathematical volume & PR detection
    const resFinish = mockRes();
    await workoutController.finishWorkoutSession(
      {
        user: userA,
        params: { id: session._id },
        body: {
          exercises: updatedExercises,
          durationSeconds: 2700,
          notes: "Felt strong on bench press today!",
        },
      },
      resFinish
    );
    assert.strictEqual(resFinish.statusCode, 200);
    const finishedSummary = resFinish.body.data.summary;

    // Expected Volume:
    // Bench: (80*10) + (90*8) + (100*6) = 800 + 720 + 600 = 2120 kg
    // Triceps: (35*12) + (40*10) = 420 + 400 = 820 kg
    // Total Volume = 2120 + 820 = 2940 kg
    assert.strictEqual(finishedSummary.totalVolumeKg, 2940, `Volume expected 2940 kg, got ${finishedSummary.totalVolumeKg}`);
    // Expected Reps: (10 + 8 + 6) + (12 + 10) = 46 reps
    assert.strictEqual(finishedSummary.totalReps, 46, `Reps expected 46, got ${finishedSummary.totalReps}`);
    assert(finishedSummary.caloriesBurned > 0, "Calories must be positive");
    assert(finishedSummary.newPersonalRecords.length > 0, "Should detect new PRs on first logging");
    console.log(`✓ Volume (${finishedSummary.totalVolumeKg}kg) and Reps (${finishedSummary.totalReps}) mathematically verified`);
    console.log(`✓ PR Detection triggered: ${finishedSummary.newPersonalRecords.map(p => p.exerciseName).join(", ")}`);

    // Verify PersonalRecord doc in database
    const benchPr = await PersonalRecord.findOne({ userId: userA._id, exerciseName: "Barbell Bench Press" });
    assert(benchPr, "PersonalRecord doc must exist for Barbell Bench Press");
    assert.strictEqual(benchPr.bestWeight, 100);
    assert.strictEqual(benchPr.bestReps, 10);
    console.log("✓ PersonalRecord database record confirmed");

    // -------------------------------------------------------------
    // PHASE 9, 10, 11: ANALYTICS & MUSCLE MAP
    // -------------------------------------------------------------
    console.log("\n--- Testing Workout Analytics & Muscle Map ---");

    const resAnalytics = mockRes();
    await workoutController.getWorkoutAnalytics({ user: userA }, resAnalytics);
    assert.strictEqual(resAnalytics.statusCode, 200);
    assert(resAnalytics.body.data.summary.totalWorkouts >= 1, "Must reflect completed workout");
    assert(resAnalytics.body.data.summary.totalVolumeKg >= 2940, "Must reflect total volume");
    console.log(`✓ Analytics returned: Total Workouts=${resAnalytics.body.data.summary.totalWorkouts}, Volume=${resAnalytics.body.data.summary.totalVolumeKg}kg`);

    const resMuscleMap = mockRes();
    await workoutController.getMuscleMapData({ user: userA }, resMuscleMap);
    assert.strictEqual(resMuscleMap.statusCode, 200);
    const chestData = resMuscleMap.body.data.muscleMap.find(m => m.muscle === "Chest");
    assert(chestData && chestData.past7DaysVolume >= 2120, "Chest muscle map volume must reflect bench press");
    console.log(`✓ Muscle map data verified for Chest: ${chestData.past7DaysVolume}kg in past 7 days`);

    // -------------------------------------------------------------
    // PHASE 14 & 15: SECURITY & MULTI-TENANT ISOLATION (IDOR)
    // -------------------------------------------------------------
    console.log("\n--- Testing Security & IDOR Access Controls ---");

    // 1. User B attempts to access User A's workout session
    const resIdorGet = mockRes();
    await workoutController.getWorkoutSessionById(
      { user: userB, params: { id: session._id } },
      resIdorGet
    );
    assert.strictEqual(resIdorGet.statusCode, 404, "User B must NOT be able to view User A's session");
    console.log("✓ IDOR Prevention: User B cannot access User A's private session");

    // 2. User B attempts to update User A's workout plan
    const resIdorPlan = mockRes();
    await workoutController.updateWorkoutPlan(
      { user: userB, params: { id: appliedPlan._id }, body: { name: "Hacked Plan Name" } },
      resIdorPlan
    );
    assert.strictEqual(resIdorPlan.statusCode, 404, "User B must NOT be able to update User A's plan");
    console.log("✓ IDOR Prevention: User B cannot update User A's plan");

    // 3. User B attempts to delete User A's workout plan
    const resIdorDelete = mockRes();
    await workoutController.deleteWorkoutPlan(
      { user: userB, params: { id: appliedPlan._id } },
      resIdorDelete
    );
    assert.strictEqual(resIdorDelete.statusCode, 404, "User B must NOT be able to delete User A's plan");
    console.log("✓ IDOR Prevention: User B cannot delete User A's plan");

    console.log("\n=================================================");
    console.log("ALL EXHAUSTIVE WORKOUT QA TESTS PASSED! 🎉");
    console.log("=================================================");
  } finally {
    // Clean up test users & generated session records
    await WorkoutSession.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await WorkoutPlan.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await PersonalRecord.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    console.log("✓ Cleaned up isolated QA test records");
    await mongoose.disconnect();
  }
}

runExhaustiveQA().catch((err) => {
  console.error("QA Test Suite Error:", err);
  process.exit(1);
});
