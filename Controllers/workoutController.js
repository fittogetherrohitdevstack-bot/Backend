const mongoose = require("mongoose");
const WorkoutPlan = require("../Modals/WorkoutPlan");
const WorkoutSession = require("../Modals/WorkoutSession");
const PersonalRecord = require("../Modals/PersonalRecord");
const Exercise = require("../Modals/Exercise");
const FeedEvent = require("../Modals/FeedEvent");
const Membership = require("../Modals/Membership");
const Notification = require("../Modals/Notification");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  getLocalDateString,
  getDayOfWeek,
  getISOWeekDetails,
  getWeekDates,
  addDaysToDateString,
} = require("../Utils/date");
const { POINTS_RULES, syncDailyHabitPoints } = require("../Utils/gamification");
const { recalculateUserStreak } = require("../Utils/streakService");
const { dispatchSocialActivityNotification } = require("../services/notificationService");
const EXERCISE_SEED_DATA = require("../seed/exerciseSeedData");
const WORKOUT_TEMPLATES = require("../seed/workoutTemplatesData");

/**
 * Auto-seeds exercise library and default templates if DB is empty.
 */
const ensureExercisesSeeded = async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const count = await Exercise.countDocuments();
    if (count === 0) {
      console.log("[WorkoutSeed] Seeding 50+ built-in exercises...");
      await Exercise.insertMany(EXERCISE_SEED_DATA);
      console.log("[WorkoutSeed] Exercise library seeded successfully.");
    }
  } catch (err) {
    console.error("[WorkoutSeed] Error seeding exercises:", err.message);
  }
};

// Seed on MongoDB connection established
if (mongoose.connection.readyState === 1) {
  ensureExercisesSeeded().catch(() => {});
} else {
  mongoose.connection.once("open", () => {
    ensureExercisesSeeded().catch(() => {});
  });
}

/**
 * Calculates estimated 1-Rep Max using the Epley formula: w * (1 + r / 30)
 */
const calculateEstimated1RM = (weight, reps) => {
  if (!weight || weight <= 0) return 0;
  if (!reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
};

/**
 * Estimates calories burned for resistance training based on weight, duration, and volume.
 */
const calculateEstimatedCalories = (durationMinutes = 0, totalVolumeKg = 0) => {
  if (durationMinutes <= 0) return 0;
  // Baseline MET for weightlifting: ~5.5 to 6.5 kcal/min for average 70kg individual
  const baseBurn = durationMinutes * 6.5;
  // Volume density bonus: +1 kcal per 1000kg lifted
  const volumeBonus = Math.round(totalVolumeKg / 1000);
  return Math.round(baseBurn + volumeBonus);
};

/**
 * Sync habit points and trigger notifications when session is completed or rested.
 */
const syncWorkoutPointsAndNotify = async (user, sessionDate, session) => {
  const isCompletedOrRest =
    session.status === "completed" || session.status === "rest";
  const pts = !isCompletedOrRest
    ? 0
    : session.status === "completed"
    ? POINTS_RULES.WORKOUT_COMPLETED
    : POINTS_RULES.REST_DAY_HONORED;

  const isTodayDate =
    sessionDate === getLocalDateString(new Date(), user.timezone || "Asia/Kolkata");
  const eventName = isTodayDate
    ? isCompletedOrRest
      ? "workout-completed"
      : "squad-sync"
    : null;

  await syncDailyHabitPoints({
    userId: user._id,
    date: sessionDate,
    type: "workout",
    points: pts,
    meta: {
      status: session.status,
      workoutName: session.workoutName,
      durationMinutes: session.durationMinutes,
      totalVolumeKg: session.totalVolumeKg,
    },
    eventName,
    eventPayload: isTodayDate
      ? {
          userId: user._id,
          userName: user.name,
          workoutName: session.workoutName,
          status: session.status,
          durationMinutes: session.durationMinutes,
          totalVolumeKg: session.totalVolumeKg,
        }
      : null,
  });

  await recalculateUserStreak(user._id).catch(() => {});

  if (session.status === "completed") {
    dispatchSocialActivityNotification({
      actorId: user._id,
      actorName: user.name,
      actorImage: user.profileImage || "",
      type: "workout_completed",
      category: "workout",
      title: `💪 ${user.name} completed ${session.workoutName || "their workout"}`,
      body: `Crushed ${session.durationMinutes || 0} mins${
        session.totalVolumeKg ? ` • ${session.totalVolumeKg} kg volume` : ""
      }! Keep the squad streak burning.`,
      url: "/workouts",
      activityId: session._id ? session._id.toString() : "",
      data: {
        workoutName: session.workoutName,
        status: session.status,
        durationMinutes: session.durationMinutes,
        totalVolumeKg: session.totalVolumeKg,
      },
    }).catch(() => {});
  }
};

// ==========================================
// 1. EXERCISE LIBRARY CONTROLLERS
// ==========================================

// @desc Get all exercises with filtering, searching, favorites
// @route GET /api/workouts/exercises
const getExercises = asyncHandler(async (req, res) => {
  await ensureExercisesSeeded();

  const { search, muscle, equipment, difficulty, category, favoritesOnly } = req.query;
  const filter = {};

  if (search && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { name: { $regex: s, $options: "i" } },
      { primaryMuscle: { $regex: s, $options: "i" } },
      { secondaryMuscles: { $regex: s, $options: "i" } },
      { equipment: { $regex: s, $options: "i" } },
    ];
  }

  if (muscle && muscle !== "All") {
    filter.primaryMuscle = muscle;
  }

  if (equipment && equipment !== "All") {
    filter.equipment = equipment;
  }

  if (difficulty && difficulty !== "All") {
    filter.difficulty = difficulty;
  }

  if (category && category !== "All") {
    filter.category = category;
  }

  if (favoritesOnly === "true") {
    filter.favoriteBy = req.user._id;
  }

  const exercises = await Exercise.find(filter)
    .sort({ name: 1 })
    .lean();

  const formatted = exercises.map((ex) => ({
    ...ex,
    isFavorite: Array.isArray(ex.favoriteBy)
      ? ex.favoriteBy.some((id) => id.toString() === req.user._id.toString())
      : false,
  }));

  return sendSuccess(res, { exercises: formatted, total: formatted.length });
});

