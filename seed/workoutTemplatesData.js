/**
 * FitTogether Built-in Workout Templates
 * Fully configurable splits that users can preview, apply, and customize.
 */

const WORKOUT_TEMPLATES = [
  {
    templateKey: "ppl",
    name: "Push Pull Legs (PPL)",
    description: "The gold standard split for balanced muscle hypertrophy and progressive overload. Covers chest/shoulders/triceps, back/biceps, and legs.",
    fitnessLevel: "Intermediate",
    goal: "Hypertrophy & Strength",
    daysPerWeek: 6,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Monday
        dayName: "Push Day (Chest, Shoulders, Triceps)",
        targetMuscles: ["Chest", "Shoulders", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Bench Press", targetSets: 4, targetReps: 8, restSeconds: 120, primaryMuscle: "Chest" },
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Overhead Barbell Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Dumbbell Lateral Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Skull Crushers (Lying Triceps Extension)", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Triceps" },
        ],
      },
      {
        dayOfWeek: 2, // Tuesday
        dayName: "Pull Day (Back, Biceps, Rear Delts)",
        targetMuscles: ["Back", "Biceps", "Forearms"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 5, restSeconds: 150, primaryMuscle: "Back" },
          { name: "Lat Pulldown", targetSets: 4, targetReps: 10, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Barbell Bent-Over Row", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Face Pull", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Hammer Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 3, // Wednesday
        dayName: "Legs Day (Quads, Hamstrings, Calves)",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 4, targetReps: 8, restSeconds: 120, primaryMuscle: "Legs" },
          { name: "Romanian Deadlift (RDL)", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Press", targetSets: 3, targetReps: 12, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Lying Leg Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Standing Calf Raise", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Hanging Leg Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 4, // Thursday
        dayName: "Push Day B",
        targetMuscles: ["Chest", "Shoulders", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Incline Dumbbell Press", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Chest Dips", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Seated Dumbbell Shoulder Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Cable Crossover", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Close-Grip Bench Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Triceps" },
        ],
      },
      {
        dayOfWeek: 5, // Friday
        dayName: "Pull Day B",
        targetMuscles: ["Back", "Biceps"],
        isRestDay: false,
        exercises: [
          { name: "Pull-ups", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Seated Cable Row", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Single-Arm Dumbbell Row", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Incline Dumbbell Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Cable Rope Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 6, // Saturday
        dayName: "Legs Day B",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 3, targetReps: 10, restSeconds: 120, primaryMuscle: "Legs" },
          { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Extension", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Walking Lunges", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Plank", targetSets: 3, targetReps: 60, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 0, // Sunday
        dayName: "Rest & Active Recovery",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "upper_lower",
    name: "Upper Lower Split",
    description: "Ideal 4-day frequency allowing substantial recovery time and progressive compound overloading for both upper and lower body.",
    fitnessLevel: "Intermediate",
    goal: "Strength & Muscle Growth",
    daysPerWeek: 4,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Upper Body Strength (A)",
        targetMuscles: ["Chest", "Back", "Shoulders", "Triceps", "Biceps"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Bench Press", targetSets: 4, targetReps: 6, restSeconds: 120, primaryMuscle: "Chest" },
          { name: "Barbell Bent-Over Row", targetSets: 4, targetReps: 6, restSeconds: 120, primaryMuscle: "Back" },
          { name: "Overhead Barbell Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Lat Pulldown", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Lower Body Strength (A)",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 4, targetReps: 6, restSeconds: 120, primaryMuscle: "Legs" },
          { name: "Romanian Deadlift (RDL)", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Standing Calf Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Hanging Leg Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Upper Body Hypertrophy (B)",
        targetMuscles: ["Chest", "Back", "Shoulders", "Arms"],
        isRestDay: false,
        exercises: [
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Pull-ups", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Dumbbell Lateral Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Face Pull", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Incline Dumbbell Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Skull Crushers (Lying Triceps Extension)", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Triceps" },
        ],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Lower Body Hypertrophy (B)",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 5, restSeconds: 120, primaryMuscle: "Back" },
          { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Extension", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Lying Leg Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Plank", targetSets: 3, targetReps: 60, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Rest & Recovery",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "bro_split",
    name: "Classic Bro Split (5 Days)",
    description: "The classic bodybuilding isolation split dedicated to blasting one major muscle group per day with high volume.",
    fitnessLevel: "Intermediate",
    goal: "Maximum Muscle Hypertrophy",
    daysPerWeek: 5,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Chest Day",
        targetMuscles: ["Chest"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Bench Press", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Dumbbell Chest Flyes", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Cable Crossover", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Push-ups", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Chest" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Back Day",
        targetMuscles: ["Back"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 5, restSeconds: 150, primaryMuscle: "Back" },
          { name: "Lat Pulldown", targetSets: 4, targetReps: 10, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Barbell Bent-Over Row", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Seated Cable Row", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Pull-ups", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
        ],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Shoulders Day",
        targetMuscles: ["Shoulders", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Overhead Barbell Press", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Dumbbell Lateral Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Arnold Press", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Face Pull", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Hanging Leg Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Legs Day",
        targetMuscles: ["Legs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 4, targetReps: 8, restSeconds: 120, primaryMuscle: "Legs" },
          { name: "Romanian Deadlift (RDL)", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Press", targetSets: 3, targetReps: 12, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Leg Extension", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Standing Calf Raise", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Legs" },
        ],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Arms & Abs Day",
        targetMuscles: ["Biceps", "Triceps", "Forearms", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Skull Crushers (Lying Triceps Extension)", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Hammer Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Barbell Wrist Curl", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Forearms" },
          { name: "Russian Twists", targetSets: 3, targetReps: 20, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "full_body",
    name: "Full Body (3 Days)",
    description: "Time-efficient 3-day split hitting every major muscle group every session. Excellent for busy schedules and overall functional athleticism.",
    fitnessLevel: "Beginner",
    goal: "Total Body Conditioning & Strength",
    daysPerWeek: 3,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Full Body A",
        targetMuscles: ["Chest", "Back", "Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Barbell Bench Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Lat Pulldown", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Dumbbell Lateral Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Plank", targetSets: 3, targetReps: 60, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Full Body B",
        targetMuscles: ["Back", "Legs", "Shoulders", "Arms"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 6, restSeconds: 120, primaryMuscle: "Back" },
          { name: "Overhead Barbell Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Barbell Bent-Over Row", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Full Body C",
        targetMuscles: ["Legs", "Chest", "Back", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Leg Press", targetSets: 3, targetReps: 12, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Seated Cable Row", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Hanging Leg Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Active Recovery",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "beginner",
    name: "Beginner Foundation (3 Days)",
    description: "Designed specifically for novice gym-goers to learn core movement patterns, build joint strength, and form a consistent habit.",
    fitnessLevel: "Beginner",
    goal: "Foundational Form & Strength",
    daysPerWeek: 3,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Workout A (Push & Quads)",
        targetMuscles: ["Chest", "Legs", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Goblet Squat", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Push-ups", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Lat Pulldown", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Plank", targetSets: 3, targetReps: 45, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Workout B (Pull & Hips)",
        targetMuscles: ["Back", "Legs", "Biceps"],
        isRestDay: false,
        exercises: [
          { name: "Romanian Deadlift (RDL)", targetSets: 3, targetReps: 8, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Seated Cable Row", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Dumbbell Lateral Raise", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Workout C (Core & Full Body)",
        targetMuscles: ["Full Body", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Leg Press", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Farmer's Walk", targetSets: 3, targetReps: 30, restSeconds: 60, primaryMuscle: "Forearms" },
          { name: "Russian Twists", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "intermediate",
    name: "Intermediate Powerbuilding (4 Days)",
    description: "Combines powerlifting strength progression with bodybuilding isolation movements for both aesthetic shape and raw power.",
    fitnessLevel: "Intermediate",
    goal: "Powerbuilding (Strength + Hypertrophy)",
    daysPerWeek: 4,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Heavy Push & Squat",
        targetMuscles: ["Legs", "Chest", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 4, targetReps: 5, restSeconds: 150, primaryMuscle: "Legs" },
          { name: "Barbell Bench Press", targetSets: 4, targetReps: 5, restSeconds: 150, primaryMuscle: "Chest" },
          { name: "Chest Dips", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Heavy Pull & Hinge",
        targetMuscles: ["Back", "Legs", "Biceps"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 5, restSeconds: 150, primaryMuscle: "Back" },
          { name: "Barbell Bent-Over Row", targetSets: 4, targetReps: 6, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Pull-ups", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Hammer Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Hypertrophy Upper",
        targetMuscles: ["Chest", "Shoulders", "Back", "Arms"],
        isRestDay: false,
        exercises: [
          { name: "Incline Dumbbell Press", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Overhead Barbell Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Lat Pulldown", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Dumbbell Lateral Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Incline Dumbbell Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Hypertrophy Lower",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Romanian Deadlift (RDL)", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Leg Extension", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Lying Leg Curl", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Ab Wheel Rollout", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest Day",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },

  {
    templateKey: "advanced",
    name: "Advanced Hypertrophy Specialization (6 Days)",
    description: "High-volume athletic split with undulating periodization, intense exercise variety, and full compound and isolation coverage.",
    fitnessLevel: "Advanced",
    goal: "Maximum Muscle Hypertrophy & Density",
    daysPerWeek: 6,
    isTemplate: true,
    schedule: [
      {
        dayOfWeek: 1, // Mon
        dayName: "Chest & Triceps Focus",
        targetMuscles: ["Chest", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Bench Press", targetSets: 4, targetReps: 6, restSeconds: 120, primaryMuscle: "Chest" },
          { name: "Incline Dumbbell Press", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Chest Dips", targetSets: 3, targetReps: 10, restSeconds: 90, primaryMuscle: "Chest" },
          { name: "Cable Crossover", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Chest" },
          { name: "Close-Grip Bench Press", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Triceps" },
          { name: "Tricep Rope Pushdown", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Triceps" },
        ],
      },
      {
        dayOfWeek: 2, // Tue
        dayName: "Back & Biceps Focus",
        targetMuscles: ["Back", "Biceps", "Forearms"],
        isRestDay: false,
        exercises: [
          { name: "Conventional Deadlift", targetSets: 3, targetReps: 5, restSeconds: 150, primaryMuscle: "Back" },
          { name: "Pull-ups", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Barbell Bent-Over Row", targetSets: 3, targetReps: 8, restSeconds: 90, primaryMuscle: "Back" },
          { name: "Single-Arm Dumbbell Row", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Back" },
          { name: "Barbell Bicep Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
          { name: "Preacher Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 3, // Wed
        dayName: "Legs & Core Quads Focus",
        targetMuscles: ["Legs", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Barbell Back Squat", targetSets: 4, targetReps: 6, restSeconds: 120, primaryMuscle: "Legs" },
          { name: "Leg Press", targetSets: 4, targetReps: 10, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Bulgarian Split Squat", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Leg Extension", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Hanging Leg Raise", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 4, // Thu
        dayName: "Shoulders & Arms Hypertrophy",
        targetMuscles: ["Shoulders", "Biceps", "Triceps"],
        isRestDay: false,
        exercises: [
          { name: "Overhead Barbell Press", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Shoulders" },
          { name: "Dumbbell Lateral Raise", targetSets: 5, targetReps: 12, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Face Pull", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Shoulders" },
          { name: "Skull Crushers (Lying Triceps Extension)", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Triceps" },
          { name: "Incline Dumbbell Curl", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Biceps" },
        ],
      },
      {
        dayOfWeek: 5, // Fri
        dayName: "Posterior Chain & Hamstrings",
        targetMuscles: ["Legs", "Back", "Abs"],
        isRestDay: false,
        exercises: [
          { name: "Romanian Deadlift (RDL)", targetSets: 4, targetReps: 8, restSeconds: 90, primaryMuscle: "Legs" },
          { name: "Lying Leg Curl", targetSets: 4, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Walking Lunges", targetSets: 3, targetReps: 12, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Standing Calf Raise", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Legs" },
          { name: "Ab Wheel Rollout", targetSets: 3, targetReps: 10, restSeconds: 60, primaryMuscle: "Abs" },
        ],
      },
      {
        dayOfWeek: 6, // Sat
        dayName: "Full Body Functional & Conditioning",
        targetMuscles: ["Full Body", "Forearms"],
        isRestDay: false,
        exercises: [
          { name: "Clean and Press", targetSets: 3, targetReps: 6, restSeconds: 90, primaryMuscle: "Full Body" },
          { name: "Kettlebell Swing", targetSets: 4, targetReps: 15, restSeconds: 60, primaryMuscle: "Full Body" },
          { name: "Farmer's Walk", targetSets: 4, targetReps: 40, restSeconds: 60, primaryMuscle: "Forearms" },
          { name: "Burpees", targetSets: 3, targetReps: 15, restSeconds: 60, primaryMuscle: "Full Body" },
        ],
      },
      {
        dayOfWeek: 0, // Sun
        dayName: "Rest & Total Recovery",
        targetMuscles: [],
        isRestDay: true,
        exercises: [],
      },
    ],
  },
];

module.exports = WORKOUT_TEMPLATES;
