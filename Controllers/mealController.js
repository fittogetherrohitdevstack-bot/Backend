const crypto = require("crypto");
const MealLog = require("../Modals/MealLog");
const DietPlan = require("../Modals/DietPlan");
const DietTemplate = require("../Modals/DietTemplate");
const WaterLog = require("../Modals/WaterLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const FitnessProfile = require("../Modals/FitnessProfile");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  getLocalDateString,
  getDayOfWeek,
  getRecentDays,
  getISOWeekDetails,
  getCalendarMonth,
} = require("../Utils/date");
const { sumFoodItems } = require("../Utils/nutrition");
const {
  calculateMealPoints,
  syncDailyHabitPoints,
} = require("../Utils/gamification");
const {
  resolvePlanMealsForDate,
  buildMealSnapshotFromPlan,
} = require("../Utils/dietSchedule");

/**
 * Keeps squad meal points (`PointsLedger`) and real-time socket feed synced
 * whenever meals or food items are logged, ticked, or updated.
 */
const syncMealGamificationAndNotify = async ({
  userId,
  userName,
  dateStr,
  timezone,
  mealLog,
  mealName = "Today's meals",
  status = "updated",
  notifyFeed = true,
}) => {
  if (!mealLog) return;
  const meals = mealLog.meals || [];
  const totalMeals = meals.length;
  const eatenMeals = meals.filter((m) => m.status === "eaten").length;
  const mealPoints = calculateMealPoints(eatenMeals, totalMeals);

  const isTodayDate = dateStr === getLocalDateString(new Date(), timezone);
  const eventName = isTodayDate ? (notifyFeed ? "meal-logged" : "squad-sync") : null;

  await syncDailyHabitPoints({
    userId,
    date: dateStr,
    type: "meals",
    points: mealPoints,
    meta: { eatenMeals, totalMeals },
    eventName,
    eventPayload: isTodayDate
      ? {
          userId,
          userName,
          mealName,
          status,
        }
      : null,
  });
};

/**
 * Helper to calculate planned vs consumed totals and derived statuses
 */
const calculateChartTotals = (meals = []) => {
  let plannedCalories = 0;
  let plannedProtein = 0;
  let plannedCarbs = 0;
  let plannedFats = 0;

  let consumedCalories = 0;
  let consumedProtein = 0;
  let consumedCarbs = 0;
  let consumedFats = 0;

  let totalItems = 0;
  let itemsCompleted = 0;
  let totalMeals = meals.length;
  let mealsCompleted = 0;
  let mealsSkipped = 0;

  for (const meal of meals) {
    const items = meal.plannedFoodItems || [];
    let mealAllEaten = items.length > 0;
    let mealSomeEaten = false;

    for (const item of items) {
      totalItems++;
      const qty = item.quantity || 1;
      const cal = item.calories || 0;
      const prot = item.protein || 0;
      const carb = item.carbs || 0;
      const fat = item.fats || 0;

      plannedCalories += cal;
      plannedProtein += prot;
      plannedCarbs += carb;
      plannedFats += fat;

      if (item.eaten) {
        itemsCompleted++;
        mealSomeEaten = true;
        const multiplier =
          item.actualQuantity !== undefined &&
          item.actualQuantity !== null &&
          item.actualQuantity > 0
            ? item.actualQuantity / qty
            : 1;

        consumedCalories += Math.round(cal * multiplier);
        consumedProtein += Math.round(prot * multiplier * 10) / 10;
        consumedCarbs += Math.round(carb * multiplier * 10) / 10;
        consumedFats += Math.round(fat * multiplier * 10) / 10;
      } else {
        mealAllEaten = false;
      }
    }

    // Derive meal status unless explicitly marked skipped
    if (meal.status === "skipped") {
      mealsSkipped++;
    } else {
      if (items.length > 0 && mealAllEaten) {
        meal.status = "eaten";
        mealsCompleted++;
      } else if (mealSomeEaten) {
        meal.status = "partial";
      } else {
        meal.status = "pending";
      }
    }
  }

  const completionPercentage =
    totalItems > 0 ? Math.round((itemsCompleted / totalItems) * 100) : 0;

  return {
    plannedTotals: {
      calories: Math.round(plannedCalories),
      protein: Math.round(plannedProtein * 10) / 10,
      carbs: Math.round(plannedCarbs * 10) / 10,
      fats: Math.round(plannedFats * 10) / 10,
    },
    consumedTotals: {
      calories: Math.round(consumedCalories),
      protein: Math.round(consumedProtein * 10) / 10,
      carbs: Math.round(consumedCarbs * 10) / 10,
      fats: Math.round(consumedFats * 10) / 10,
    },
    itemsCompleted,
    totalItems,
    mealsCompleted,
    mealsSkipped,
    totalMeals,
    completionPercentage,
  };
};