// @desc Get single exercise by ID or slug
// @route GET /api/workouts/exercises/:idOrSlug
const getExerciseById = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

  const query = isObjectId
    ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }
    : { slug: idOrSlug };

  const exercise = await Exercise.findOne(query).lean();
  if (!exercise) {
    return sendError(res, "Exercise not found", 404);
  }

  const isFavorite = Array.isArray(exercise.favoriteBy)
    ? exercise.favoriteBy.some((id) => id.toString() === req.user._id.toString())
    : false;

  return sendSuccess(res, { exercise: { ...exercise, isFavorite } });
});

// @desc Toggle exercise favorite
// @route POST /api/workouts/exercises/:id/favorite
const toggleFavoriteExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findById(req.params.id);
  if (!exercise) {
    return sendError(res, "Exercise not found", 404);
  }

  const isFav = exercise.favoriteBy.some(
    (id) => id.toString() === req.user._id.toString()
  );

  if (isFav) {
    exercise.favoriteBy = exercise.favoriteBy.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
  } else {
    exercise.favoriteBy.push(req.user._id);
  }

  await exercise.save();
  return sendSuccess(
    res,
    { isFavorite: !isFav },
    !isFav ? "Exercise added to favorites" : "Exercise removed from favorites"
  );
});

// @desc Create custom exercise
// @route POST /api/workouts/exercises/custom
const createCustomExercise = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    primaryMuscle,
    secondaryMuscles,
    equipment,
    difficulty,
    category,
    instructions,
  } = req.body;

  if (!name || !primaryMuscle) {
    return sendError(res, "Exercise name and primary muscle are required", 400);
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const customExercise = await Exercise.create({
    name,
    slug: `${slug}-${Date.now()}`,
    description: description || `Custom exercise: ${name}`,
    primaryMuscle,
    secondaryMuscles: secondaryMuscles || [],
    equipment: equipment || "Other",
    difficulty: difficulty || "Intermediate",
    category: category || "Hypertrophy",
    instructions: instructions || ["Perform with controlled form."],
    isCustom: true,
    userId: req.user._id,
    favoriteBy: [req.user._id],
  });

  return sendSuccess(res, { exercise: customExercise }, "Custom exercise created", 201);
});

// ==========================================
// 2. WORKOUT PLAN MANAGEMENT
// ==========================================

// @desc Get built-in split templates
// @route GET /api/workouts/templates
const getTemplates = asyncHandler(async (req, res) => {
  return sendSuccess(res, { templates: WORKOUT_TEMPLATES });
});

// @desc Apply built-in split template to user's plans
// @route POST /api/workouts/templates/apply
const applyTemplate = asyncHandler(async (req, res) => {
  const { templateKey, makeActive = true } = req.body;

  const template = WORKOUT_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!template) {
    return sendError(res, "Workout template not found", 404);
  }

  if (makeActive) {
    await WorkoutPlan.updateMany(
      { userId: req.user._id, isActive: true },
      { $set: { isActive: false } }
    );
  }

  const newPlan = await WorkoutPlan.create({
    userId: req.user._id,
    name: template.name,
    description: template.description,
    fitnessLevel: template.fitnessLevel,
    goal: template.goal,
    daysPerWeek: template.daysPerWeek,
    isTemplate: false,
    templateKey: template.templateKey,
    schedule: template.schedule,
    isActive: !!makeActive,
  });

  return sendSuccess(res, { plan: newPlan }, `Applied ${template.name} as your plan!`, 201);
});

// @desc Get user's workout plans
// @route GET /api/workouts/my-plans
const getMyWorkoutPlans = asyncHandler(async (req, res) => {
  const plans = await WorkoutPlan.find({ userId: req.user._id })
    .sort({ isActive: -1, createdAt: -1 })
    .lean();
  return sendSuccess(res, { plans });
});

