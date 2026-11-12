const WorkoutPlan = require("../Modals/WorkoutPlan");
const WorkoutSession = require("../Modals/WorkoutSession");
const PersonalRecord = require("../Modals/PersonalRecord");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString, getDayOfWeek } = require("../Utils/date");
const { POINTS_RULES, syncDailyHabitPoints } = require("../Utils/gamification");
const { recalculateUserStreak } = require("../Utils/streakService");

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
    meta: { status: session.status, workoutName: session.workoutName },
    eventName,
    eventPayload: isTodayDate
      ? {
          userId: user._id,
          userName: user.name,
          workoutName: session.workoutName,
          status: session.status,
        }
      : null,
  });

  await recalculateUserStreak(user._id).catch(() => {});
};

// @desc Create workout plan
// @route POST /api/workouts
const createWorkoutPlan = asyncHandler(async (req, res) => {
  const { name, schedule, groupId, isActive } = req.body;

  if (isActive !== false) {
    await WorkoutPlan.updateMany(
      { userId: req.user._id, isActive: true },
      { $set: { isActive: false } }
    );
  }

  const workoutPlan = await WorkoutPlan.create({
    userId: req.user._id,
    groupId: groupId || null,
    name: name || "Weekly Workout Split",
    schedule: schedule || [],
    isActive: isActive !== false,
  });

  return sendSuccess(res, { workoutPlan }, "Workout plan created successfully", 201);
});

// @desc Get user's workout plans
// @route GET /api/workouts/my-plans
const getMyWorkoutPlans = asyncHandler(async (req, res) => {
  const plans = await WorkoutPlan.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return sendSuccess(res, { plans });
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

  const { name, schedule, isActive, groupId } = req.body;
  if (name) plan.name = name;
  if (schedule) plan.schedule = schedule;
  if (groupId !== undefined) plan.groupId = groupId;
  if (isActive !== undefined) plan.isActive = isActive;

  await plan.save();
  return sendSuccess(res, { plan }, "Workout plan updated");
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

// @desc Get today's workout based on plan & existing session
// @route GET /api/workouts/today
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

// @desc Save/complete a workout session
// @route POST /api/workouts/sessions
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
    if (durationMinutes !== undefined) session.durationMinutes = durationMinutes;
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
      notes: notes || "",
    });
  }

  // Update Personal Records (PRs)
  if (exercises && Array.isArray(exercises)) {
    for (const ex of exercises) {
      if (!ex.name || !ex.sets) continue;
      for (const set of ex.sets) {
        if (!set.completed) continue;
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        const volume = weight * reps;

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
          if (updated) {
            pr.achievedAt = new Date();
            pr.sessionId = session._id;
            await pr.save();
          }
        }
      }
    }
  }

  // Award points and broadcast live squad update across all active squads
  await syncWorkoutPointsAndNotify(req.user, sessionDate, session);

  return sendSuccess(res, { session }, "Workout session saved successfully");
});

// @desc Update workout session
// @route PATCH /api/workouts/sessions/:id
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
  if (durationMinutes !== undefined) session.durationMinutes = durationMinutes;
  if (notes !== undefined) session.notes = notes;

  await session.save();
  return sendSuccess(res, { session }, "Workout session updated");
});

// @desc Get workout history
// @route GET /api/workouts/sessions/history
const getWorkoutHistory = asyncHandler(async (req, res) => {
  const sessions = await WorkoutSession.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(30);
  return sendSuccess(res, { sessions });
});

// @desc Get personal records
// @route GET /api/workouts/records
const getPersonalRecords = asyncHandler(async (req, res) => {
  const records = await PersonalRecord.find({ userId: req.user._id }).sort({ exerciseName: 1 });
  return sendSuccess(res, { records });
});

// @desc Quick mark gym attendance or rest day
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

module.exports = {
  createWorkoutPlan,
  getMyWorkoutPlans,
  updateWorkoutPlan,
  deleteWorkoutPlan,
  getTodayWorkout,
  saveWorkoutSession,
  updateWorkoutSession,
  getWorkoutHistory,
  getPersonalRecords,
  markAttendance,
};