/**
 * @desc Get day's diet chart + ticks + planned vs consumed totals
 * @route GET /api/meals/day?date=YYYY-MM-DD
 * @access Private
 */
const getDayChart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const dateStr = req.query.date || req.body?.date || getLocalDateString(new Date(), timezone);

  // 1. Check if user already has a MealLog for this date
  let mealLog = await MealLog.findOne({ userId, date: dateStr });

  const activePlan = await DietPlan.findOne({
    userId,
    isActive: true,
    startDate: { $lte: dateStr },
    endDate: { $gte: dateStr },
  });
  const planResolved = activePlan ? resolvePlanMealsForDate(activePlan, dateStr) : null;

  if (!mealLog && activePlan && planResolved) {
    // 2. Auto-generate checklist snapshot from active DietPlan
    const planMeals = planResolved.meals || [];

    if (planMeals.length > 0) {
      mealLog = await MealLog.create({
        userId,
        groupId: activePlan.groupId,
        dietPlanId: activePlan._id,
        date: dateStr,
        meals: buildMealSnapshotFromPlan(planMeals),
      });
    }
  }

  // 3. If still no meal log, check if user has a default DietTemplate
  if (!mealLog) {
    const defaultTemplate = await DietTemplate.findOne({ userId, isDefault: true });
    if (defaultTemplate && defaultTemplate.meals && defaultTemplate.meals.length > 0) {
      const snapshotMeals = defaultTemplate.meals.map((m) => ({
        mealId: m.mealId || crypto.randomUUID(),
        mealName: m.mealName,
        scheduledTime: m.scheduledTime || "08:00",
        plannedFoodItems: (m.plannedFoodItems || []).map((f) => ({
          itemId: crypto.randomUUID(),
          name: f.name,
          quantity: f.quantity,
          unit: f.unit || "g",
          calories: f.calories || 0,
          protein: f.protein || 0,
          carbs: f.carbs || 0,
          fats: f.fats || 0,
          eaten: false,
        })),
        status: "pending",
        actualFoodItems: [],
      }));

      mealLog = await MealLog.create({
        userId,
        date: dateStr,
        meals: snapshotMeals,
      });
    }
  }

  if (!mealLog) {
    return sendSuccess(res, {
      mealLog: null,
      planVariant: planResolved
        ? {
            mode: planResolved.mode,
            variantKey: planResolved.variantKey,
            variantLabel: planResolved.variantLabel,
          }
        : null,
      plannedTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      consumedTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      itemsCompleted: 0,
      totalItems: 0,
      mealsCompleted: 0,
      mealsSkipped: 0,
      totalMeals: 0,
      completionPercentage: 0,
    });
  }

  const totals = calculateChartTotals(mealLog.meals);

  return sendSuccess(res, {
    mealLog,
    planVariant: planResolved
      ? {
          mode: planResolved.mode,
          variantKey: planResolved.variantKey,
          variantLabel: planResolved.variantLabel,
        }
      : null,
    ...totals,
  });
});

/**
 * @desc Create or replace the user's diet chart for a specific date
 * @route PUT /api/meals/day?date=YYYY-MM-DD
 * @access Private
 */