// @desc Create custom workout plan
// @route POST /api/workouts
const createWorkoutPlan = asyncHandler(async (req, res) => {
  const { name, description, fitnessLevel, goal, daysPerWeek, schedule, groupId, isActive } =
    req.body;

  if (isActive !== false) {
    await WorkoutPlan.updateMany(
      { userId: req.user._id, isActive: true },
      { $set: { isActive: false } }
    );
  }

  const workoutPlan = await WorkoutPlan.create({
    userId: req.user._id,
    groupId: groupId || null,
    name: name || "Custom Workout Plan",
    description: description || "",
    fitnessLevel: fitnessLevel || "Intermediate",
    goal: goal || "Hypertrophy",
    daysPerWeek: daysPerWeek || (schedule ? schedule.filter((s) => !s.isRestDay).length : 4),
    schedule: schedule || [],
    isActive: isActive !== false,
  });

  return sendSuccess(res, { workoutPlan }, "Workout plan created successfully", 201);
});

// @desc Update workout plan
// @route PUT /api/workouts/:id
const updateWorkoutPlan = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Workout plan not found or unauthorized", 404);
  }

  const { name, description, fitnessLevel, goal, daysPerWeek, schedule, isActive, groupId } =
    req.body;

  if (name !== undefined) plan.name = name;
  if (description !== undefined) plan.description = description;
  if (fitnessLevel !== undefined) plan.fitnessLevel = fitnessLevel;
  if (goal !== undefined) plan.goal = goal;
  if (daysPerWeek !== undefined) plan.daysPerWeek = daysPerWeek;
  if (schedule !== undefined) plan.schedule = schedule;
  if (groupId !== undefined) plan.groupId = groupId;

  if (isActive === true) {
    await WorkoutPlan.updateMany(
      { userId: req.user._id, _id: { $ne: plan._id } },
      { $set: { isActive: false } }
    );
    plan.isActive = true;
  } else if (isActive === false) {
    plan.isActive = false;
  }

  await plan.save();
  return sendSuccess(res, { plan }, "Workout plan updated");
});

// @desc Duplicate workout plan
// @route POST /api/workouts/:id/duplicate
const duplicateWorkoutPlan = asyncHandler(async (req, res) => {
  const sourcePlan = await WorkoutPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();

  if (!sourcePlan) {
    return sendError(res, "Workout plan not found", 404);
  }

  const duplicated = await WorkoutPlan.create({
    userId: req.user._id,
    name: `${sourcePlan.name} (Copy)`,
    description: sourcePlan.description,
    fitnessLevel: sourcePlan.fitnessLevel,
    goal: sourcePlan.goal,
    daysPerWeek: sourcePlan.daysPerWeek,
    schedule: sourcePlan.schedule,
    isActive: false,
  });

  return sendSuccess(res, { plan: duplicated }, "Workout plan duplicated successfully", 201);
});

// @desc Activate a workout plan
// @route POST /api/workouts/:id/activate
const activateWorkoutPlan = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Workout plan not found or unauthorized", 404);
  }

  await WorkoutPlan.updateMany(
    { userId: req.user._id },
    { $set: { isActive: false } }
  );

  plan.isActive = true;
  await plan.save();

  return sendSuccess(res, { plan }, `Plan '${plan.name}' is now active`);
});

// @desc Delete workout plan
// @route DELETE /api/workouts/:id
const deleteWorkoutPlan = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Workout plan not found or unauthorized", 404);
  }

  return sendSuccess(res, null, "Workout plan deleted");
});

// ==========================================
// 3. WORKOUT DASHBOARD & TODAY'S OVERVIEW
// ==========================================

