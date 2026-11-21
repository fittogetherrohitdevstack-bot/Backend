const mongoose = require("mongoose");
const connectToDb = require("../Config/db");

const User = require("../Modals/User");
const WorkoutSession = require("../Modals/WorkoutSession");
const Exercise = require("../Modals/Exercise");
const PersonalRecord = require("../Modals/PersonalRecord");

const workoutController = require("../Controllers/workoutController");

const runTests = async () => {
  console.log("=== RUNNING WORKOUT HISTORY CRUD & INTEGRITY QA TESTS ===");

  await connectToDb();
  console.log("✓ Connected to MongoDB");

  const testEmail = `history_athlete_${Date.now()}@fittogether.test`;
  const athlete = await User.create({
    name: "History Athlete",
    email: testEmail,
    password: "Password123!",
    timezone: "UTC",
  });
  console.log("✓ Created test athlete:", athlete.email);

  const testEmailB = `intruder_${Date.now()}@fittogether.test`;
  const athleteB = await User.create({
    name: "Intruder Athlete",
    email: testEmailB,
    password: "Password123!",
    timezone: "UTC",
  });

  try {
    // 1. Create a completed session
    const benchPressEx = await Exercise.findOne({ name: /Bench Press/i }).lean();

    const session = await WorkoutSession.create({
      userId: athlete._id,
      date: "2026-11-20",
      workoutName: "Heavy Chest Session",
      status: "completed",
      durationMinutes: 40,
      durationSeconds: 2400,
      totalVolumeKg: 1000,
      totalReps: 20,
      caloriesBurned: 261,
      targetMuscles: ["Chest"],
      exercises: [
        {
          exerciseId: benchPressEx?._id || null,
          name: "Barbell Bench Press",
          primaryMuscle: "Chest",
          sets: [
            { setNumber: 1, weight: 50, reps: 10, completed: true },
            { setNumber: 2, weight: 50, reps: 10, completed: true },
          ],
        },
      ],
    });
    console.log("✓ Created initial completed workout session (1000 kg vol, 20 reps)");

    // Also register a PR for this session
    const pr = await PersonalRecord.create({
      userId: athlete._id,
      exerciseName: "Barbell Bench Press",
      bestWeight: 50,
      bestReps: 10,
      bestVolume: 500,
      estimatedOneRepMax: 66.7,
      achievedAt: new Date("2026-11-20"),
      sessionId: session._id,
      history: [
        {
          weight: 45,
          reps: 10,
          estimated1RM: 60,
          volume: 450,
          achievedAt: new Date("2026-11-10"),
          sessionId: new mongoose.Types.ObjectId(),
        },
        {
          weight: 50,
          reps: 10,
          estimated1RM: 66.7,
          volume: 500,
          achievedAt: new Date("2026-11-20"),
          sessionId: session._id,
        },
      ],
    });
    console.log("✓ Registered PR linked to session (best: 50kg, previous in history: 45kg)");

    // 2. Test IDOR protection: User B tries to update User A's session
    const mockRes = () => {
      const res = {};
      res.statusCode = 200;
      res.status = (c) => {
        res.statusCode = c;
        return res;
      };
      res.json = (d) => {
        res.body = d;
        return res;
      };
      return res;
    };

    let res = mockRes();
    await workoutController.updateCompletedWorkoutSession(
      {
        user: athleteB,
        params: { id: session._id.toString() },
        body: { workoutName: "Hacked Workout Name" },
      },
      res
    );
    if (res.statusCode !== 404) {
      throw new Error(`Expected 404 on IDOR update attempt, got ${res.statusCode}`);
    }
    console.log("✓ Verified IDOR prevention on updateCompletedWorkoutSession");

    // 3. Test Valid Update of Completed Workout
    // User A increases Set 2 weight from 50kg to 60kg and adds a 3rd set of 60kg x 8 reps
    res = mockRes();
    await workoutController.updateCompletedWorkoutSession(
      {
        user: athlete,
        params: { id: session._id.toString() },
        body: {
          workoutName: "Updated Chest Day Hypertrophy",
          durationMinutes: 50,
          notes: "Felt incredible on set 3",
          exercises: [
            {
              exerciseId: benchPressEx?._id || null,
              name: "Barbell Bench Press",
              primaryMuscle: "Chest",
              sets: [
                { setNumber: 1, weight: 50, reps: 10, completed: true },
                { setNumber: 2, weight: 60, reps: 10, completed: true },
                { setNumber: 3, weight: 60, reps: 8, completed: true },
              ],
            },
          ],
        },
      },
      res
    );

    if (res.statusCode !== 200) {
      throw new Error(`Update session failed with status ${res.statusCode}`);
    }

    const updatedSession = res.body?.data?.session;
    // Expected volume: 50*10 + 60*10 + 60*8 = 500 + 600 + 480 = 1580 kg
    // Expected reps: 10 + 10 + 8 = 28
    if (updatedSession.totalVolumeKg !== 1580) {
      throw new Error(`Expected totalVolumeKg 1580, got ${updatedSession.totalVolumeKg}`);
    }
    if (updatedSession.totalReps !== 28) {
      throw new Error(`Expected totalReps 28, got ${updatedSession.totalReps}`);
    }
    if (updatedSession.workoutName !== "Updated Chest Day Hypertrophy") {
      throw new Error("Workout name was not updated");
    }
    console.log("✓ Verified workout session update (Volume recalculated to 1580 kg, 28 reps)");

    // 4. Test History Search and Filter Endpoint
    res = mockRes();
    await workoutController.getWorkoutHistory(
      {
        user: athlete,
        query: { search: "Chest", timeRange: "all" },
      },
      res
    );
    const histSessions = res.body?.data?.sessions;
    if (!histSessions || histSessions.length !== 1) {
      throw new Error("Search filter did not return the expected session");
    }
    if (histSessions[0].workoutName !== "Updated Chest Day Hypertrophy") {
      throw new Error("Returned session name does not match updated session");
    }
    console.log("✓ Verified getWorkoutHistory search and timeRange query");

    // 5. Test Delete Completed Workout
    // IDOR check first
    res = mockRes();
    await workoutController.deleteCompletedWorkoutSession(
      {
        user: athleteB,
        params: { id: session._id.toString() },
      },
      res
    );
    if (res.statusCode !== 404) {
      throw new Error(`Expected 404 on IDOR delete attempt, got ${res.statusCode}`);
    }
    console.log("✓ Verified IDOR prevention on deleteCompletedWorkoutSession");

    // Valid delete
    res = mockRes();
    await workoutController.deleteCompletedWorkoutSession(
      {
        user: athlete,
        params: { id: session._id.toString() },
      },
      res
    );
    if (res.statusCode !== 200) {
      throw new Error(`Delete session failed with status ${res.statusCode}`);
    }

    // Verify session is deleted
    const deletedCheck = await WorkoutSession.findById(session._id);
    if (deletedCheck) {
      throw new Error("Workout session was not deleted from database");
    }
    console.log("✓ Verified workout session successfully deleted from database");

    // Verify PR reverted to previous historical record (45kg instead of 50kg)
    const prCheck = await PersonalRecord.findById(pr._id);
    if (!prCheck) {
      throw new Error("PR record was unexpectedly deleted instead of reverted");
    }
    if (prCheck.bestWeight !== 45 || prCheck.history.length !== 1) {
      throw new Error(
        `PR should have reverted to previous record 45kg, got bestWeight: ${prCheck.bestWeight}, history length: ${prCheck.history.length}`
      );
    }
    console.log("✓ Verified PersonalRecord reverted cleanly to previous best (45kg)");

    console.log("\n=================================================");
    console.log("ALL WORKOUT HISTORY CRUD TESTS PASSED! 🎉");
    console.log("=================================================");
  } finally {
    await WorkoutSession.deleteMany({ userId: { $in: [athlete._id, athleteB._id] } });
    await PersonalRecord.deleteMany({ userId: { $in: [athlete._id, athleteB._id] } });
    await User.deleteMany({ _id: { $in: [athlete._id, athleteB._id] } });
    await mongoose.disconnect();
    console.log("✓ Cleaned up test athletes and disconnected");
  }
};

runTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