const saveDayChart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const dateStr = req.query.date || req.body.date || getLocalDateString(new Date(), timezone);
  const { meals = [] } = req.body;

  // Retrieve existing log to preserve ticks if item IDs match
  const existing = await MealLog.findOne({ userId, date: dateStr });
  const existingItemsMap = new Map();
  if (existing) {
    existing.meals.forEach((m) => {
      (m.plannedFoodItems || []).forEach((it) => {
        if (it.itemId) existingItemsMap.set(it.itemId, it);
        existingItemsMap.set(`${m.mealName}_${it.name}`, it);
      });
    });
  }

  // Format and assign IDs to meals and food items
  const formattedMeals = meals.map((m) => {
    const mealId = m.mealId || crypto.randomUUID();
    const plannedFoodItems = (m.plannedFoodItems || m.foodItems || []).map((f) => {
      const itemId = f.itemId || crypto.randomUUID();
      const existingMatch =
        existingItemsMap.get(itemId) || existingItemsMap.get(`${m.mealName || m.name}_${f.name}`);

      return {
        itemId,
        name: f.name,
        quantity: Number(f.quantity) || 100,
        unit: f.unit || "g",
        calories: Number(f.calories) || 0,
        protein: Number(f.protein) || 0,
        carbs: Number(f.carbs) || 0,
        fats: Number(f.fats) || 0,
        eaten: f.eaten !== undefined ? Boolean(f.eaten) : Boolean(existingMatch?.eaten),
        eatenAt: f.eatenAt || existingMatch?.eatenAt || null,
        actualQuantity:
          f.actualQuantity !== undefined ? Number(f.actualQuantity) : existingMatch?.actualQuantity,
        isUnplanned: Boolean(f.isUnplanned),
      };
    });

    return {
      mealId,
      mealName: m.mealName || m.name || "Meal",
      scheduledTime: m.scheduledTime || "08:00",
      plannedFoodItems,
      status: m.status || "pending",
      skipReason: m.skipReason || "",
    };
  });

  const totals = calculateChartTotals(formattedMeals);

  const mealLog = await MealLog.findOneAndUpdate(
    { userId, date: dateStr },
    {
      $set: {
        userId,
        date: dateStr,
        meals: formattedMeals,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  await syncMealGamificationAndNotify({
    userId,
    userName: req.user.name,
    dateStr,
    timezone,
    mealLog,
    notifyFeed: false,
  });

  return sendSuccess(res, {
    mealLog,
    ...totals,
  }, "Diet chart updated successfully");
});

/**
 * @desc Atomic tick/untick of an individual item
 * @route PATCH /api/meals/day/items
 * @access Private
 */
const updateChartItem = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const { date, mealId, itemId, eaten, actualQuantity } = req.body;

  const dateStr = date || getLocalDateString(new Date(), timezone);
  if (!mealId || !itemId) {
    return sendError(res, "mealId and itemId are required", 400);
  }

  const mealLog = await MealLog.findOne({ userId, date: dateStr });
  if (!mealLog) {
    return sendError(res, "Meal log not found for this date", 404);
  }

  const meal = mealLog.meals.find((m) => m.mealId === mealId || m._id.toString() === mealId);
  if (!meal) {
    return sendError(res, "Meal not found", 404);
  }

  const item = meal.plannedFoodItems.find(
    (it) => it.itemId === itemId || (it._id && it._id.toString() === itemId)
  );
  if (!item) {
    return sendError(res, "Food item not found in this meal", 404);
  }

  const willBeEaten = Boolean(eaten);
  item.eaten = willBeEaten;
  item.eatenAt = willBeEaten ? new Date() : null;

  if (actualQuantity !== undefined && actualQuantity !== null) {
    item.actualQuantity = Number(actualQuantity);
  }

  // Recalculate derived statuses and totals
  const totals = calculateChartTotals(mealLog.meals);
  await mealLog.save();

  await syncMealGamificationAndNotify({
    userId,
    userName: req.user.name,
    dateStr,
    timezone,
    mealLog,
    mealName: `${item.name} (${meal.mealName})`,
    status: willBeEaten ? "eaten" : "pending",
    notifyFeed: willBeEaten,
  });

  return sendSuccess(res, {
    mealLog,
    ...totals,
  }, willBeEaten ? "Item marked as eaten ✓" : "Item unticked");
});

