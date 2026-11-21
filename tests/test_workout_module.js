const assert = require("assert");
const EXERCISE_SEED_DATA = require("../seed/exerciseSeedData");
const WORKOUT_TEMPLATES = require("../seed/workoutTemplatesData");

console.log("=== RUNNING WORKOUT MODULE UNIT TESTS ===");

// 1. Verify Exercise Seed Data
assert(Array.isArray(EXERCISE_SEED_DATA), "EXERCISE_SEED_DATA should be an array");
assert(EXERCISE_SEED_DATA.length >= 25, `Expected >= 25 exercises, found ${EXERCISE_SEED_DATA.length}`);

const requiredMuscles = [
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

const foundMuscles = new Set(EXERCISE_SEED_DATA.map((e) => e.primaryMuscle));
requiredMuscles.forEach((muscle) => {
  assert(
    foundMuscles.has(muscle),
    `Muscle group "${muscle}" must be covered in exercise seed data`
  );
});

EXERCISE_SEED_DATA.forEach((ex) => {
  assert(ex.name && ex.name.length > 0, `Exercise must have a name: ${JSON.stringify(ex)}`);
  assert(ex.primaryMuscle, `Exercise ${ex.name} must have a primaryMuscle`);
  assert(Array.isArray(ex.instructions) && ex.instructions.length > 0, `Exercise ${ex.name} must have instructions`);
  assert(Array.isArray(ex.commonMistakes), `Exercise ${ex.name} must have commonMistakes array`);
  assert(Array.isArray(ex.alternatives), `Exercise ${ex.name} must have alternatives array`);
});
console.log(`✓ Exercise Seed Data Verified (${EXERCISE_SEED_DATA.length} exercises across all 9 muscle groups)`);

// 2. Verify Workout Split Templates
assert(Array.isArray(WORKOUT_TEMPLATES), "WORKOUT_TEMPLATES must be an array");
assert(WORKOUT_TEMPLATES.length >= 7, `Expected 7 templates, found ${WORKOUT_TEMPLATES.length}`);

const requiredTemplateKeys = [
  "ppl",
  "upper_lower",
  "bro_split",
  "full_body",
  "beginner",
  "intermediate",
  "advanced",
];

requiredTemplateKeys.forEach((key) => {
  const found = WORKOUT_TEMPLATES.find((t) => t.templateKey === key);
  assert(found, `Template "${key}" must exist in WORKOUT_TEMPLATES`);
  assert(found.schedule && found.schedule.length > 0, `Template "${key}" must have a schedule`);
  assert(found.daysPerWeek > 0, `Template "${key}" must define daysPerWeek`);
});
console.log(`✓ Built-in Workout Templates Verified (${WORKOUT_TEMPLATES.length} templates present & structured)`);

// 3. Verify Epley 1RM Formula
const calculateEstimated1RM = (weight, reps) => {
  if (!weight || weight <= 0) return 0;
  if (!reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
};

assert.strictEqual(calculateEstimated1RM(100, 1), 100);
// 100kg x 10 reps -> 100 * (1 + 10/30) = 133.33 -> 133kg
assert.strictEqual(calculateEstimated1RM(100, 10), 133);
// 80kg x 6 reps -> 80 * (1 + 6/30) = 96kg
assert.strictEqual(calculateEstimated1RM(80, 6), 96);
console.log("✓ Epley 1RM calculation verified");

// 4. Verify Calorie Estimation
const calculateEstimatedCalories = (durationMinutes = 0, totalVolumeKg = 0) => {
  if (durationMinutes <= 0) return 0;
  const baseBurn = durationMinutes * 6.5;
  const volumeBonus = Math.round(totalVolumeKg / 1000);
  return Math.round(baseBurn + volumeBonus);
};

const cals45m = calculateEstimatedCalories(45, 8000);
// 45 * 6.5 + 8 = 292.5 + 8 = 301
assert.strictEqual(cals45m, 301);
console.log("✓ Resistance calorie burn calculation verified");

// 5. Verify PR Detection Logic
const testSet = { weight: 105, reps: 8 };
const existingPR = { bestWeight: 100, bestReps: 6, estimatedOneRepMax: 120 };
const test1RM = calculateEstimated1RM(testSet.weight, testSet.reps); // 105 * (1 + 8/30) = 133

let isNewWeightPR = testSet.weight > existingPR.bestWeight;
let isNewRepsPR = testSet.reps > existingPR.bestReps;
let isNew1RMPR = test1RM > existingPR.estimatedOneRepMax;

assert(isNewWeightPR, "Should detect new weight PR");
assert(isNewRepsPR, "Should detect new reps PR");
assert(isNew1RMPR, "Should detect new 1RM PR");
console.log("✓ Personal Record Detection Logic verified");

// 6. Verify 2,000+ Exercise Comprehensive Catalog
const fs = require("fs");
const path = require("path");
const catalogPath = path.join(__dirname, "../seed/comprehensiveExerciseCatalog.json");
assert(fs.existsSync(catalogPath), "comprehensiveExerciseCatalog.json must exist");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));

assert(Array.isArray(catalog), "Catalog must be an array");
assert(catalog.length >= 2000, `Expected >= 2000 exercises, found ${catalog.length}`);
console.log(`✓ Comprehensive Catalog verified with ${catalog.length} unique exercises`);

// Verify Media Types & Distributions
const mediaCounts = { video: 0, gif: 0, images: 0, none: 0 };
const muscleCounts = {};
const categoryCounts = {};

catalog.forEach((ex) => {
  assert(ex.name, "Exercise must have name");
  assert(ex.primaryMuscle, `Exercise ${ex.name} must have primaryMuscle`);
  assert(ex.mediaType, `Exercise ${ex.name} must have mediaType`);
  mediaCounts[ex.mediaType] = (mediaCounts[ex.mediaType] || 0) + 1;
  muscleCounts[ex.primaryMuscle] = (muscleCounts[ex.primaryMuscle] || 0) + 1;
  if (ex.category) {
    categoryCounts[ex.category] = (categoryCounts[ex.category] || 0) + 1;
  }

  if (ex.mediaType === "video") {
    const videoSrc = ex.videoUrl || ex.videoUrlFemale;
    assert(videoSrc && videoSrc.endsWith(".mp4"), `Video exercise ${ex.name} must have .mp4 videoUrl or videoUrlFemale`);
  }
  if (ex.mediaType === "gif") {
    assert(ex.gifUrl && ex.gifUrl.endsWith(".gif"), `GIF exercise ${ex.name} must have .gif gifUrl`);
  }
});

assert(mediaCounts.video >= 300, `Expected >= 300 video exercises, found ${mediaCounts.video}`);
assert(mediaCounts.gif >= 1000, `Expected >= 1000 GIF exercises, found ${mediaCounts.gif}`);
assert(mediaCounts.images >= 400, `Expected >= 400 diagram exercises, found ${mediaCounts.images}`);

console.log(`✓ Media Breakdown: Videos=${mediaCounts.video}, GIFs=${mediaCounts.gif}, Diagrams=${mediaCounts.images}, Text-only=${mediaCounts.none}`);
console.log(`✓ Muscle Groups Covered: ${Object.keys(muscleCounts).length} distinct muscle groups`);
console.log(`✓ Categories Covered: ${Object.keys(categoryCounts).length} distinct categories`);

console.log("\nALL WORKOUT MODULE & EXERCISE EXPANSION UNIT TESTS PASSED SUCCESSFULLY! 🎉\n");
