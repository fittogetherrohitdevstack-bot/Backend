const crypto = require("crypto");
const DietPlan = require("../Modals/DietPlan");
const DietTemplate = require("../Modals/DietTemplate");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString, getDayOfWeek } = require("../Utils/date");

// Helper to check if two date ranges overlap
const checkOverlap = (startA, endA, startB, endB) => {
  return startA <= endB && endA >= startB;
};

// @desc Create diet plan
// @route POST /api/diet
const createDietPlan = asyncHandler(async (req, res) => {
  const { name, startDate, endDate, days, groupId, isActive } = req.body;
  const userTimezone = req.user.timezone || "Asia/Kolkata";
  const planStart = startDate || getLocalDateString(new Date(), userTimezone);
  const planEnd = endDate || "2035-12-31"; // Default continuous ongoing plan

  // Ensure stable meal IDs for all meals
  const formattedDays = (days || []).map((day) => ({
    dayOfWeek: Number(day.dayOfWeek),
    meals: (day.meals || []).map((meal) => ({
      mealId: meal.mealId || crypto.randomUUID(),
      name: meal.name,
      scheduledTime: meal.scheduledTime || "08:00",
      foodItems: meal.foodItems || [],
      notes: meal.notes || "",
      alternatives: meal.alternatives || [],
    })),
  }));

  // If set to active, ensure no overlapping active plans for this user
  if (isActive !== false) {
    const existingActive = await DietPlan.find({
      userId: req.user._id,
      isActive: true,
    });

    for (const plan of existingActive) {
      if (checkOverlap(planStart, planEnd, plan.startDate, plan.endDate)) {
        // Deactivate older overlapping plan to avoid collision
        plan.isActive = false;
        await plan.save();
      }
    }
  }

  const dietPlan = await DietPlan.create({
    userId: req.user._id,
    groupId: groupId || null,
    name: name || "Ongoing Meal Plan",
    startDate: planStart,
    endDate: planEnd,
    isActive: isActive !== false,
    days: formattedDays,
  });

  return sendSuccess(res, { dietPlan }, "Diet plan created successfully", 201);
});

// @desc List user's diet plans
// @route GET /api/diet/my-plans
const getMyPlans = asyncHandler(async (req, res) => {
  const plans = await DietPlan.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return sendSuccess(res, { plans });
});

// @desc Get single diet plan
// @route GET /api/diet/:id
const getDietPlanById = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Diet plan not found", 404);
  }

  return sendSuccess(res, { plan });
});

// @desc Update diet plan
// @route PUT /api/diet/:id
const updateDietPlan = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Diet plan not found or unauthorized", 404);
  }

  const { name, startDate, endDate, days, isActive, groupId } = req.body;

  if (name) plan.name = name;
  if (startDate) plan.startDate = startDate;
  if (endDate) plan.endDate = endDate;
  if (groupId !== undefined) plan.groupId = groupId;
  if (isActive !== undefined) plan.isActive = isActive;

  if (days) {
    plan.days = days.map((day) => ({
      dayOfWeek: Number(day.dayOfWeek),
      meals: (day.meals || []).map((meal) => ({
        mealId: meal.mealId || crypto.randomUUID(),
        name: meal.name,
        scheduledTime: meal.scheduledTime || "08:00",
        foodItems: meal.foodItems || [],
        notes: meal.notes || "",
        alternatives: meal.alternatives || [],
      })),
    }));
  }

  await plan.save();
  return sendSuccess(res, { plan }, "Diet plan updated successfully");
});

// @desc Delete diet plan
// @route DELETE /api/diet/:id
const deleteDietPlan = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Diet plan not found or unauthorized", 404);
  }

  return sendSuccess(res, null, "Diet plan deleted successfully");
});

// @desc Activate a plan
// @route POST /api/diet/:id/activate
const activateDietPlan = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Diet plan not found", 404);
  }

  // Deactivate any overlapping plans
  const otherPlans = await DietPlan.find({
    _id: { $ne: plan._id },
    userId: req.user._id,
    isActive: true,
  });

  for (const op of otherPlans) {
    if (checkOverlap(plan.startDate, plan.endDate, op.startDate, op.endDate)) {
      op.isActive = false;
      await op.save();
    }
  }

  plan.isActive = true;
  await plan.save();

  return sendSuccess(res, { plan }, "Diet plan activated successfully");
});