// @desc Get complete workout dashboard data
// @route GET /api/workouts/dashboard
const getWorkoutDashboard = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const dayOfWeek = getDayOfWeek(todayStr); // 0 = Sun..6 = Sat

  // Check for active in-progress session (started within last 24h)
  const activeSession = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "in_progress",
  }).sort({ createdAt: -1 });

  // Today's session (completed, rest, skipped, or in_progress)
  const todaySession = await WorkoutSession.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  // Active workout plan
  const activePlan = await WorkoutPlan.findOne({
    userId: req.user._id,
    isActive: true,
  }).lean();

  let scheduledDay = null;
  if (activePlan && activePlan.schedule) {
    scheduledDay = activePlan.schedule.find((s) => s.dayOfWeek === dayOfWeek) || null;
  }

  // Weekly calendar strip calculation (Monday to Sunday)
  const { weekStart } = getISOWeekDetails(todayStr);
  const weekDates = getWeekDates(weekStart);

  const weekSessions = await WorkoutSession.find({
    userId: req.user._id,
    date: { $in: weekDates },
  }).lean();

  const sessionMap = new Map();
  weekSessions.forEach((s) => sessionMap.set(s.date, s));

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let completedCountThisWeek = 0;
  let totalVolumeKgThisWeek = 0;
  let totalDurationMinutesThisWeek = 0;
  let totalCaloriesBurnedThisWeek = 0;

  const weeklyCalendar = weekDates.map((dateStr) => {
    const dow = getDayOfWeek(dateStr);
    const dayPlan = activePlan?.schedule?.find((s) => s.dayOfWeek === dow);
    const session = sessionMap.get(dateStr);

    let status = "planned";
    if (session) {
      status = session.status;
      if (session.status === "completed") {
        completedCountThisWeek += 1;
        totalVolumeKgThisWeek += session.totalVolumeKg || 0;
        totalDurationMinutesThisWeek += session.durationMinutes || 0;
        totalCaloriesBurnedThisWeek += session.caloriesBurned || 0;
      }
    } else if (dayPlan?.isRestDay) {
      status = "rest";
    } else if (dateStr < todayStr) {
      status = "missed";
    }

    return {
      date: dateStr,
      dayOfWeek: dow,
      dayLabel: dayNames[dow],
      isToday: dateStr === todayStr,
      scheduledDay: dayPlan || null,
      session: session || null,
      status,
    };
  });

  const weeklyGoal = activePlan?.daysPerWeek || 4;
  const weeklyCompletionPercentage = Math.min(
    100,
    Math.round((completedCountThisWeek / (weeklyGoal || 1)) * 100)
  );

  // Last completed workout
  const lastCompletedSession = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "completed",
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Recent 5 workouts
  const recentWorkouts = await WorkoutSession.find({
    userId: req.user._id,
    status: "completed",
  })
    .sort({ date: -1, createdAt: -1 })
    .limit(5)
    .lean();

  // User streak
  const user = await User.findById(req.user._id).select("currentStreak highestStreak").lean();

  return sendSuccess(res, {
    date: todayStr,
    dayOfWeek,
    hasActiveSession: !!activeSession,
    activeSession,
    todaySession,
    activePlan,
    scheduledDay,
    weeklyCalendar,
    weeklyStats: {
      completedWorkouts: completedCountThisWeek,
      weeklyGoal,
      completionPercentage: weeklyCompletionPercentage,
      totalVolumeKg: totalVolumeKgThisWeek,
      totalDurationMinutes: totalDurationMinutesThisWeek,
      estimatedCaloriesBurned: totalCaloriesBurnedThisWeek,
    },
    streak: {
      current: user?.currentStreak || 0,
      highest: user?.highestStreak || 0,
    },
    lastCompletedSession,
    recentWorkouts,
  });
});

// @desc Backward-compatible GET /api/workouts/today
const getTodayWorkout = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const dayOfWeek = getDayOfWeek(todayStr);

  const session = await WorkoutSession.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  const activePlan = await WorkoutPlan.findOne({
    userId: req.user._id,
    isActive: true,
  });

  let scheduledDay = null;
  if (activePlan) {
    scheduledDay = activePlan.schedule.find((s) => s.dayOfWeek === dayOfWeek);
  }

  return sendSuccess(res, {
    date: todayStr,
    dayOfWeek,
    hasSession: !!session,
    session,
    scheduledDay,
    planName: activePlan?.name || null,
  });
});

// ==========================================
// 4. LIVE WORKOUT TRACKER & SESSION LIFECYCLE
// ==========================================

// @desc Get active in-progress workout session
// @route GET /api/workouts/sessions/active
const getActiveSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "in_progress",
  }).sort({ createdAt: -1 });

  return sendSuccess(res, { session: session || null, hasActive: !!session });
});

// @desc Start a workout session
// @route POST /api/workouts/sessions/start
const startWorkoutSession = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const { workoutPlanId, workoutName, targetMuscles, exercises } = req.body;

  // 1. Check if user already has an in-progress session to prevent duplicates
  const existingActive = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "in_progress",
  });

  if (existingActive) {
    return sendSuccess(
      res,
      { session: existingActive, resumed: true },
      "Resumed existing in-progress session"
    );
  }

  // 2. Build initial exercise array
  let initialExercises = [];
  if (Array.isArray(exercises) && exercises.length > 0) {
    initialExercises = exercises.map((ex) => {
      const sets = [];
      const targetSets = ex.targetSets || 3;
      const targetReps = ex.targetReps || 10;
      for (let i = 1; i <= targetSets; i++) {
        sets.push({
          setNumber: i,
          reps: targetReps,
          weight: 0,
          completed: false,
          previousWeight: 0,
          previousReps: 0,
          rpe: 8,
          notes: "",
        });
      }
      return {
        exerciseId: ex.exerciseId || null,
        name: ex.name,
        primaryMuscle: ex.primaryMuscle || "",
        notes: ex.notes || "",
        sets,
      };
    });
  }

  // 3. Hydrate previous best weights/reps for each exercise from PersonalRecords
  if (initialExercises.length > 0) {
    for (const ex of initialExercises) {
      const pr = await PersonalRecord.findOne({
        userId: req.user._id,
        exerciseName: ex.name.trim(),
      }).lean();

      if (pr) {
        ex.sets.forEach((set) => {
          set.previousWeight = pr.bestWeight || 0;
          set.previousReps = pr.bestReps || 0;
        });
      }
    }
  }

  const session = await WorkoutSession.create({
    userId: req.user._id,
    workoutPlanId: workoutPlanId || null,
    date: todayStr,
    workoutName: workoutName || "Live Workout",
    status: "in_progress",
    startTime: new Date(),
    targetMuscles: targetMuscles || [],
    exercises: initialExercises,
    durationSeconds: 0,
    durationMinutes: 0,
    totalVolumeKg: 0,
    totalReps: 0,
    caloriesBurned: 0,
  });

  return sendSuccess(res, { session, resumed: false }, "Workout session started", 201);
});