/**
 * @desc Tick/untick a whole meal or mark skipped
 * @route PATCH /api/meals/day/meals
 * @access Private
 */
const updateChartMeal = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const { date, mealId, status, skipReason } = req.body;

  const dateStr = date || getLocalDateString(new Date(), timezone);
  if (!mealId || !status) {
    return sendError(res, "mealId and status are required", 400);
  }

  const mealLog = await MealLog.findOne({ userId, date: dateStr });
  if (!mealLog) {
    return sendError(res, "Meal log not found for this date", 404);
  }

  const meal = mealLog.meals.find((m) => m.mealId === mealId || m._id.toString() === mealId);
  if (!meal) {
    return sendError(res, "Meal not found", 404);
  }

  if (status === "eaten") {
    meal.status = "eaten";
    meal.completedAt = new Date();
    meal.skipReason = "";
    (meal.plannedFoodItems || []).forEach((it) => {
      it.eaten = true;
      if (!it.eatenAt) it.eatenAt = new Date();
    });
  } else if (status === "skipped") {
    meal.status = "skipped";
    meal.skipReason = skipReason || "Skipped";
    meal.completedAt = null;
    (meal.plannedFoodItems || []).forEach((it) => {
      it.eaten = false;
      it.eatenAt = null;
    });
  } else {
    // pending / undo
    meal.status = "pending";
    meal.completedAt = null;
    meal.skipReason = "";
    (meal.plannedFoodItems || []).forEach((it) => {
      it.eaten = false;
      it.eatenAt = null;
    });
  }

  const totals = calculateChartTotals(mealLog.meals);
  await mealLog.save();

  await syncMealGamificationAndNotify({
    userId,
    userName: req.user.name,
    dateStr,
    timezone,
    mealLog,
    mealName: meal.mealName,
    status,
    notifyFeed: status === "eaten",
  });

  return sendSuccess(res, {
    mealLog,
    ...totals,
  }, `Meal updated to ${status}`);
});

/**
 * @desc Add an unplanned item to a meal
 * @route POST /api/meals/day/items
 * @access Private
 */
const addUnplannedItem = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const { date, mealId, item } = req.body;

  const dateStr = date || getLocalDateString(new Date(), timezone);
  if (!mealId || !item || !item.name) {
    return sendError(res, "mealId and valid food item are required", 400);
  }

  const mealLog = await MealLog.findOne({ userId, date: dateStr });
  if (!mealLog) {
    return sendError(res, "Meal log not found for this date", 404);
  }

  const meal = mealLog.meals.find((m) => m.mealId === mealId || m._id.toString() === mealId);
  if (!meal) {
    return sendError(res, "Meal not found", 404);
  }

  const newItem = {
    itemId: crypto.randomUUID(),
    name: item.name,
    quantity: Number(item.quantity) || 100,
    unit: item.unit || "g",
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbs: Number(item.carbs) || 0,
    fats: Number(item.fats) || 0,
    eaten: item.eaten !== undefined ? Boolean(item.eaten) : true,
    eatenAt: item.eaten !== false ? new Date() : null,
    actualQuantity: item.actualQuantity !== undefined ? Number(item.actualQuantity) : Number(item.quantity) || 100,
    isUnplanned: true,
  };

  meal.plannedFoodItems.push(newItem);
  const totals = calculateChartTotals(mealLog.meals);
  await mealLog.save();

  await syncMealGamificationAndNotify({
    userId,
    userName: req.user.name,
    dateStr,
    timezone,
    mealLog,
    mealName: `${newItem.name} (${meal.mealName})`,
    status: newItem.eaten ? "eaten" : "pending",
    notifyFeed: newItem.eaten,
  });

  return sendSuccess(res, {
    mealLog,
    ...totals,
  }, "Unplanned food item added");
});

/**
 * @desc Copy a day's diet chart or template to one or more dates
 * @route POST /api/meals/day/copy
 * @access Private
 */
