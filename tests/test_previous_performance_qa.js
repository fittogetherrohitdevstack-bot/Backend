const mongoose = require("mongoose");
const connectToDb = require("../Config/db");

const User = require("../Modals/User");
const WorkoutSession = require("../Modals/WorkoutSession");
const Exercise = require("../Modals/Exercise");
const PersonalRecord = require("../Modals/PersonalRecord");
const WorkoutPlan = require("../Modals/WorkoutPlan");

const workoutController = require("../Controllers/workoutController");

const runTests = async () => {
  console.log("=== RUNNING PREVIOUS PERFORMANCE & SMART PLAN QA TESTS ===");

  await connectToDb();
  console.log("✓ Connected to MongoDB");

  // Create isolated test user
  const testEmail = `perf_athlete_${Date.now()}@fittogether.test`;
  const athlete = await User.create({
    name: "Progress Athlete",
    email: testEmail,
    password: "Password123!",
    timezone: "UTC",
  });
  console.log("✓ Created test athlete:", athlete.email);

  try {
    // 1. First-time exercise check (no history yet)
    let mockReq = {
      user: athlete,
      params: { identifier: "Barbell Bench Press" },
    };
    let mockRes = {
      statusCode: 200,
      jsonData: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(d) {
        this.jsonData = d;
        return this;
      },
    };

    await workoutController.getExercisePreviousPerformance(mockReq, mockRes);
    if (!mockRes.jsonData || mockRes.jsonData.data?.hasPreviousPerformance !== false) {
      throw new Error("First-time performance should have hasPreviousPerformance: false");
    }
    console.log("✓ Verified first-time exercise empty state messaging");

    // 2. Create a completed historical workout session for athlete
    const pastDate = "2026-11-18";
    const benchPressEx = await Exercise.findOne({ name: /Bench Press/i }).lean();

    const historicalSession = await WorkoutSession.create({
      userId: athlete._id,
      date: pastDate,
      workoutName: "Push Day Alpha",
      status: "completed",
      durationMinutes: 45,
      totalVolumeKg: 1390,
      totalReps: 30,
      targetMuscles: ["Chest", "Triceps"],
      exercises: [
        {
          exerciseId: benchPressEx?._id || null,
          name: "Barbell Bench Press",
          primaryMuscle: "Chest",
          sets: [
            { setNumber: 1, weight: 40, reps: 12, completed: true },
            { setNumber: 2, weight: 50, reps: 10, completed: true },
            { setNumber: 3, weight: 55, reps: 8, completed: true },
          ],
        },
      ],
    });
    console.log("✓ Created completed historical session from", pastDate);

    // 3. Now query previous performance again
    mockRes.jsonData = null;
    await workoutController.getExercisePreviousPerformance(mockReq, mockRes);
    const prevData = mockRes.jsonData?.data;

    if (!prevData?.hasPreviousPerformance) {
      throw new Error("Expected hasPreviousPerformance to be true after completed session");
    }
    if (prevData.previousSession.sets.length !== 3) {
      throw new Error(`Expected 3 completed sets, got ${prevData.previousSession.sets.length}`);
    }
    if (prevData.previousSession.sets[0].weight !== 40 || prevData.previousSession.sets[0].reps !== 12) {
      throw new Error("Set 1 did not match historical 40kg x 12");
    }
    if (prevData.previousSession.sets[2].weight !== 55 || prevData.previousSession.sets[2].reps !== 8) {
      throw new Error("Set 3 did not match historical 55kg x 8");
    }
    if (prevData.previousSession.bestWeight !== 55) {
      throw new Error("bestWeight calculation mismatch");
    }
    console.log("✓ Verified exact previous performance retrieval (40x12, 50x10, 55x8, best: 55kg)");
    console.log("  Suggestion generated:", prevData.suggestion);

    // 4. Test Exercise History endpoint
    mockRes.jsonData = null;
    await workoutController.getExerciseHistory(mockReq, mockRes);
    const histData = mockRes.jsonData?.data;
    if (!histData?.history || histData.history.length === 0) {
      throw new Error("Expected at least 1 history session in exercise history");
    }
    if (histData.history[0].maxWeight !== 55 || histData.history[0].totalVolumeKg !== (40 * 12 + 50 * 10 + 55 * 8)) {
      throw new Error("History metrics calculation mismatch");
    }
    console.log("✓ Verified chronological exercise history retrieval");

    // 5. Test startWorkoutSession set-by-set hydration
    const startReq = {
      user: athlete,
      body: {
        workoutName: "Today Push Session",
        targetMuscles: ["Chest"],
        exercises: [
          {
            name: "Barbell Bench Press",
            primaryMuscle: "Chest",
            targetSets: 3,
            targetReps: 10,
          },
        ],
      },
    };
    const startRes = {
      statusCode: 200,
      jsonData: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(d) {
        this.jsonData = d;
        return this;
      },
    };
    await workoutController.startWorkoutSession(startReq, startRes);
    const newSession = startRes.jsonData?.data?.session;

    if (!newSession) throw new Error("Failed to start new workout session");
    const benchEx = newSession.exercises[0];
    if (benchEx.sets[0].previousWeight !== 40 || benchEx.sets[0].previousReps !== 12) {
      throw new Error(`Set 1 previousWeight expected 40, got ${benchEx.sets[0].previousWeight}`);
    }
    if (benchEx.sets[1].previousWeight !== 50 || benchEx.sets[1].previousReps !== 10) {
      throw new Error(`Set 2 previousWeight expected 50, got ${benchEx.sets[1].previousWeight}`);
    }
    if (benchEx.sets[2].previousWeight !== 55 || benchEx.sets[2].previousReps !== 8) {
      throw new Error(`Set 3 previousWeight expected 55, got ${benchEx.sets[2].previousReps}`);
    }
    if (!benchEx.previousPerformance || benchEx.previousPerformance.bestWeight !== 55) {
      throw new Error("Exercise previousPerformance object not hydrated properly");
    }
    console.log("✓ Verified startWorkoutSession hydrated exact previous weights & reps for all 3 sets!");

    // 6. Test GET completed workout sessions list
    const completedReq = { user: athlete };
    const completedRes = {
      statusCode: 200,
      jsonData: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(d) {
        this.jsonData = d;
        return this;
      },
    };
    await workoutController.getCompletedWorkoutSessions(completedReq, completedRes);
    const completedList = completedRes.jsonData?.data?.sessions;
    if (!completedList || completedList.length < 1) {
      throw new Error("getCompletedWorkoutSessions returned empty list");
    }
    if (completedList[0].workoutName !== "Push Day Alpha") {
      throw new Error("getCompletedWorkoutSessions did not return correct historical session");
    }
    console.log("✓ Verified getCompletedWorkoutSessions returned completed workouts for smart plan creation");

    console.log("\n=================================================");
    console.log("ALL PREVIOUS PERFORMANCE TESTS PASSED! 🎉");
    console.log("=================================================");
  } finally {
    // Cleanup athlete and created records
    await WorkoutSession.deleteMany({ userId: athlete._id });
    await PersonalRecord.deleteMany({ userId: athlete._id });
    await WorkoutPlan.deleteMany({ userId: athlete._id });
    await User.findByIdAndDelete(athlete._id);
    await mongoose.disconnect();
    console.log("✓ Cleaned up test athlete records and disconnected");
  }
};

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
