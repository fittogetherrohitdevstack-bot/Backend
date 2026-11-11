/**
 * Gamification logic: Points, Streaks, and Badges
 */

const calculateMealPoints = (eatenCount, totalPlanned) => {
  if (!totalPlanned || totalPlanned <= 0) return 0;
  // +10 * (1 / meals that day) scaled to max +40/day
  // Each eaten meal gives Math.round(40 / totalPlanned)
  const ptsPerMeal = Math.round(40 / totalPlanned);
  return Math.min(40, eatenCount * ptsPerMeal);
};

const POINTS_RULES = {
  WORKOUT_COMPLETED: 30,
  REST_DAY_HONORED: 30,
  WATER_GOAL_REACHED: 15,
  WEIGH_IN_LOGGED: 10,
  WEEKLY_MEASUREMENTS_COMPLETED: 15,
  PHOTO_CHECKIN_COMPLETED: 20,
  FULL_DAY_BONUS: 25,
  CHALLENGE_DEFAULT: 100,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP: 50,
};

const SEEDED_BADGES = [
  {
    code: "FIRST_LOG",
    name: "First Step",
    description: "Logged your first meal or workout session",
    icon: "Footprints",
  },
  {
    code: "STREAK_7",
    name: "Week Warrior",
    description: "Maintained a 7-day consistency streak",
    icon: "Flame",
  },
  {
    code: "STREAK_30",
    name: "Iron Routine",
    description: "Maintained an unbroken 30-day streak",
    icon: "Crown",
  },
  {
    code: "HYDRATION_HERO",
    name: "Hydration Hero",
    description: "Reached daily water target 7 times",
    icon: "Droplets",
  },
  {
    code: "IRON_REGULAR",
    name: "Gym Regular",
    description: "Completed 4 workouts in a single week",
    icon: "Dumbbell",
  },
  {
    code: "PERFECT_WEEK",
    name: "Flawless Week",
    description: "Hit all meals, workouts, and water goals for 7 consecutive days",
    icon: "Sparkles",
  },
  {
    code: "CHALLENGE_CHAMPION",
    name: "Challenge Champion",
    description: "Completed your first group challenge",
    icon: "Trophy",
  },
  {
    code: "EARLY_BIRD",
    name: "Early Bird",
    description: "Logged breakfast before 9:00 AM five times",
    icon: "Sun",
  },
];

module.exports = {
  calculateMealPoints,
  POINTS_RULES,
  SEEDED_BADGES,
};