const copyDayChart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { sourceDate, sourceTemplateId, targetDates } = req.body;

  if (!targetDates || !Array.isArray(targetDates) || targetDates.length === 0) {
    return sendError(res, "targetDates must be a non-empty array of YYYY-MM-DD dates", 400);
  }

  let templateMeals = [];

  if (sourceDate) {
    const sourceLog = await MealLog.findOne({ userId, date: sourceDate });
    if (!sourceLog || !sourceLog.meals || sourceLog.meals.length === 0) {
      return sendError(res, `No meals found on source date ${sourceDate}`, 404);
    }
    templateMeals = sourceLog.meals.map((m) => ({
      mealId: crypto.randomUUID(),
      mealName: m.mealName,
      scheduledTime: m.scheduledTime || "08:00",
      plannedFoodItems: (m.plannedFoodItems || []).map((it) => ({
        itemId: crypto.randomUUID(),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit || "g",
        calories: it.calories || 0,
        protein: it.protein || 0,
        carbs: it.carbs || 0,
        fats: it.fats || 0,
        eaten: false,
      })),
      status: "pending",
      actualFoodItems: [],
    }));
  } else if (sourceTemplateId) {
    const template = await DietTemplate.findOne({ userId, _id: sourceTemplateId });
    if (!template || !template.meals || template.meals.length === 0) {
      return sendError(res, "Diet template not found or has no meals", 404);
    }
    templateMeals = template.meals.map((m) => ({
      mealId: crypto.randomUUID(),
      mealName: m.mealName,
      scheduledTime: m.scheduledTime || "08:00",
      plannedFoodItems: (m.plannedFoodItems || []).map((it) => ({
        itemId: crypto.randomUUID(),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit || "g",
        calories: it.calories || 0,
        protein: it.protein || 0,
        carbs: it.carbs || 0,
        fats: it.fats || 0,
        eaten: false,
      })),
      status: "pending",
      actualFoodItems: [],
    }));
  } else {
    return sendError(res, "Either sourceDate or sourceTemplateId must be provided", 400);
  }

  // Upsert for each target date
  for (const date of targetDates) {
    // Clone meals with fresh IDs so each date has independent entries
    const clonedMeals = templateMeals.map((m) => ({
      mealId: crypto.randomUUID(),
      mealName: m.mealName,
      scheduledTime: m.scheduledTime,
      plannedFoodItems: (m.plannedFoodItems || []).map((it) => ({
        itemId: crypto.randomUUID(),
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        calories: it.calories,
        protein: it.protein,
        carbs: it.carbs,
        fats: it.fats,
        eaten: false,
      })),
      status: "pending",
      actualFoodItems: [],
    }));

    await MealLog.findOneAndUpdate(
      { userId, date },
      {
        $set: {
          userId,
          date,
          meals: clonedMeals,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }

  return sendSuccess(
    res,
    { targetDatesCount: targetDates.length },
    `Copied diet chart to ${targetDates.length} date(s) successfully`
  );
});

/**
 * @desc Get comprehensive diet summary & averages analytics
 * @route GET /api/meals/summary?range=7d|30d|90d
 * @access Private
 */
const getMealsSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const { range = "7d" } = req.query;

  const numDays = range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const days = getRecentDays(numDays, timezone);

  const profile = await FitnessProfile.findOne({ userId }).lean();
  const profileTargets = profile?.targets || {
    calories: 2200,
    protein: 140,
    carbs: 250,
    fats: 60,
  };

  const logs = await MealLog.find({
    userId,
    date: { $in: days },
  }).lean();

  const logMap = new Map();
  logs.forEach((l) => logMap.set(l.date, l));

  const dailyDetails = [];
  let totalLoggedDays = 0;
  let totalConsumedCalories = 0;
  let totalConsumedProtein = 0;
  let totalConsumedCarbs = 0;
  let totalConsumedFats = 0;
  let totalCompletion = 0;

  for (const date of days) {
    const log = logMap.get(date);
    if (!log || !log.meals || log.meals.length === 0) {
      dailyDetails.push({
        date,
        logged: false,
        plannedTotals: null,
        consumedTotals: null,
        completionPercentage: 0,
        mealsSkipped: 0,
      });
    } else {
      totalLoggedDays++;
      const totals = calculateChartTotals(log.meals);
      totalConsumedCalories += totals.consumedTotals.calories;
      totalConsumedProtein += totals.consumedTotals.protein;
      totalConsumedCarbs += totals.consumedTotals.carbs;
      totalConsumedFats += totals.consumedTotals.fats;
      totalCompletion += totals.completionPercentage;

      dailyDetails.push({
        date,
        logged: true,
        plannedTotals: totals.plannedTotals,
        consumedTotals: totals.consumedTotals,
        completionPercentage: totals.completionPercentage,
        mealsSkipped: totals.mealsSkipped,
        totalItems: totals.totalItems,
        itemsCompleted: totals.itemsCompleted,
      });
    }
  }

  // Weekly ISO averages
  const weekMap = {};
  for (const dayData of dailyDetails) {
    if (!dayData.logged) continue;
    const { weekStart, weekEnd } = getISOWeekDetails(dayData.date);
    const key = `${weekStart}_${weekEnd}`;
    if (!weekMap[key]) {
      weekMap[key] = {
        weekStart,
        weekEnd,
        daysLogged: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        completion: 0,
      };
    }
    weekMap[key].daysLogged++;
    weekMap[key].calories += dayData.consumedTotals.calories;
    weekMap[key].protein += dayData.consumedTotals.protein;
    weekMap[key].carbs += dayData.consumedTotals.carbs;
    weekMap[key].fats += dayData.consumedTotals.fats;
    weekMap[key].completion += dayData.completionPercentage;
  }

  const weeklyAverages = Object.values(weekMap).map((w) => ({
    weekStart: w.weekStart,
    weekEnd: w.weekEnd,
    daysLogged: w.daysLogged,
    averageCalories: Math.round(w.calories / w.daysLogged),
    averageProtein: Math.round((w.protein / w.daysLogged) * 10) / 10,
    averageCarbs: Math.round((w.carbs / w.daysLogged) * 10) / 10,
    averageFats: Math.round((w.fats / w.daysLogged) * 10) / 10,
    averageCompletion: Math.round(w.completion / w.daysLogged),
  }));

  // Monthly averages
  const monthMap = {};
  for (const dayData of dailyDetails) {
    if (!dayData.logged) continue;
    const month = getCalendarMonth(dayData.date);
    if (!monthMap[month]) {
      monthMap[month] = {
        month,
        daysLogged: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        completion: 0,
      };
    }
    monthMap[month].daysLogged++;
    monthMap[month].calories += dayData.consumedTotals.calories;
    monthMap[month].protein += dayData.consumedTotals.protein;
    monthMap[month].carbs += dayData.consumedTotals.carbs;
    monthMap[month].fats += dayData.consumedTotals.fats;
    monthMap[month].completion += dayData.completionPercentage;
  }

  const monthlyAverages = Object.values(monthMap).map((m) => ({
    month: m.month,
    daysLogged: m.daysLogged,
    averageCalories: Math.round(m.calories / m.daysLogged),
    averageProtein: Math.round((m.protein / m.daysLogged) * 10) / 10,
    averageCarbs: Math.round((m.carbs / m.daysLogged) * 10) / 10,
    averageFats: Math.round((m.fats / m.daysLogged) * 10) / 10,
    averageCompletion: Math.round(m.completion / m.daysLogged),
  }));

  // Calculate streak of >= 80% completion days
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  for (const dayData of dailyDetails) {
    if (dayData.logged && dayData.completionPercentage >= 80) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Current streak (counting backwards; if today is still in progress, preserve active streak from yesterday)
  const todayStr = getLocalDateString(new Date(), timezone);
  let startIdx = dailyDetails.length - 1;
  if (
    startIdx >= 0 &&
    dailyDetails[startIdx].date === todayStr &&
    !(dailyDetails[startIdx].logged && dailyDetails[startIdx].completionPercentage >= 80)
  ) {
    startIdx -= 1;
  }

  for (let i = startIdx; i >= 0; i--) {
    const day = dailyDetails[i];
    if (day.logged && day.completionPercentage >= 80) {
      currentStreak++;
    } else {
      break;
    }
  }

  return sendSuccess(res, {
    dailyDetails,
    weeklyAverages,
    monthlyAverages,
    summary: {
      totalLoggedDays,
      daysInRange: numDays,
      averageCalories: totalLoggedDays > 0 ? Math.round(totalConsumedCalories / totalLoggedDays) : 0,
      averageProtein: totalLoggedDays > 0 ? Math.round((totalConsumedProtein / totalLoggedDays) * 10) / 10 : 0,
      averageCarbs: totalLoggedDays > 0 ? Math.round((totalConsumedCarbs / totalLoggedDays) * 10) / 10 : 0,
      averageFats: totalLoggedDays > 0 ? Math.round((totalConsumedFats / totalLoggedDays) * 10) / 10 : 0,
      averageCompletion: totalLoggedDays > 0 ? Math.round(totalCompletion / totalLoggedDays) : 0,
      currentStreak,
      bestStreak,
    },
    profileTargets,
  });
});

