const crypto = require("crypto");
const { getDayOfWeek, getSignedDaysDiff, isValidDateString } = require("./date");

/**
 * Formats an array of planned meals, ensuring each meal has a stable mealId.
 */
const formatPlanMeals = (meals = []) =>
  (meals || []).map((meal) => ({
    mealId: meal.mealId || crypto.randomUUID(),
    name: meal.name || "Meal",
    scheduledTime: meal.scheduledTime || "08:00",
    foodItems: meal.foodItems || [],
    notes: meal.notes || "",
    alternatives: meal.alternatives || [],
  }));

/**
 * Resolves the planned meals and variant metadata for a given plan and YYYY-MM-DD date.
 * Supports "simple" (same every day), "alternating" (Diet A / Diet B every other day),
 * and "weekly" (per day-of-week schedule, default for legacy plans).
 */
const resolvePlanMealsForDate = (plan, dateStr) => {
  if (!plan) {
    return { meals: [], mode: "weekly", variantKey: null, variantLabel: null };
  }

  const mode = plan.scheduleMode || "weekly";

  if (mode === "simple") {
    const simpleMeals = plan.simpleMeals || [];
    const fallbackMeals =
      simpleMeals.length > 0
        ? simpleMeals
        : (plan.days || []).find((d) => (d.meals || []).length > 0)?.meals || [];

    return {
      meals: fallbackMeals,
      mode: "simple",
      variantKey: "simple",
      variantLabel: "Simple Daily Plan",
    };
  }

  if (mode === "alternating") {
    const config = plan.alternatingConfig || {};
    const anchor = isValidDateString(config.anchorDate)
      ? config.anchorDate
      : isValidDateString(plan.startDate)
      ? plan.startDate
      : dateStr;
    const diffDays = getSignedDaysDiff(anchor, dateStr);
    const isDietA = Math.abs(diffDays) % 2 === 0;

    const dietAMeals = config.dietAMeals || [];
    const dietBMeals = config.dietBMeals || [];
    const meals = isDietA ? dietAMeals : dietBMeals;

    return {
      meals,
      mode: "alternating",
      variantKey: isDietA ? "A" : "B",
      variantLabel: isDietA
        ? config.dietAName || "Diet A"
        : config.dietBName || "Diet B",
    };
  }

  const dayOfWeek = getDayOfWeek(dateStr);
  const daySchedule = (plan.days || []).find((d) => Number(d.dayOfWeek) === dayOfWeek);
  return {
    meals: daySchedule ? daySchedule.meals || [] : [],
    mode: "weekly",
    variantKey: String(dayOfWeek),
    variantLabel: "Weekly Plan",
  };
};

/**
 * Converts planned DietPlan meals into a fresh MealLog.meals snapshot array.
 */
const buildMealSnapshotFromPlan = (planMeals = []) =>
  (planMeals || []).map((m) => ({
    mealId: m.mealId || crypto.randomUUID(),
    mealName: m.name,
    scheduledTime: m.scheduledTime || "08:00",
    plannedFoodItems: (m.foodItems || []).map((f) => ({
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

/**
 * Returns true if the user has already ticked, skipped, or added any actual food
 * in this MealLog, meaning historical/today's progress must be preserved untouched.
 */
const hasMealLogUserProgress = (mealLog) => {
  if (!mealLog || !Array.isArray(mealLog.meals)) return false;
  return mealLog.meals.some((meal) => {
    if (meal.status && meal.status !== "pending") return true;
    if ((meal.actualFoodItems || []).length > 0) return true;
    return (meal.plannedFoodItems || []).some((it) => Boolean(it.eaten || it.isUnplanned));
  });
};

module.exports = {
  formatPlanMeals,
  resolvePlanMealsForDate,
  buildMealSnapshotFromPlan,
  hasMealLogUserProgress,
};