// @desc Live autosave for workout tracker (prevents progress loss)
// @route PUT /api/workouts/sessions/:id/live-save
const updateLiveSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found or unauthorized", 404);
  }

  const { exercises, durationSeconds, notes, workoutName } = req.body;

  if (exercises !== undefined) session.exercises = exercises;
  if (durationSeconds !== undefined) {
    session.durationSeconds = durationSeconds;
    session.durationMinutes = Math.round(durationSeconds / 60);
  }
  if (notes !== undefined) session.notes = notes;
  if (workoutName !== undefined) session.workoutName = workoutName;

  await session.save();
  return sendSuccess(res, { session }, "Session progress saved");
});

// @desc Finish and finalize a workout session with automatic PR detection & rewards
// @route POST /api/workouts/sessions/:id/finish
const finishWorkoutSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found or unauthorized", 404);
  }

  const { exercises, durationSeconds, notes, rpe, visibility } = req.body;

  if (exercises) session.exercises = exercises;
  if (notes !== undefined) session.notes = notes;
  if (rpe !== undefined) session.rpe = rpe;
  if (visibility !== undefined) session.visibility = visibility;

  const finalDurationSeconds =
    durationSeconds !== undefined
      ? durationSeconds
      : session.startTime
      ? Math.round((Date.now() - new Date(session.startTime).getTime()) / 1000)
      : 0;

  session.durationSeconds = finalDurationSeconds;
  session.durationMinutes = Math.max(1, Math.round(finalDurationSeconds / 60));
  session.endTime = new Date();
  session.status = "completed";

  // Calculate volume, total reps, and target muscles
  let totalVolumeKg = 0;
  let totalReps = 0;
  const trainedMusclesSet = new Set(session.targetMuscles || []);

  const newPersonalRecords = [];

  for (const ex of session.exercises || []) {
    if (ex.primaryMuscle) trainedMusclesSet.add(ex.primaryMuscle);

    // Look up exercise definition to ensure primaryMuscle is populated
    let exerciseDoc = null;
    if (!ex.primaryMuscle) {
      exerciseDoc = await Exercise.findOne({ name: ex.name }).lean();
      if (exerciseDoc?.primaryMuscle) {
        ex.primaryMuscle = exerciseDoc.primaryMuscle;
        trainedMusclesSet.add(exerciseDoc.primaryMuscle);
      }
    }

    for (const set of ex.sets || []) {
      if (!set.completed) continue;

      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      const volume = weight * reps;
      const estimated1RM = calculateEstimated1RM(weight, reps);

      totalVolumeKg += volume;
      totalReps += reps;

      // PR detection only applies if weight > 0 and reps > 0
      if (weight > 0 && reps > 0) {
        let pr = await PersonalRecord.findOne({
          userId: req.user._id,
          exerciseName: ex.name.trim(),
        });

        if (!pr) {
          // First time logging this exercise -> New PR!
          pr = await PersonalRecord.create({
            userId: req.user._id,
            exerciseId: ex.exerciseId || exerciseDoc?._id || null,
            exerciseName: ex.name.trim(),
            primaryMuscle: ex.primaryMuscle || "",
            bestWeight: weight,
            bestReps: reps,
            bestVolume: volume,
            estimatedOneRepMax: estimated1RM,
            achievedAt: new Date(),
            sessionId: session._id,
            history: [
              {
                weight,
                reps,
                estimated1RM,
                volume,
                achievedAt: new Date(),
                sessionId: session._id,
              },
            ],
          });
          set.isPR = true;
          newPersonalRecords.push({
            exerciseName: ex.name.trim(),
            metric: "First Record",
            bestWeight: weight,
            bestReps: reps,
            estimatedOneRepMax: estimated1RM,
          });
        } else {
          let broken = false;
          let metric = "";

          if (weight > pr.bestWeight) {
            pr.bestWeight = weight;
            metric = "Max Weight";
            broken = true;
          }
          if (reps > pr.bestReps && weight >= pr.bestWeight * 0.9) {
            pr.bestReps = reps;
            metric = metric ? `${metric} & Reps` : "Max Reps";
            broken = true;
          }
          if (estimated1RM > (pr.estimatedOneRepMax || 0)) {
            pr.estimatedOneRepMax = estimated1RM;
            metric = metric ? `${metric} & 1RM` : "Estimated 1RM";
            broken = true;
          }
          if (volume > pr.bestVolume) {
            pr.bestVolume = volume;
          }

          if (broken) {
            pr.achievedAt = new Date();
            pr.sessionId = session._id;
            pr.history.push({
              weight,
              reps,
              estimated1RM,
              volume,
              achievedAt: new Date(),
              sessionId: session._id,
            });
            await pr.save();
            set.isPR = true;

            newPersonalRecords.push({
              exerciseName: ex.name.trim(),
              metric,
              bestWeight: weight,
              bestReps: reps,
              estimatedOneRepMax: estimated1RM,
            });
          }
        }
      }
    }
  }

  session.totalVolumeKg = Math.round(totalVolumeKg);
  session.totalReps = totalReps;
  session.targetMuscles = Array.from(trainedMusclesSet);
  session.caloriesBurned = calculateEstimatedCalories(
    session.durationMinutes,
    session.totalVolumeKg
  );

  await session.save();

  // Create In-App Notification if PRs were broken
  if (newPersonalRecords.length > 0) {
    const prNames = newPersonalRecords.map((p) => p.exerciseName).join(", ");
    await Notification.create({
      userId: req.user._id,
      type: "personal_record",
      category: "achievement",
      title: "🏆 New Personal Record!",
      body: `You set a new PR in ${prNames}! Keep breaking boundaries.`,
      url: "/workouts",
      activityId: session._id.toString(),
      data: { newPersonalRecords },
    }).catch(() => {});
  }

  // Award points, calculate streak, and notify squad
  await syncWorkoutPointsAndNotify(req.user, session.date, session);

  return sendSuccess(
    res,
    {
      session,
      summary: {
        durationMinutes: session.durationMinutes,
        durationSeconds: session.durationSeconds,
        totalVolumeKg: session.totalVolumeKg,
        totalReps: session.totalReps,
        caloriesBurned: session.caloriesBurned,
        targetMuscles: session.targetMuscles,
        newPersonalRecords,
      },
    },
    "Workout completed! Great effort!"
  );
});

