const fs = require("fs");
const path = require("path");
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
    if (count < 100) {
      console.log("[WorkoutSeed] Seeding comprehensive exercise catalog (2,000+ exercises)...");
      const catalogPath = path.join(__dirname, "../seed/comprehensiveExerciseCatalog.json");
      if (fs.existsSync(catalogPath)) {
        const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
        const ops = catalog.map((ex) => ({
          updateOne: {
            filter: { slug: ex.slug },
            update: { $set: ex },
            upsert: true,
          },
        }));
        for (let i = 0; i < ops.length; i += 500) {
          await Exercise.bulkWrite(ops.slice(i, i + 500), { ordered: false });
        }
        console.log("[WorkoutSeed] Exercise library seeded successfully.");
      } else {
        await Exercise.insertMany(EXERCISE_SEED_DATA);
      }
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

// @desc Get all exercises with filtering, searching, favorites, and pagination
// @route GET /api/workouts/exercises
const getExercises = asyncHandler(async (req, res) => {
  await ensureExercisesSeeded();

  const {
    search,
    muscle,
    equipment,
    difficulty,
    category,
    mediaType,
    favoritesOnly,
    sortBy = "media",
    page = 1,
    limit = 24,
  } = req.query;

  const filter = {};
  const andConditions = [];

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    andConditions.push({
      $or: [
        { name: { $regex: escaped, $options: "i" } },
        { alternativeNames: { $regex: escaped, $options: "i" } },
        { primaryMuscle: { $regex: escaped, $options: "i" } },
        { secondaryMuscles: { $regex: escaped, $options: "i" } },
        { equipment: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ],
    });
  }

  if (muscle && muscle !== "All") {
    andConditions.push({
      $or: [
        { primaryMuscle: muscle },
        { secondaryMuscles: muscle },
      ],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
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

  if (mediaType && mediaType !== "all") {
    if (mediaType === "video") {
      filter.mediaType = "video";
    } else if (mediaType === "gif") {
      filter.mediaType = "gif";
    } else if (mediaType === "images") {
      filter.mediaType = "images";
    } else if (mediaType === "any_media") {
      filter.mediaType = { $in: ["video", "gif", "images"] };
    }
  }

  if (favoritesOnly === "true" || favoritesOnly === true) {
    filter.favoriteBy = req.user._id;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const skip = (pageNum - 1) * limitNum;

  let sortOption = { name: 1 };
  if (sortBy === "media") {
    // Show video first, then gif, then images, then alphabetical
    sortOption = { videoUrl: -1, gifUrl: -1, name: 1 };
  } else if (sortBy === "difficulty") {
    sortOption = { difficulty: 1, name: 1 };
  }

  const [total, exercises] = await Promise.all([
    Exercise.countDocuments(filter),
    Exercise.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .lean(),
  ]);

  const formatted = exercises.map((ex) => ({
    ...ex,
    isFavorite: Array.isArray(ex.favoriteBy)
      ? ex.favoriteBy.some((id) => id.toString() === req.user._id.toString())
      : false,
  }));

  return sendSuccess(res, {
    exercises: formatted,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    },
  });
});

// @desc Get filter options and counts
// @route GET /api/workouts/exercises/filters
const getExerciseFilters = asyncHandler(async (req, res) => {
  const [totalCount, videoCount, gifCount, imagesCount, muscles, equipment, categories] =
    await Promise.all([
      Exercise.countDocuments(),
      Exercise.countDocuments({ mediaType: "video" }),
      Exercise.countDocuments({ mediaType: "gif" }),
      Exercise.countDocuments({ mediaType: "images" }),
      Exercise.distinct("primaryMuscle"),
      Exercise.distinct("equipment"),
      Exercise.distinct("category"),
    ]);

  return sendSuccess(res, {
    totalCount,
    mediaCounts: {
      video: videoCount,
      gif: gifCount,
      images: imagesCount,
    },
    muscles: muscles.sort(),
    equipment: equipment.sort(),
    categories: categories.sort(),
  });
});

// @desc Get single exercise by ID or slug with similar exercises
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

  // Find up to 4 similar exercises with the same primary muscle
  const similarExercises = await Exercise.find({
    _id: { $ne: exercise._id },
    primaryMuscle: exercise.primaryMuscle,
  })
    .sort({ videoUrl: -1, gifUrl: -1, name: 1 })
    .limit(4)
    .lean();

  return sendSuccess(res, {
    exercise: { ...exercise, isFavorite },
    similarExercises,
  });
});

// @desc Toggle exercise favorite
// @route POST /api/workouts/exercises/:id/favorite
const toggleFavoriteExercise = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid exercise ID format", 400);
  }

  const exercise = await Exercise.findById(req.params.id);
  if (!exercise) {
    return sendError(res, "Exercise not found", 404);
  }

  if (!Array.isArray(exercise.favoriteBy)) {
    exercise.favoriteBy = [];
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

/**
 * Helper to resolve an exercise identifier (ObjectId, slug, or name) into canonical doc and search aliases
 */
const resolveExerciseAndAliases = async (identifier) => {
  if (!identifier) return { exerciseDoc: null, queryNames: [], matchConditions: [] };

  const raw = decodeURIComponent(identifier).trim();
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(raw);

  let exerciseDoc = null;
  if (isObjectId) {
    exerciseDoc = await Exercise.findById(raw).lean();
  }

  if (!exerciseDoc) {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    exerciseDoc = await Exercise.findOne({
      $or: [
        { slug: raw.toLowerCase() },
        { name: new RegExp(`^${escaped}$`, "i") },
        { alternativeNames: new RegExp(`^${escaped}$`, "i") },
      ],
    }).lean();
  }

  const queryNames = exerciseDoc
    ? [exerciseDoc.name, ...(exerciseDoc.alternativeNames || [])]
    : [raw];

  const matchConditions = [];
  if (exerciseDoc?._id) {
    matchConditions.push({ "exercises.exerciseId": exerciseDoc._id });
  }

  for (const name of queryNames) {
    if (!name) continue;
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchConditions.push({ "exercises.name": new RegExp(`^${escaped}$`, "i") });
  }

  return { exerciseDoc, queryNames, matchConditions };
};

// @desc Get user's latest completed performance for a specific exercise
// @route GET /api/workouts/exercises/:identifier/previous-performance
const getExercisePreviousPerformance = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { exerciseDoc, queryNames, matchConditions } = await resolveExerciseAndAliases(identifier);

  if (matchConditions.length === 0) {
    return sendSuccess(res, {
      hasPreviousPerformance: false,
      message: "First time performing this exercise. Your progress starts today!",
      exercise: null,
      previousSession: null,
      personalRecord: null,
      suggestion: "Set a strong benchmark for your first session!",
    });
  }

  // Find the most recent valid completed session containing this exercise
  const latestSession = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "completed",
    $or: matchConditions,
  })
    .sort({ date: -1, endTime: -1, createdAt: -1 })
    .lean();

  // Query personal record for this exercise
  const canonicalName = exerciseDoc?.name || decodeURIComponent(identifier).trim();
  const pr = await PersonalRecord.findOne({
    userId: req.user._id,
    $or: [
      ...(exerciseDoc?._id ? [{ exerciseId: exerciseDoc._id }] : []),
      { exerciseName: new RegExp(`^${canonicalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    ],
  }).lean();

  if (!latestSession) {
    return sendSuccess(res, {
      hasPreviousPerformance: false,
      message: "First time performing this exercise. Your progress starts today!",
      exercise: exerciseDoc
        ? {
            _id: exerciseDoc._id,
            name: exerciseDoc.name,
            primaryMuscle: exerciseDoc.primaryMuscle,
            equipment: exerciseDoc.equipment,
            videoUrl: exerciseDoc.videoUrl,
            gifUrl: exerciseDoc.gifUrl,
          }
        : null,
      previousSession: null,
      personalRecord: pr
        ? {
            bestWeight: pr.bestWeight,
            bestReps: pr.bestReps,
            estimatedOneRepMax: pr.estimatedOneRepMax,
            achievedAt: pr.achievedAt,
          }
        : null,
      suggestion: "First time performing this exercise. Your progress starts today!",
    });
  }

  // Find the exact exercise inside the session
  const foundEx = (latestSession.exercises || []).find((e) => {
    if (exerciseDoc?._id && e.exerciseId && e.exerciseId.toString() === exerciseDoc._id.toString()) {
      return true;
    }
    const eName = (e.name || "").toLowerCase().trim();
    return queryNames.some((qn) => qn.toLowerCase().trim() === eName);
  });

  const completedSets = (foundEx?.sets || []).filter((s) => s.completed !== false);
  const bestWeight = completedSets.length > 0 ? Math.max(...completedSets.map((s) => s.weight || 0)) : 0;
  const bestReps = completedSets.length > 0 ? Math.max(...completedSets.map((s) => s.reps || 0)) : 0;
  const totalVolumeKg = completedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);

  // Progressive overload assistance suggestion
  let suggestion = "";
  if (completedSets.length > 0) {
    const topSet = completedSets.reduce(
      (best, s) =>
        (s.weight || 0) > (best.weight || 0)
          ? s
          : (s.weight || 0) === (best.weight || 0) && (s.reps || 0) > (best.reps || 0)
          ? s
          : best,
      completedSets[0]
    );
    suggestion = `You previously completed ${topSet.weight || 0} kg × ${topSet.reps || 0}. Try matching this performance or adding 1 rep!`;
  } else {
    suggestion = "Maintain consistent form and track your sets today.";
  }

  return sendSuccess(res, {
    hasPreviousPerformance: true,
    message: `Last performed on ${latestSession.date} in ${latestSession.workoutName || "Workout"}`,
    exercise: exerciseDoc
      ? {
          _id: exerciseDoc._id,
          name: exerciseDoc.name,
          primaryMuscle: exerciseDoc.primaryMuscle,
          equipment: exerciseDoc.equipment,
          videoUrl: exerciseDoc.videoUrl,
          gifUrl: exerciseDoc.gifUrl,
        }
      : { name: foundEx?.name || canonicalName, primaryMuscle: foundEx?.primaryMuscle || "" },
    previousSession: {
      sessionId: latestSession._id,
      date: latestSession.date,
      workoutName: latestSession.workoutName || "Workout",
      setsCount: completedSets.length,
      sets: completedSets.map((s) => ({
        setNumber: s.setNumber,
        weight: s.weight || 0,
        reps: s.reps || 0,
        rpe: s.rpe || null,
        isPR: Boolean(s.isPR),
      })),
      totalVolumeKg: Math.round(totalVolumeKg),
      bestWeight,
      bestReps,
    },
    personalRecord: pr
      ? {
          bestWeight: pr.bestWeight,
          bestReps: pr.bestReps,
          estimatedOneRepMax: pr.estimatedOneRepMax,
          achievedAt: pr.achievedAt,
        }
      : null,
    suggestion,
  });
});

// @desc Get chronological workout performance history for a specific exercise
// @route GET /api/workouts/exercises/:identifier/history
const getExerciseHistory = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { exerciseDoc, queryNames, matchConditions } = await resolveExerciseAndAliases(identifier);

  if (matchConditions.length === 0) {
    return sendSuccess(res, {
      exerciseName: decodeURIComponent(identifier),
      history: [],
      totalSessions: 0,
    });
  }

  const sessions = await WorkoutSession.find({
    userId: req.user._id,
    status: "completed",
    $or: matchConditions,
  })
    .sort({ date: -1, endTime: -1, createdAt: -1 })
    .limit(25)
    .lean();

  const history = sessions
    .map((s) => {
      const ex = (s.exercises || []).find((e) => {
        if (exerciseDoc?._id && e.exerciseId && e.exerciseId.toString() === exerciseDoc._id.toString()) {
          return true;
        }
        const eName = (e.name || "").toLowerCase().trim();
        return queryNames.some((qn) => qn.toLowerCase().trim() === eName);
      });

      if (!ex) return null;

      const completedSets = (ex.sets || []).filter((set) => set.completed !== false);
      if (completedSets.length === 0) return null;

      const maxWeight = Math.max(0, ...completedSets.map((set) => set.weight || 0));
      const maxReps = Math.max(0, ...completedSets.map((set) => set.reps || 0));
      const totalVolume = completedSets.reduce(
        (sum, set) => sum + (set.weight || 0) * (set.reps || 0),
        0
      );
      const estimated1RM = completedSets.reduce(
        (max, set) => Math.max(max, calculateEstimated1RM(set.weight || 0, set.reps || 0)),
        0
      );

      return {
        sessionId: s._id,
        date: s.date,
        workoutName: s.workoutName || "Workout",
        sets: completedSets.map((set) => ({
          setNumber: set.setNumber,
          weight: set.weight || 0,
          reps: set.reps || 0,
          rpe: set.rpe || null,
          isPR: Boolean(set.isPR),
        })),
        totalVolumeKg: Math.round(totalVolume),
        maxWeight,
        maxReps,
        estimated1RM,
      };
    })
    .filter(Boolean);

  const canonicalName = exerciseDoc?.name || decodeURIComponent(identifier).trim();
  const pr = await PersonalRecord.findOne({
    userId: req.user._id,
    $or: [
      ...(exerciseDoc?._id ? [{ exerciseId: exerciseDoc._id }] : []),
      { exerciseName: new RegExp(`^${canonicalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    ],
  }).lean();

  return sendSuccess(res, {
    exerciseName: canonicalName,
    exercise: exerciseDoc
      ? {
          _id: exerciseDoc._id,
          name: exerciseDoc.name,
          primaryMuscle: exerciseDoc.primaryMuscle,
          videoUrl: exerciseDoc.videoUrl,
          gifUrl: exerciseDoc.gifUrl,
        }
      : null,
    history,
    totalSessions: history.length,
    personalRecord: pr
      ? {
          bestWeight: pr.bestWeight,
          bestReps: pr.bestReps,
          estimatedOneRepMax: pr.estimatedOneRepMax,
          achievedAt: pr.achievedAt,
        }
      : null,
  });
});

// ==========================================
// 2. WORKOUT PLAN MANAGEMENT
// ==========================================

// Helper to sanitize schedule and exercise objects before creating/updating plans
const sanitizeSchedule = (schedule) => {
  if (!Array.isArray(schedule)) return [];
  return schedule.map((day, idx) => ({
    dayOfWeek: typeof day.dayOfWeek === "number" ? day.dayOfWeek : (idx + 1) % 7,
    dayName: day.dayName || `Day ${idx + 1}`,
    workoutName: day.workoutName || "Workout",
    isRestDay: Boolean(day.isRestDay),
    targetMuscles: Array.isArray(day.targetMuscles) ? day.targetMuscles : [],
    exercises: day.isRestDay
      ? []
      : (Array.isArray(day.exercises) ? day.exercises : [])
          .filter((ex) => ex && (ex.name || typeof ex === "string"))
          .map((ex) => ({
            exerciseId: ex.exerciseId && mongoose.Types.ObjectId.isValid(ex.exerciseId) ? ex.exerciseId : null,
            name: (typeof ex === "string" ? ex : ex.name || "Exercise").trim() || "Exercise",
            primaryMuscle: ex.primaryMuscle || "",
            targetSets: Number(ex.targetSets) || 3,
            targetReps: Number(ex.targetReps) || 10,
            targetWeight: Number(ex.targetWeight) || 0,
            restSeconds: Number(ex.restSeconds) || 60,
            notes: ex.notes || "",
          })),
  }));
};

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
    description: template.description || "",
    fitnessLevel: template.fitnessLevel || "Intermediate",
    goal: template.goal || "Hypertrophy",
    daysPerWeek: template.daysPerWeek || 4,
    isTemplate: false,
    templateKey: template.templateKey,
    schedule: sanitizeSchedule(template.schedule),
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

  const cleanSchedule = sanitizeSchedule(schedule);

  const workoutPlan = await WorkoutPlan.create({
    userId: req.user._id,
    groupId: (groupId && mongoose.Types.ObjectId.isValid(groupId)) ? groupId : null,
    name: name ? name.trim() : "Custom Workout Plan",
    description: description || "",
    fitnessLevel: fitnessLevel || "Intermediate",
    goal: goal || "Hypertrophy",
    daysPerWeek: daysPerWeek || (cleanSchedule.length > 0 ? cleanSchedule.filter((s) => !s.isRestDay).length : 4),
    schedule: cleanSchedule,
    isActive: isActive !== false,
  });

  return sendSuccess(res, { workoutPlan }, "Workout plan created successfully", 201);
});