// @desc Duplicate one day's meals to another day (or to all days)
// @route POST /api/diet/:id/duplicate-day
const duplicateDay = asyncHandler(async (req, res) => {
  const { fromDay, toDay, toAllDays } = req.body; // 0-6

  if (fromDay === undefined || (toDay === undefined && !toAllDays)) {
    return sendError(res, "fromDay and target toDay (or toAllDays) are required", 400);
  }

  const plan = await DietPlan.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!plan) {
    return sendError(res, "Diet plan not found", 404);
  }

  const sourceDay = plan.days.find((d) => d.dayOfWeek === Number(fromDay));
  if (!sourceDay) {
    return sendError(res, `No meals found for source day ${fromDay}`, 404);
  }

  if (toAllDays || toDay === "all") {
    // Duplicate to all other days of the week (0 to 6)
    for (let day = 0; day <= 6; day++) {
      if (day === Number(fromDay)) continue;
      const cloned = sourceDay.meals.map((m) => ({
        mealId: crypto.randomUUID(),
        name: m.name,
        scheduledTime: m.scheduledTime,
        foodItems: (m.foodItems || []).map((f) => ({ ...(f.toObject ? f.toObject() : f) })),
        notes: m.notes,
        alternatives: m.alternatives,
      }));

      const targetIndex = plan.days.findIndex((d) => d.dayOfWeek === day);
      if (targetIndex >= 0) {
        plan.days[targetIndex].meals = cloned;
      } else {
        plan.days.push({ dayOfWeek: day, meals: cloned });
      }
    }
    await plan.save();
    return sendSuccess(res, { plan }, "Meals applied to all 7 days of the week!");
  }

  // Clone source meals with new IDs
  const clonedMeals = sourceDay.meals.map((m) => ({
    mealId: crypto.randomUUID(),
    name: m.name,
    scheduledTime: m.scheduledTime,
    foodItems: (m.foodItems || []).map((f) => ({ ...(f.toObject ? f.toObject() : f) })),
    notes: m.notes,
    alternatives: m.alternatives,
  }));

  const targetIndex = plan.days.findIndex((d) => d.dayOfWeek === Number(toDay));
  if (targetIndex >= 0) {
    plan.days[targetIndex].meals = clonedMeals;
  } else {
    plan.days.push({
      dayOfWeek: Number(toDay),
      meals: clonedMeals,
    });
  }

  await plan.save();
  return sendSuccess(res, { plan }, `Meals duplicated from day ${fromDay} to day ${toDay}`);
});

// @desc Get today's planned meals
// @route GET /api/diet/today
const getTodayPlannedMeals = asyncHandler(async (req, res) => {
  const todayStr = getLocalDateString(new Date(), req.user.timezone);
  const dayOfWeek = getDayOfWeek(todayStr);

  const activePlan = await DietPlan.findOne({
    userId: req.user._id,
    isActive: true,
    startDate: { $lte: todayStr },
    endDate: { $gte: todayStr },
  });

  if (!activePlan) {
    return sendSuccess(res, {
      hasActivePlan: false,
      date: todayStr,
      dayOfWeek,
      meals: [],
    });
  }

  const daySchedule = activePlan.days.find((d) => d.dayOfWeek === dayOfWeek);

  return sendSuccess(res, {
    hasActivePlan: true,
    planId: activePlan._id,
    planName: activePlan.name,
    date: todayStr,
    dayOfWeek,
    meals: daySchedule ? daySchedule.meals : [],
  });
});

/**
 * @desc Get user's diet templates
 * @route GET /api/diet/templates
 * @access Private
 */
const getDietTemplates = asyncHandler(async (req, res) => {
  const templates = await DietTemplate.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return sendSuccess(res, { templates });
});

/**
 * @desc Create or update a diet template
 * @route POST /api/diet/templates
 * @access Private
 */
const createOrUpdateDietTemplate = asyncHandler(async (req, res) => {
  const { id, name, description, meals, isDefault } = req.body;

  if (!name || !name.trim()) {
    return sendError(res, "Template name is required", 400);
  }

  // Format meals and items
  const formattedMeals = (meals || []).map((m) => ({
    mealId: m.mealId || crypto.randomUUID(),
    mealName: m.mealName || m.name || "Meal",
    scheduledTime: m.scheduledTime || "08:00",
    plannedFoodItems: (m.plannedFoodItems || m.foodItems || []).map((f) => ({
      itemId: f.itemId || crypto.randomUUID(),
      name: f.name,
      quantity: Number(f.quantity) || 100,
      unit: f.unit || "g",
      calories: Number(f.calories) || 0,
      protein: Number(f.protein) || 0,
      carbs: Number(f.carbs) || 0,
      fats: Number(f.fats) || 0,
    })),
  }));

  // If setting this as default, unset other defaults
  if (isDefault) {
    await DietTemplate.updateMany({ userId: req.user._id }, { $set: { isDefault: false } });
  }

  let template;
  if (id) {
    template = await DietTemplate.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      {
        $set: {
          name: name.trim(),
          description: description || "",
          meals: formattedMeals,
          isDefault: Boolean(isDefault),
        },
      },
      { returnDocument: "after" }
    );
  } else {
    template = await DietTemplate.create({
      userId: req.user._id,
      name: name.trim(),
      description: description || "",
      meals: formattedMeals,
      isDefault: Boolean(isDefault),
    });
  }

  return sendSuccess(res, { template }, "Diet template saved successfully", id ? 200 : 201);
});

/**
 * @desc Delete a diet template
 * @route DELETE /api/diet/templates/:id
 * @access Private
 */
const deleteDietTemplate = asyncHandler(async (req, res) => {
  const template = await DietTemplate.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!template) {
    return sendError(res, "Diet template not found", 404);
  }

  return sendSuccess(res, null, "Diet template deleted successfully");
});

module.exports = {
  createDietPlan,
  getMyPlans,
  getDietPlanById,
  updateDietPlan,
  deleteDietPlan,
  activateDietPlan,
  duplicateDay,
  getTodayPlannedMeals,
  getDietTemplates,
  createOrUpdateDietTemplate,
  deleteDietTemplate,
};