// @desc Cancel an in-progress workout session
// @route POST /api/workouts/sessions/:id/cancel
const cancelWorkoutSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found", 404);
  }

  // Delete session if it was never completed
  if (session.status === "in_progress" || session.status === "planned") {
    await WorkoutSession.findByIdAndDelete(session._id);
    return sendSuccess(res, null, "Workout session cancelled");
  }

  return sendError(res, "Cannot cancel an already completed workout session", 400);
});

// @desc Share completed workout session to squad feed with caption
// @route POST /api/workouts/sessions/:id/share
const shareWorkoutToFeed = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found", 404);
  }

  const { caption } = req.body;

  const memberships = await Membership.find({
    userId: req.user._id,
    status: "active",
  }).lean();

  if (!memberships || memberships.length === 0) {
    return sendError(res, "You are not an active member of any squad to share with.", 400);
  }

  // Post FeedEvent to all squads
  for (const m of memberships) {
    await FeedEvent.create({
      groupId: m.groupId,
      userId: req.user._id,
      type: "workout_completed",
      title: `${req.user.name} finished ${session.workoutName || "a workout"}`,
      dateKey: session.date,
      dedupeKey: `workout_${session._id}_${m.groupId}`,
      meta: {
        sessionId: session._id,
        workoutName: session.workoutName,
        durationMinutes: session.durationMinutes,
        totalVolumeKg: session.totalVolumeKg,
        totalReps: session.totalReps,
        caloriesBurned: session.caloriesBurned,
        targetMuscles: session.targetMuscles,
        caption: caption || "",
      },
    }).catch(() => {});
  }

  session.sharedToFeed = true;
  await session.save();

  return sendSuccess(res, { session }, "Workout shared to your squad!");
});

// ==========================================
// 5. WORKOUT HISTORY & ANALYTICS
// ==========================================

// @desc Get workout history with date, muscle, and plan filters
// @route GET /api/workouts/sessions/history
const getWorkoutHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, muscle, planId, page = 1, limit = 20 } = req.query;

  const query = {
    userId: req.user._id,
    status: { $in: ["completed", "rest"] },
  };

  if (startDate && endDate) {
    query.date = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    query.date = { $gte: startDate };
  } else if (endDate) {
    query.date = { $lte: endDate };
  }

  if (muscle && muscle !== "All") {
    query.targetMuscles = muscle;
  }

  if (planId) {
    query.workoutPlanId = planId;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await WorkoutSession.countDocuments(query);
  const sessions = await WorkoutSession.find(query)
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  return sendSuccess(res, {
    sessions,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// @desc Get single workout session detail
// @route GET /api/workouts/sessions/:id
const getWorkoutSessionById = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  }).lean();

  if (!session) {
    return sendError(res, "Workout session not found", 404);
  }

  return sendSuccess(res, { session });
});