/**
 * Backward compatibility functions
 */
const getOrCreateDailyMealLog = getDayChart;

const updateMealStatus = asyncHandler(async (req, res) => {
  const { mealId, status, actualFoodItems, skipReason } = req.body;
  const timezone = req.user.timezone || "Asia/Kolkata";
  const dateStr = getLocalDateString(new Date(), timezone);

  return updateChartMeal({
    ...req,
    body: { date: dateStr, mealId, status, skipReason },
  }, res);
});

const getMealHistory = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const query = { userId: req.user._id };

  if (startDate && endDate) {
    query.date = { $gte: startDate, $lte: endDate };
  }

  const logs = await MealLog.find(query).sort({ date: -1 }).limit(30);
  return sendSuccess(res, { logs });
});

const runLeanQuery = async (query) =>
  query && typeof query.lean === "function" ? query.lean() : query;

/**
 * Computes consecutive active fitness days across meals, workouts, and hydration.
 * If today is still in progress with no qualifying activity yet, preserves an ongoing
 * streak ending yesterday so morning check-ins never flash 0.
 */
const computeActiveHabitStreak = async ({
  userId,
  timezone = "Asia/Kolkata",
  todayStr,
  waterTargetMl = 3000,
  lookbackDays = 60,
}) => {
  const recentDates = getRecentDays(lookbackDays, timezone);
  if (!recentDates.length) {
    return { currentStreak: 0, bestStreak: 0, todayActive: false };
  }

  const endDate = todayStr || recentDates[recentDates.length - 1];
  const dates = recentDates[recentDates.length - 1] === endDate
    ? recentDates
    : [...recentDates.filter((d) => d < endDate), endDate];

  const startDate = dates[0];
  const dateFilter = { userId, date: { $gte: startDate, $lte: endDate } };

  const [mealLogs = [], workoutLogs = [], waterLogs = []] = await Promise.all([
    runLeanQuery(MealLog.find(dateFilter)),
    runLeanQuery(WorkoutSession.find(dateFilter)),
    runLeanQuery(WaterLog.find(dateFilter)),
  ]);

  const mealByDate = new Map((mealLogs || []).map((m) => [m.date, m]));
  const workoutByDate = new Map((workoutLogs || []).map((w) => [w.date, w]));
  const waterByDate = new Map((waterLogs || []).map((w) => [w.date, w]));

  const isDateActive = (dateStr) => {
    const mealLog = mealByDate.get(dateStr);
    if (mealLog && Array.isArray(mealLog.meals) && mealLog.meals.length > 0) {
      const mealTotals = calculateChartTotals(mealLog.meals);
      if (
        mealTotals.itemsCompleted > 0 ||
        mealTotals.mealsCompleted > 0 ||
        mealTotals.completionPercentage >= 50 ||
        mealTotals.consumedTotals.calories > 0
      ) {
        return true;
      }
    }

    const workout = workoutByDate.get(dateStr);
    if (workout && (workout.status === "completed" || workout.status === "rest")) {
      return true;
    }

    const water = waterByDate.get(dateStr);
    if (water && Array.isArray(water.entries)) {
      const consumedMl = water.entries.reduce((sum, e) => sum + (Number(e.amountMl) || 0), 0);
      const dayWaterTarget = waterTargetMl || water.targetMl || 3000;
      if (dayWaterTarget > 0 && consumedMl >= dayWaterTarget * 0.75) {
        return true;
      }
    }

    return false;
  };

  const activeFlags = dates.map((d) => isDateActive(d));

  let bestStreak = 0;
  let running = 0;
  for (const active of activeFlags) {
    if (active) {
      running++;
      if (running > bestStreak) bestStreak = running;
    } else {
      running = 0;
    }
  }

  const lastIdx = activeFlags.length - 1;
  const todayActive = Boolean(activeFlags[lastIdx]);
  let checkIdx = todayActive ? lastIdx : lastIdx - 1;
  let currentStreak = 0;

  while (checkIdx >= 0 && activeFlags[checkIdx]) {
    currentStreak++;
    checkIdx--;
  }

  return { currentStreak, bestStreak, todayActive };
};

