/**
 * Nutrition Math & Macro estimation helpers
 */

const sumFoodItems = (foodItems = []) => {
  return foodItems.reduce(
    (acc, item) => {
      acc.calories += Number(item.calories) || 0;
      acc.protein += Number(item.protein) || 0;
      acc.carbs += Number(item.carbs) || 0;
      acc.fats += Number(item.fats) || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
};

const calculateTDEE = ({
  gender = "male",
  age = 25,
  heightCm = 175,
  weightKg = 70,
  activityLevel = "moderate",
  goal = "maintenance",
}) => {
  // Mifflin-St Jeor Formula
  // BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age (y) + (gender === 'male' ? 5 : -161)
  const isMale = gender.toLowerCase() === "male";
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (isMale ? 5 : -161);

  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  const multiplier = multipliers[activityLevel] || 1.55;
  const maintenanceCalories = Math.round(bmr * multiplier);

  let targetCalories = maintenanceCalories;
  if (goal === "fat_loss") {
    targetCalories = Math.round(maintenanceCalories * 0.8); // 20% deficit
  } else if (goal === "muscle_gain") {
    targetCalories = Math.round(maintenanceCalories * 1.15); // 15% surplus
  } else if (goal === "strength") {
    targetCalories = Math.round(maintenanceCalories * 1.08); // 8% surplus
  }

  // Protein guideline: ~2g per kg body weight
  const proteinGrams = Math.round(weightKg * 2.0);
  // Fat guideline: ~25% of total calories (9 cal/g)
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  // Remaining calories to carbs (4 cal/g)
  const carbCalories = Math.max(0, targetCalories - proteinGrams * 4 - fatGrams * 9);
  const carbGrams = Math.round(carbCalories / 4);

  // Water target: ~35ml per kg body weight, min 2500ml
  const waterMl = Math.max(2500, Math.round(weightKg * 35));

  return {
    bmr: Math.round(bmr),
    maintenanceCalories,
    targetCalories,
    targets: {
      calories: targetCalories,
      protein: proteinGrams,
      carbs: carbGrams,
      fats: fatGrams,
      waterMl,
    },
    disclaimer:
      "These recommendations are scientific estimates for informational purposes and do not constitute medical or clinical dietary advice. Consult a healthcare professional before major dietary changes.",
  };
};

module.exports = {
  sumFoodItems,
  calculateTDEE,
};