// @desc Get comprehensive workout analytics (Volume, Frequency, Muscle breakdown)
// @route GET /api/workouts/analytics
const getWorkoutAnalytics = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const past60DaysStr = addDaysToDateString(todayStr, -60);

  const completedSessions = await WorkoutSession.find({
    userId: req.user._id,
    status: "completed",
    date: { $gte: past60DaysStr },
  })
    .sort({ date: 1 })
    .lean();

  // 1. Weekly volume trend (past 8 weeks)
  const weeklyVolumeMap = {};
  completedSessions.forEach((s) => {
    const { weekStart } = getISOWeekDetails(s.date);
    if (!weeklyVolumeMap[weekStart]) {
      weeklyVolumeMap[weekStart] = { week: weekStart, volumeKg: 0, count: 0, durationMinutes: 0 };
    }
    weeklyVolumeMap[weekStart].volumeKg += s.totalVolumeKg || 0;
    weeklyVolumeMap[weekStart].count += 1;
    weeklyVolumeMap[weekStart].durationMinutes += s.durationMinutes || 0;
  });

  const volumeTrend = Object.values(weeklyVolumeMap).sort((a, b) => a.week.localeCompare(b.week));

  // 2. Muscle group frequency breakdown
  const muscleDistribution = {};
  completedSessions.forEach((s) => {
    (s.targetMuscles || []).forEach((muscle) => {
      muscleDistribution[muscle] = (muscleDistribution[muscle] || 0) + 1;
    });
  });

  const muscleBreakdown = Object.entries(muscleDistribution).map(([muscle, count]) => ({
    muscle,
    count,
  }));

  // 3. Overall Totals
  const totalWorkouts = completedSessions.length;
  const totalVolume = completedSessions.reduce((acc, s) => acc + (s.totalVolumeKg || 0), 0);
  const totalDuration = completedSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const avgDuration = totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0;

  return sendSuccess(res, {
    volumeTrend,
    muscleBreakdown,
    summary: {
      totalWorkouts,
      totalVolumeKg: totalVolume,
      totalDurationMinutes: totalDuration,
      avgDurationMinutes: avgDuration,
    },
  });
});

// @desc Get interactive body map data (Volume and sets per muscle group in past 7 and 30 days)
// @route GET /api/workouts/analytics/muscle-map
const getMuscleMapData = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const past7DaysStr = addDaysToDateString(todayStr, -7);
  const past30DaysStr = addDaysToDateString(todayStr, -30);

  const recentSessions = await WorkoutSession.find({
    userId: req.user._id,
    status: "completed",
    date: { $gte: past30DaysStr },
  })
    .sort({ date: -1 })
    .lean();

  const muscleGroups = [
    "Chest",
    "Back",
    "Shoulders",
    "Biceps",
    "Triceps",
    "Forearms",
    "Legs",
    "Abs",
    "Full Body",
  ];

  const mapData = {};
  muscleGroups.forEach((m) => {
    mapData[m] = {
      muscle: m,
      past7DaysSets: 0,
      past7DaysVolume: 0,
      past30DaysSets: 0,
      past30DaysVolume: 0,
      lastTrainedDate: null,
      trainedRecently: false, // trained in past 48h
    };
  });

  recentSessions.forEach((s) => {
    const isPast7Days = s.date >= past7DaysStr;
    const isVeryRecent = addDaysToDateString(todayStr, -2) <= s.date;

    (s.exercises || []).forEach((ex) => {
      const muscle = ex.primaryMuscle || "Full Body";
      if (!mapData[muscle]) {
        mapData[muscle] = {
          muscle,
          past7DaysSets: 0,
          past7DaysVolume: 0,
          past30DaysSets: 0,
          past30DaysVolume: 0,
          lastTrainedDate: null,
          trainedRecently: false,
        };
      }

      const completedSets = (ex.sets || []).filter((st) => st.completed);
      const setVolume = completedSets.reduce(
        (sum, st) => sum + (st.weight || 0) * (st.reps || 0),
        0
      );

      mapData[muscle].past30DaysSets += completedSets.length;
      mapData[muscle].past30DaysVolume += setVolume;

      if (isPast7Days) {
        mapData[muscle].past7DaysSets += completedSets.length;
        mapData[muscle].past7DaysVolume += setVolume;
      }

      if (!mapData[muscle].lastTrainedDate) {
        mapData[muscle].lastTrainedDate = s.date;
      }

      if (isVeryRecent) {
        mapData[muscle].trainedRecently = true;
      }
    });
  });

  return sendSuccess(res, { muscleMap: Object.values(mapData) });
});

// @desc Get all personal records with history
// @route GET /api/workouts/records
const getPersonalRecords = asyncHandler(async (req, res) => {
  const records = await PersonalRecord.find({ userId: req.user._id })
    .sort({ bestWeight: -1, exerciseName: 1 })
    .lean();
  return sendSuccess(res, { records, total: records.length });
});