const getMyDashboardSummary = asyncHandler(async (req, res) => {
  const timezone = req.user.timezone || "Asia/Kolkata";
  const todayStr = getLocalDateString(new Date(), timezone);

  const profile = await FitnessProfile.findOne({ userId: req.user._id });
  const targets = profile?.targets || {
    calories: 2200,
    protein: 140,
    carbs: 250,
    fats: 60,
    waterMl: 3000,
  };

  const todayMealLog = await MealLog.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  let totals = {
    plannedTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    consumedTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    itemsCompleted: 0,
    totalItems: 0,
    mealsCompleted: 0,
    totalMeals: 0,
    completionPercentage: 0,
  };

  if (todayMealLog && todayMealLog.meals) {
    totals = calculateChartTotals(todayMealLog.meals);
  }

  const waterLog = await WaterLog.findOne({
    userId: req.user._id,
    date: todayStr,
  });
  const waterConsumedMl = (waterLog?.entries || []).reduce((sum, e) => sum + e.amountMl, 0);
  const waterTargetMl = targets.waterMl || waterLog?.targetMl || 3000;
  const waterPercent = waterTargetMl > 0
    ? Math.min(100, Math.round((waterConsumedMl / waterTargetMl) * 100))
    : 0;

  const workoutSession = await WorkoutSession.findOne({
    userId: req.user._id,
    date: todayStr,
  });

  const streakStats = await computeActiveHabitStreak({
    userId: req.user._id,
    timezone,
    todayStr,
    waterTargetMl,
  });

  return sendSuccess(res, {
    date: todayStr,
    profile,
    nutrition: {
      targets,
      actual: totals.consumedTotals,
      planned: totals.plannedTotals,
      totalMeals: totals.totalMeals,
      eatenMeals: totals.mealsCompleted,
      mealCompletionPercent: totals.completionPercentage,
      itemsCompleted: totals.itemsCompleted,
      totalItems: totals.totalItems,
    },
    water: {
      consumedMl: waterConsumedMl,
      targetMl: waterTargetMl,
      percent: waterPercent,
    },
    workout: workoutSession
      ? {
          status: workoutSession.status,
          workoutName: workoutSession.workoutName,
          durationMinutes: workoutSession.durationMinutes,
        }
      : null,
    streak: streakStats.currentStreak,
    streakDetails: streakStats,
  });
});

module.exports = {
  calculateChartTotals,
  getDayChart,
  saveDayChart,
  updateChartItem,
  updateChartMeal,
  addUnplannedItem,
  copyDayChart,
  getMealsSummary,
  getOrCreateDailyMealLog,
  updateMealStatus,
  getMealHistory,
  getMyDashboardSummary,
};
