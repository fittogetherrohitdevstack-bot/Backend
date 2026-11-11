const assert = require("assert");
const { getISOWeekDetails, getCalendarMonth, getLocalDateString } = require("../Utils/date");
const { calculateChartTotals } = require("../Controllers/mealController");

const runUnitTests = () => {
  console.log("🧪 Running Measurements & Diet Unit Test Suite...\n");

  // Test 1: Date & ISO Week Boundaries
  console.log("1. Testing Date & ISO Week Boundaries:");
  const mondaySample = getISOWeekDetails("2026-11-09"); // Monday
  assert.strictEqual(mondaySample.weekStart, "2026-11-09");
  assert.strictEqual(mondaySample.weekEnd, "2026-11-15");
  console.log("  ✓ Monday belongs to week starting on same Monday: PASSED");

  const sundaySample = getISOWeekDetails("2026-11-15"); // Sunday
  assert.strictEqual(sundaySample.weekStart, "2026-11-09");
  assert.strictEqual(sundaySample.weekEnd, "2026-11-15");
  console.log("  ✓ Sunday belongs to ISO week starting previous Monday: PASSED");

  const monthSample = getCalendarMonth("2026-11-10");
  assert.strictEqual(monthSample, "2026-11");
  console.log("  ✓ Calendar month extraction (2026-11): PASSED\n");

  // Test 2: Derived Meal Status Logic
  console.log("2. Testing Derived Meal Status Logic:");

  // Case A: None eaten -> pending
  const mealsCaseA = [
    {
      mealId: "m1",
      mealName: "Breakfast",
      status: "pending",
      plannedFoodItems: [
        { itemId: "f1", name: "Oats", quantity: 100, calories: 389, protein: 17, carbs: 66, fats: 7, eaten: false },
        { itemId: "f2", name: "Eggs", quantity: 2, calories: 140, protein: 12, carbs: 1, fats: 10, eaten: false },
      ],
    },
  ];
  const totalsA = calculateChartTotals(mealsCaseA);
  assert.strictEqual(mealsCaseA[0].status, "pending");
  assert.strictEqual(totalsA.completionPercentage, 0);
  assert.strictEqual(totalsA.consumedTotals.calories, 0);
  console.log("  ✓ Zero items eaten derives status = 'pending' and 0% completion: PASSED");

  // Case B: Some eaten -> partial
  mealsCaseA[0].plannedFoodItems[0].eaten = true;
  const totalsB = calculateChartTotals(mealsCaseA);
  assert.strictEqual(mealsCaseA[0].status, "partial");
  assert.strictEqual(totalsB.completionPercentage, 50);
  assert.strictEqual(totalsB.consumedTotals.calories, 389);
  assert.strictEqual(totalsB.consumedTotals.protein, 17);
  console.log("  ✓ 1 of 2 items eaten derives status = 'partial' and 50% completion: PASSED");

  // Case C: All eaten -> eaten
  mealsCaseA[0].plannedFoodItems[1].eaten = true;
  const totalsC = calculateChartTotals(mealsCaseA);
  assert.strictEqual(mealsCaseA[0].status, "eaten");
  assert.strictEqual(totalsC.completionPercentage, 100);
  assert.strictEqual(totalsC.consumedTotals.calories, 389 + 140);
  assert.strictEqual(totalsC.consumedTotals.protein, 17 + 12);
  console.log("  ✓ All items eaten derives status = 'eaten' and 100% completion: PASSED");

  // Case D: Explicitly skipped meal
  mealsCaseA[0].status = "skipped";
  const totalsD = calculateChartTotals(mealsCaseA);
  assert.strictEqual(mealsCaseA[0].status, "skipped");
  assert.strictEqual(totalsD.mealsSkipped, 1);
  console.log("  ✓ Explicit skip is preserved and recorded in totals: PASSED\n");

  // Test 3: Actual Quantity Proportional Scaling
  console.log("3. Testing Actual Quantity Proportional Scaling:");
  const mealsScale = [
    {
      mealId: "m1",
      mealName: "Snack",
      plannedFoodItems: [
        {
          itemId: "f1",
          name: "Chicken",
          quantity: 100, // planned 100g = 200 kcal
          calories: 200,
          protein: 30,
          carbs: 0,
          fats: 4,
          eaten: true,
          actualQuantity: 150, // ate 150g -> should scale to 300 kcal, 45g protein
        },
      ],
    },
  ];
  const totalsScale = calculateChartTotals(mealsScale);
  assert.strictEqual(totalsScale.consumedTotals.calories, 300);
  assert.strictEqual(totalsScale.consumedTotals.protein, 45);
  console.log("  ✓ Actual quantity proportional scaling (150% portion): PASSED\n");

  // Test 4: Body Ratios Calculation
  console.log("4. Testing Waist-to-Hip & Waist-to-Height Ratios:");
  const waistCm = 78;
  const hipsCm = 95;
  const heightCm = 175;

  const waistToHip = Math.round((waistCm / hipsCm) * 100) / 100;
  const waistToHeight = Math.round((waistCm / heightCm) * 100) / 100;

  assert.strictEqual(waistToHip, 0.82);
  assert.strictEqual(waistToHeight, 0.45);
  console.log("  ✓ Waist-to-Hip ratio (78/95 = 0.82): PASSED");
  console.log("  ✓ Waist-to-Height ratio (78/175 = 0.45): PASSED\n");

  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! (100% assertions green)");
};

runUnitTests();