// @desc Backward-compatible quick attendance logger
// @route POST /api/workouts/attendance
const markAttendance = asyncHandler(async (req, res) => {
  const { status, workoutName } = req.body; // "completed" or "rest"
  const todayStr = getLocalDateString(new Date(), req.user.timezone);

  const session = await WorkoutSession.findOneAndUpdate(
    {
      userId: req.user._id,
      date: todayStr,
    },
    {
      $set: {
        status: status || "completed",
        workoutName: workoutName || (status === "rest" ? "Rest Day" : "Workout"),
      },
    },
    { upsert: true, new: true }
  );

  await syncWorkoutPointsAndNotify(req.user, todayStr, session);
  return sendSuccess(res, { session }, `Marked as ${status}`);
});

// @desc Backward-compatible session save/update (preserves existing POST /api/workouts/sessions)
const saveWorkoutSession = asyncHandler(async (req, res) => {
  const { workoutPlanId, date, workoutName, status, exercises, durationMinutes, notes } = req.body;
  const sessionDate = date || getLocalDateString(new Date(), req.user.timezone);

  let session = await WorkoutSession.findOne({
    userId: req.user._id,
    date: sessionDate,
  });

  if (session) {
    if (workoutPlanId) session.workoutPlanId = workoutPlanId;
    if (workoutName) session.workoutName = workoutName;
    if (status) session.status = status;
    if (exercises) session.exercises = exercises;
    if (durationMinutes !== undefined) {
      session.durationMinutes = durationMinutes;
      session.durationSeconds = durationMinutes * 60;
    }
    if (notes !== undefined) session.notes = notes;
    await session.save();
  } else {
    session = await WorkoutSession.create({
      userId: req.user._id,
      workoutPlanId: workoutPlanId || null,
      date: sessionDate,
      workoutName: workoutName || "Workout Session",
      status: status || "completed",
      exercises: exercises || [],
      durationMinutes: durationMinutes || 0,
      durationSeconds: (durationMinutes || 0) * 60,
      notes: notes || "",
    });
  }

  // Update PRs and sync habit points
  if (exercises && Array.isArray(exercises)) {
    for (const ex of exercises) {
      if (!ex.name || !ex.sets) continue;
      for (const set of ex.sets) {
        if (!set.completed) continue;
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        const volume = weight * reps;
        const estimated1RM = calculateEstimated1RM(weight, reps);

        let pr = await PersonalRecord.findOne({
          userId: req.user._id,
          exerciseName: ex.name.trim(),
        });

        if (!pr) {
          await PersonalRecord.create({
            userId: req.user._id,
            exerciseName: ex.name.trim(),
            bestWeight: weight,
            bestReps: reps,
            bestVolume: volume,
            estimatedOneRepMax: estimated1RM,
            achievedAt: new Date(),
            sessionId: session._id,
          });
        } else {
          let updated = false;
          if (weight > pr.bestWeight) {
            pr.bestWeight = weight;
            updated = true;
          }
          if (reps > pr.bestReps) {
            pr.bestReps = reps;
            updated = true;
          }
          if (volume > pr.bestVolume) {
            pr.bestVolume = volume;
            updated = true;
          }
          if (estimated1RM > (pr.estimatedOneRepMax || 0)) {
            pr.estimatedOneRepMax = estimated1RM;
            updated = true;
          }
          if (updated) {
            pr.achievedAt = new Date();
            pr.sessionId = session._id;
            await pr.save();
          }
        }
      }
    }
  }

  await syncWorkoutPointsAndNotify(req.user, sessionDate, session);
  return sendSuccess(res, { session }, "Workout session saved successfully");
});

// @desc Backward-compatible PATCH /api/workouts/sessions/:id
const updateWorkoutSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found or unauthorized", 404);
  }

  const { status, exercises, durationMinutes, notes } = req.body;
  if (status) session.status = status;
  if (exercises) session.exercises = exercises;
  if (durationMinutes !== undefined) {
    session.durationMinutes = durationMinutes;
    session.durationSeconds = durationMinutes * 60;
  }
  if (notes !== undefined) session.notes = notes;

  await session.save();
  return sendSuccess(res, { session }, "Workout session updated");
});

module.exports = {
  // Exercises
  getExercises,
  getExerciseById,
  toggleFavoriteExercise,
  createCustomExercise,
  // Templates & Plans
  getTemplates,
  applyTemplate,
  getMyWorkoutPlans,
  createWorkoutPlan,
  updateWorkoutPlan,
  duplicateWorkoutPlan,
  activateWorkoutPlan,
  deleteWorkoutPlan,
  // Dashboard & Today
  getWorkoutDashboard,
  getTodayWorkout,
  // Live Sessions
  getActiveSession,
  startWorkoutSession,
  updateLiveSession,
  finishWorkoutSession,
  cancelWorkoutSession,
  shareWorkoutToFeed,
  // History & Analytics
  getWorkoutHistory,
  getWorkoutSessionById,
  getWorkoutAnalytics,
  getMuscleMapData,
  getPersonalRecords,
  // Legacy
  saveWorkoutSession,
  updateWorkoutSession,
  markAttendance,
};