// @desc Update workout plan
// @route PUT /api/workouts/:id
const updateWorkoutPlan = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid plan ID format", 400);
  }

  const plan = await WorkoutPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Workout plan not found or unauthorized", 404);
  }

  const { name, description, fitnessLevel, goal, daysPerWeek, schedule, isActive, groupId } =
    req.body;

  if (name !== undefined) plan.name = name.trim() || plan.name;
  if (description !== undefined) plan.description = description;
  if (fitnessLevel !== undefined) plan.fitnessLevel = fitnessLevel;
  if (goal !== undefined) plan.goal = goal;
  if (daysPerWeek !== undefined) plan.daysPerWeek = daysPerWeek;
  if (schedule !== undefined) plan.schedule = sanitizeSchedule(schedule);
  if (groupId !== undefined) plan.groupId = (groupId && mongoose.Types.ObjectId.isValid(groupId)) ? groupId : null;

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid plan ID format", 400);
  }

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid plan ID format", 400);
  }

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid plan ID format", 400);
  }

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
  let activeSession = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "in_progress",
  }).sort({ createdAt: -1 });

  if (activeSession) {
    activeSession = await hydrateSessionExercisesMedia(activeSession);
  }

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

/**
 * Hydrates video, gif, instructions, and media details for exercises in a session if missing.
 */
