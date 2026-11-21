const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const User = require("../Modals/User");
const Exercise = require("../Modals/Exercise");
const WorkoutSession = require("../Modals/WorkoutSession");
const workoutController = require("../Controllers/workoutController");

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

async function runTest() {
  console.log("=== RUNNING LIVE WORKOUT MEDIA & MOBILE QA TEST ===");
  await connectToDb();
  console.log("✓ Connected to MongoDB");

  // 1. Create test user
  const email = `media_tester_${Date.now()}@fittogether.test`;
  const user = await User.create({
    name: "Media Tester",
    email,
    password: "Password123!",
  });
  console.log("✓ Created test user:", user.email);

  try {
    // 2. Find an exercise with video and an exercise with gif
    const videoEx = await Exercise.findOne({ mediaType: "video" }).lean();
    const gifEx = await Exercise.findOne({ mediaType: "gif" }).lean();

    console.log(
      `✓ Found sample video exercise: "${videoEx?.name}" (${videoEx?.videoUrl ? "has video" : "no video"})`
    );
    console.log(
      `✓ Found sample gif exercise: "${gifEx?.name}" (${gifEx?.gifUrl ? "has gif" : "no gif"})`
    );

    // 3. Start a workout session with these exercises
    const startReq = {
      user,
      body: {
        workoutName: "Media Test Workout",
        targetMuscles: ["Chest", "Back"],
        exercises: [
          {
            exerciseId: videoEx?._id,
            name: videoEx?.name || "Bench Press",
            primaryMuscle: videoEx?.primaryMuscle || "Chest",
            targetSets: 3,
            targetReps: 10,
          },
          {
            name: gifEx?.name || "Pull Up",
            primaryMuscle: gifEx?.primaryMuscle || "Back",
            targetSets: 3,
            targetReps: 8,
          },
        ],
      },
    };

    const startRes = mockRes();
    await workoutController.startWorkoutSession(startReq, startRes);

    const session = startRes.body?.data?.session;
    if (!session) {
      throw new Error("Failed to start session: " + JSON.stringify(startRes.body));
    }

    console.log("✓ Started workout session with ID:", session._id);

    // Verify media was hydrated onto session exercises
    const ex1 = session.exercises[0];
    const ex2 = session.exercises[1];

    console.log(
      `  Exercise 1: "${ex1.name}" - videoUrl: ${ex1.videoUrl ? "PRESENCE VERIFIED (" + ex1.videoUrl.slice(0, 40) + "...)" : "MISSING!"}`
    );
    console.log(
      `  Exercise 2: "${ex2.name}" - gifUrl: ${ex2.gifUrl ? "PRESENCE VERIFIED (" + ex2.gifUrl.slice(0, 40) + "...)" : "MISSING!"}`
    );

    if (videoEx?.videoUrl && !ex1.videoUrl) {
      throw new Error("Exercise 1 did not receive videoUrl from Exercise document!");
    }
    if (gifEx?.gifUrl && !ex2.gifUrl) {
      throw new Error("Exercise 2 did not receive gifUrl from Exercise document!");
    }

    // 4. Test live autosave preserves media
    const liveSaveReq = {
      user,
      params: { id: session._id.toString() },
      body: {
        durationSeconds: 120,
        notes: "Feeling strong",
        exercises: [
          {
            exerciseId: ex1.exerciseId,
            name: ex1.name,
            sets: [
              { setNumber: 1, weight: 60, reps: 10, completed: true },
              { setNumber: 2, weight: 60, reps: 10, completed: false },
            ],
          },
        ],
      },
    };

    const liveSaveRes = mockRes();
    await workoutController.updateLiveSession(liveSaveReq, liveSaveRes);
    const savedSession = liveSaveRes.body?.data?.session;

    if (!savedSession.exercises[0].videoUrl) {
      throw new Error("Live autosave wiped videoUrl!");
    }
    console.log("✓ Verified live autosave preserved videoUrl!");

    // 5. Test getActiveSession hydrates any missing media
    const getActiveReq = { user };
    const getActiveRes = mockRes();
    await workoutController.getActiveSession(getActiveReq, getActiveRes);
    const active = getActiveRes.body?.data?.session;

    if (!active || !active.exercises[0].videoUrl) {
      throw new Error("getActiveSession failed to return session with videoUrl!");
    }
    console.log("✓ Verified getActiveSession returned hydrated session with videoUrl!");

    console.log("\n=================================================");
    console.log("ALL LIVE WORKOUT MEDIA TESTS PASSED! 🎉");
    console.log("=================================================");
  } finally {
    // Cleanup
    await WorkoutSession.deleteMany({ userId: user._id });
    await User.findByIdAndDelete(user._id);
    await mongoose.disconnect();
    console.log("✓ Cleaned up test data and disconnected");
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