const hydrateSessionExercisesMedia = async (session) => {
  if (!session || !Array.isArray(session.exercises)) return session;
  let modified = false;

  for (const ex of session.exercises) {
    if (!ex.videoUrl && !ex.gifUrl && (!ex.images || ex.images.length === 0)) {
      const { exerciseDoc } = await resolveExerciseAndAliases(ex.exerciseId || ex.name);
      if (exerciseDoc) {
        if (!ex.exerciseId && exerciseDoc._id) {
          ex.exerciseId = exerciseDoc._id;
          modified = true;
        }
        if (exerciseDoc.name && (!ex.name || ex.name === "Exercise")) {
          ex.name = exerciseDoc.name;
          modified = true;
        }
        if (exerciseDoc.primaryMuscle && !ex.primaryMuscle) {
          ex.primaryMuscle = exerciseDoc.primaryMuscle;
          modified = true;
        }
        if (exerciseDoc.videoUrl) {
          ex.videoUrl = exerciseDoc.videoUrl;
          modified = true;
        }
        if (exerciseDoc.videoUrlFemale) {
          ex.videoUrlFemale = exerciseDoc.videoUrlFemale;
          modified = true;
        }
        if (exerciseDoc.gifUrl) {
          ex.gifUrl = exerciseDoc.gifUrl;
          modified = true;
        }
        if (exerciseDoc.thumbnailUrl) {
          ex.thumbnailUrl = exerciseDoc.thumbnailUrl;
          modified = true;
        }
        if (exerciseDoc.mediaType) {
          ex.mediaType = exerciseDoc.mediaType;
          modified = true;
        }
        if (exerciseDoc.images && exerciseDoc.images.length > 0) {
          ex.images = exerciseDoc.images;
          modified = true;
        }
        if (exerciseDoc.instructions && exerciseDoc.instructions.length > 0) {
          ex.instructions = exerciseDoc.instructions;
          modified = true;
        }
        if (exerciseDoc.equipment) {
          ex.equipment = exerciseDoc.equipment;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    try {
      await session.save();
    } catch (e) {
      // ignore
    }
  }

  return session;
};

// @desc Get active in-progress workout session
// @route GET /api/workouts/sessions/active
const getActiveSession = asyncHandler(async (req, res) => {
  let session = await WorkoutSession.findOne({
    userId: req.user._id,
    status: "in_progress",
  }).sort({ createdAt: -1 });

  if (session) {
    session = await hydrateSessionExercisesMedia(session);
  }

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
    const hydrated = await hydrateSessionExercisesMedia(existingActive);
    return sendSuccess(
      res,
      { session: hydrated, resumed: true },
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
        exerciseId: ex.exerciseId && mongoose.Types.ObjectId.isValid(ex.exerciseId) ? ex.exerciseId : null,
        name: (ex.name || "").trim() || "Exercise",
        primaryMuscle: ex.primaryMuscle || "",
        videoUrl: ex.videoUrl || "",
        videoUrlFemale: ex.videoUrlFemale || "",
        gifUrl: ex.gifUrl || "",
        thumbnailUrl: ex.thumbnailUrl || "",
        images: Array.isArray(ex.images) ? ex.images : [],
        mediaType: ex.mediaType || (ex.videoUrl ? "video" : ex.gifUrl ? "gif" : "text_only"),
        instructions: Array.isArray(ex.instructions) ? ex.instructions : [],
        equipment: ex.equipment || "",
        difficulty: ex.difficulty || "",
        category: ex.category || "",
        notes: ex.notes || "",
        sets,
      };
    });
  }

  // 3. Hydrate previous performance, records, AND rich media for each exercise
  if (initialExercises.length > 0) {
    for (const ex of initialExercises) {
      const exName = (ex.name || "").trim();
      if (!exName) continue;

      const { exerciseDoc, queryNames, matchConditions } = await resolveExerciseAndAliases(ex.exerciseId || exName);

      // Populate rich media from exercise database
      if (exerciseDoc) {
        if (!ex.exerciseId) ex.exerciseId = exerciseDoc._id;
        if (exerciseDoc.name) ex.name = exerciseDoc.name;
        if (exerciseDoc.primaryMuscle && !ex.primaryMuscle) ex.primaryMuscle = exerciseDoc.primaryMuscle;
        if (exerciseDoc.videoUrl) ex.videoUrl = exerciseDoc.videoUrl;
        if (exerciseDoc.videoUrlFemale) ex.videoUrlFemale = exerciseDoc.videoUrlFemale;
        if (exerciseDoc.gifUrl) ex.gifUrl = exerciseDoc.gifUrl;
        if (exerciseDoc.thumbnailUrl) ex.thumbnailUrl = exerciseDoc.thumbnailUrl;
        if (exerciseDoc.mediaType) ex.mediaType = exerciseDoc.mediaType;
        if (exerciseDoc.images && exerciseDoc.images.length > 0) ex.images = exerciseDoc.images;
        if (exerciseDoc.instructions && exerciseDoc.instructions.length > 0) ex.instructions = exerciseDoc.instructions;
        if (exerciseDoc.equipment && !ex.equipment) ex.equipment = exerciseDoc.equipment;
        if (exerciseDoc.difficulty && !ex.difficulty) ex.difficulty = exerciseDoc.difficulty;
        if (exerciseDoc.category && !ex.category) ex.category = exerciseDoc.category;
      }

      // Find the latest completed session containing this exercise
      let latestSession = null;
      if (matchConditions.length > 0) {
        latestSession = await WorkoutSession.findOne({
          userId: req.user._id,
          status: "completed",
          $or: matchConditions,
        })
          .sort({ date: -1, endTime: -1, createdAt: -1 })
          .lean();
      }

      // Query PR
      const canonicalName = exerciseDoc?.name || exName;
      const pr = await PersonalRecord.findOne({
        userId: req.user._id,
        $or: [
          ...(exerciseDoc?._id ? [{ exerciseId: exerciseDoc._id }] : []),
          { exerciseName: new RegExp(`^${canonicalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        ],
      }).lean();

      if (latestSession) {
        const foundPrevEx = (latestSession.exercises || []).find((e) => {
          if (exerciseDoc?._id && e.exerciseId && e.exerciseId.toString() === exerciseDoc._id.toString()) return true;
          const eName = (e.name || "").toLowerCase().trim();
          return queryNames.some((qn) => qn.toLowerCase().trim() === eName);
        });

        const completedSets = (foundPrevEx?.sets || []).filter((s) => s.completed !== false);

        if (completedSets.length > 0) {
          ex.previousPerformance = {
            lastDate: latestSession.date,
            workoutName: latestSession.workoutName || "Workout",
            sessionId: latestSession._id,
            sets: completedSets.map((s) => ({
              setNumber: s.setNumber,
              weight: s.weight || 0,
              reps: s.reps || 0,
            })),
            bestWeight: Math.max(0, ...completedSets.map((s) => s.weight || 0)),
            bestReps: Math.max(0, ...completedSets.map((s) => s.reps || 0)),
            totalVolumeKg: Math.round(completedSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0)),
          };

          ex.sets.forEach((set, idx) => {
            if (completedSets[idx]) {
              set.previousWeight = completedSets[idx].weight || 0;
              set.previousReps = completedSets[idx].reps || 0;
            } else if (pr) {
              set.previousWeight = pr.bestWeight || 0;
              set.previousReps = pr.bestReps || 0;
            }
          });
        } else if (pr) {
          ex.sets.forEach((set) => {
            set.previousWeight = pr.bestWeight || 0;
            set.previousReps = pr.bestReps || 0;
          });
        }
      } else if (pr) {
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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Session not found or unauthorized", 404);
  }

  const { exercises, durationSeconds, notes, workoutName } = req.body;

  if (exercises !== undefined && Array.isArray(exercises)) {
    const existingMap = new Map();
    (session.exercises || []).forEach((ex) => {
      existingMap.set(ex.name?.toLowerCase().trim(), ex);
      if (ex.exerciseId) existingMap.set(ex.exerciseId.toString(), ex);
    });

    session.exercises = exercises.map((newEx) => {
      const match =
        existingMap.get(newEx.exerciseId?.toString()) ||
        existingMap.get(newEx.name?.toLowerCase().trim());
      return {
        ...newEx,
        videoUrl: newEx.videoUrl || match?.videoUrl || "",
        videoUrlFemale: newEx.videoUrlFemale || match?.videoUrlFemale || "",
        gifUrl: newEx.gifUrl || match?.gifUrl || "",
        thumbnailUrl: newEx.thumbnailUrl || match?.thumbnailUrl || "",
        images: (newEx.images && newEx.images.length > 0) ? newEx.images : (match?.images || []),
        mediaType: newEx.mediaType || match?.mediaType || (newEx.videoUrl ? "video" : newEx.gifUrl ? "gif" : "text_only"),
        instructions: (newEx.instructions && newEx.instructions.length > 0) ? newEx.instructions : (match?.instructions || []),
        equipment: newEx.equipment || match?.equipment || "",
        category: newEx.category || match?.category || "",
        difficulty: newEx.difficulty || match?.difficulty || "",
      };
    });
  }

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

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
          const existingIdx = newPersonalRecords.findIndex((p) => p.exerciseName === ex.name.trim());
          const firstPr = {
            exerciseName: ex.name.trim(),
            metric: "First Record",
            bestWeight: weight,
            bestReps: reps,
            estimatedOneRepMax: estimated1RM,
          };
          if (existingIdx >= 0) {
            newPersonalRecords[existingIdx] = firstPr;
          } else {
            newPersonalRecords.push(firstPr);
          }
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

            const existingIdx = newPersonalRecords.findIndex((p) => p.exerciseName === ex.name.trim());
            const updatedPr = {
              exerciseName: ex.name.trim(),
              metric,
              bestWeight: weight,
              bestReps: reps,
              estimatedOneRepMax: estimated1RM,
            };
            if (existingIdx >= 0) {
              newPersonalRecords[existingIdx] = updatedPr;
            } else {
              newPersonalRecords.push(updatedPr);
            }
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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

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
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

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

// @desc Get workout history with date, search, muscle, and plan filters
// @route GET /api/workouts/sessions/history
const getWorkoutHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate, timeRange, search, muscle, planId, page = 1, limit = 20 } = req.query;

  const query = {
    userId: req.user._id,
    status: { $in: ["completed", "rest"] },
  };

  const todayStr = getLocalDateString(new Date(), req.user.timezone);

  if (timeRange === "week") {
    const { weekStart, weekEnd } = getISOWeekDetails(todayStr);
    query.date = { $gte: weekStart, $lte: weekEnd };
  } else if (timeRange === "month") {
    const monthStart = todayStr.slice(0, 7) + "-01";
    query.date = { $gte: monthStart, $lte: todayStr };
  } else if (startDate && endDate) {
    query.date = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    query.date = { $gte: startDate };
  } else if (endDate) {
    query.date = { $lte: endDate };
  }

  const andConditions = [];

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    andConditions.push({
      $or: [
        { workoutName: { $regex: escaped, $options: "i" } },
        { "exercises.name": { $regex: escaped, $options: "i" } },
        { notes: { $regex: escaped, $options: "i" } },
      ],
    });
  }

  if (muscle && muscle !== "All") {
    andConditions.push({
      $or: [
        { targetMuscles: muscle },
        { "exercises.primaryMuscle": muscle },
      ],
    });
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  if (planId && mongoose.Types.ObjectId.isValid(planId)) {
    query.workoutPlanId = planId;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await WorkoutSession.countDocuments(query);
  const sessions = await WorkoutSession.find(query)
    .populate("workoutPlanId", "name")
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

// @desc Get user's completed workout sessions for smart plan creation
// @route GET /api/workouts/sessions/completed-list
const getCompletedWorkoutSessions = asyncHandler(async (req, res) => {
  const sessions = await WorkoutSession.find({
    userId: req.user._id,
    status: "completed",
  })
    .sort({ date: -1, createdAt: -1 })
    .limit(50)
    .lean();

  const list = sessions.map((s) => ({
    _id: s._id,
    workoutName: s.workoutName || "Workout",
    date: s.date,
    durationMinutes: s.durationMinutes || 0,
    totalVolumeKg: s.totalVolumeKg || 0,
    totalReps: s.totalReps || 0,
    targetMuscles: s.targetMuscles || [],
    exerciseCount: (s.exercises || []).length,
    exercises: (s.exercises || []).map((e) => ({
      exerciseId: e.exerciseId || null,
      name: e.name,
      primaryMuscle: e.primaryMuscle || "",
      setsCount: (e.sets || []).length,
      bestWeight: Math.max(0, ...(e.sets || []).map((set) => set.weight || 0)),
      sampleReps: (e.sets || [])[0]?.reps || 10,
    })),
  }));

  return sendSuccess(res, { sessions: list, count: list.length });
});

// @desc Get single workout session detail
// @route GET /api/workouts/sessions/:id
const getWorkoutSessionById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

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

// @desc Edit and update a previously completed workout session
// @route PUT /api/workouts/sessions/:id
const updateCompletedWorkoutSession = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Workout session not found or unauthorized", 404);
  }

  const { workoutName, date, durationMinutes, notes, exercises } = req.body;

  if (workoutName !== undefined) session.workoutName = workoutName.trim() || session.workoutName;
  if (date !== undefined) session.date = date;
  if (notes !== undefined) session.notes = notes;
  if (durationMinutes !== undefined) {
    session.durationMinutes = Math.max(1, Number(durationMinutes) || 1);
    session.durationSeconds = session.durationMinutes * 60;
  }

  if (Array.isArray(exercises)) {
    // Sanitize exercises and recompute totals
    let totalVolumeKg = 0;
    let totalReps = 0;
    const trainedMusclesSet = new Set();

    const sanitizedExercises = exercises.map((ex) => {
      const exName = (ex.name || "").trim() || "Exercise";
      const primaryMuscle = ex.primaryMuscle || "Full Body";
      trainedMusclesSet.add(primaryMuscle);

      const sets = (ex.sets || []).map((s, idx) => {
        const weight = Number(s.weight) || 0;
        const reps = Number(s.reps) || 0;
        const completed = s.completed !== false;

        if (completed) {
          totalVolumeKg += weight * reps;
          totalReps += reps;
        }

        return {
          setNumber: idx + 1,
          weight,
          reps,
          completed,
          rpe: Number(s.rpe) || null,
          notes: s.notes || "",
          previousWeight: Number(s.previousWeight) || 0,
          previousReps: Number(s.previousReps) || 0,
          isPR: Boolean(s.isPR),
        };
      });

      return {
        exerciseId: ex.exerciseId && mongoose.Types.ObjectId.isValid(ex.exerciseId) ? ex.exerciseId : null,
        name: exName,
        primaryMuscle,
        notes: ex.notes || "",
        sets,
      };
    });

    session.exercises = sanitizedExercises;
    session.totalVolumeKg = Math.round(totalVolumeKg);
    session.totalReps = totalReps;
    session.targetMuscles = Array.from(trainedMusclesSet);
    session.caloriesBurned = calculateEstimatedCalories(
      session.durationMinutes,
      session.totalVolumeKg
    );
  }

  await session.save();

  // Recalculate streak in case date or session count changed
  await recalculateUserStreak(req.user._id).catch(() => {});

  return sendSuccess(res, { session }, "Workout session updated successfully");
});

// @desc Delete a completed workout session with data consistency checks
// @route DELETE /api/workouts/sessions/:id
const deleteCompletedWorkoutSession = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

  const session = await WorkoutSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) {
    return sendError(res, "Workout session not found or unauthorized", 404);
  }

  // Safe deletion: remove session
  await WorkoutSession.findByIdAndDelete(session._id);

  // Clean up any PersonalRecord entries whose peak or history was registered by this session
  const prs = await PersonalRecord.find({
    userId: req.user._id,
    $or: [{ sessionId: session._id }, { "history.sessionId": session._id }],
  });

  for (const pr of prs) {
    pr.history = pr.history.filter(
      (h) => h.sessionId && h.sessionId.toString() !== session._id.toString()
    );

    if (pr.history.length > 0) {
      pr.bestWeight = Math.max(...pr.history.map((h) => h.weight || 0));
      pr.bestReps = Math.max(...pr.history.map((h) => h.reps || 0));
      pr.bestVolume = Math.max(...pr.history.map((h) => h.volume || 0));
      pr.estimatedOneRepMax = Math.max(...pr.history.map((h) => h.estimated1RM || 0));
      const latestHist = pr.history[pr.history.length - 1];
      pr.achievedAt = latestHist.achievedAt || new Date();
      pr.sessionId = latestHist.sessionId || null;
      await pr.save();
    } else {
      await PersonalRecord.findByIdAndDelete(pr._id);
    }
  }

  // Clean up any FeedEvent created for this session
  await FeedEvent.deleteMany({
    userId: req.user._id,
    "meta.sessionId": session._id,
  }).catch(() => {});

  // Recalculate streak
  await recalculateUserStreak(req.user._id).catch(() => {});

  return sendSuccess(res, null, "Workout session deleted successfully");
});

// @desc Backward-compatible PATCH /api/workouts/sessions/:id
const updateWorkoutSession = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return sendError(res, "Invalid session ID format", 400);
  }

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
  getExerciseFilters,
  toggleFavoriteExercise,
  createCustomExercise,
  getExercisePreviousPerformance,
  getExerciseHistory,
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
  getCompletedWorkoutSessions,
  getWorkoutSessionById,
  updateCompletedWorkoutSession,
  deleteCompletedWorkoutSession,
  getWorkoutAnalytics,
  getMuscleMapData,
  getPersonalRecords,
  // Legacy
  saveWorkoutSession,
  updateWorkoutSession,
  markAttendance,
};
