const { describe, it } = require("node:test");
const assert = require("node:assert");
const { parseMealOffline, inferMealSlot } = require("../Utils/aiNutritionService");
const { PENALTY_RULES } = require("../Utils/penaltyService");
const { POINTS_RULES } = require("../Utils/gamification");

describe("Habit Deductions and Points Rules", () => {
  it("defines standard penalty values for missed habits", () => {
    assert.strictEqual(PENALTY_RULES.meals, -15);
    assert.strictEqual(PENALTY_RULES.water, -10);
    assert.strictEqual(PENALTY_RULES.workout, -15);

    assert.strictEqual(POINTS_RULES.PENALTY_MISSED_MEALS, -15);
    assert.strictEqual(POINTS_RULES.PENALTY_MISSED_WATER, -10);
    assert.strictEqual(POINTS_RULES.PENALTY_MISSED_WORKOUT, -15);
  });
});

describe("AI Natural Language Meal Parsing", () => {
  it("parses multiple breakfast items with quantities, units and macros", () => {
    const input = "2 boiled eggs, 2 slices brown bread with 1 tbsp peanut butter and black coffee";
    const res = parseMealOffline(input);

    assert.strictEqual(res.items.length, 4);

    const egg = res.items.find((i) => i.name.toLowerCase().includes("egg"));
    assert.ok(egg, "Egg item should be found");
    assert.strictEqual(egg.quantity, 2);
    assert.strictEqual(egg.unit, "piece");
    assert.strictEqual(egg.calories, 148);
    assert.strictEqual(egg.protein, 12.6);

    const bread = res.items.find((i) => i.name.toLowerCase().includes("bread"));
    assert.ok(bread, "Bread item should be found");
    assert.strictEqual(bread.quantity, 2);
    assert.strictEqual(bread.unit, "slice");

    const pb = res.items.find((i) => i.name.toLowerCase().includes("peanut butter"));
    assert.ok(pb, "Peanut butter item should be found");
    assert.strictEqual(pb.quantity, 1);
    assert.strictEqual(pb.unit, "tbsp");

    const coffee = res.items.find((i) => i.name.toLowerCase().includes("coffee"));
    assert.ok(coffee, "Coffee item should be found");

    assert.ok(res.totals.calories > 300);
    assert.ok(res.totals.protein > 20);
  });

  it("parses high-protein gym meal (chicken breast and white rice)", () => {
    const input = "1 bowl chicken breast with 1 bowl white rice";
    const res = parseMealOffline(input);

    assert.strictEqual(res.items.length, 2);
    const chicken = res.items.find((i) => i.name.toLowerCase().includes("chicken"));
    assert.ok(chicken);
    assert.strictEqual(chicken.protein, 31);

    const rice = res.items.find((i) => i.name.toLowerCase().includes("rice"));
    assert.ok(rice);
    assert.strictEqual(rice.carbs, 43);

    assert.strictEqual(res.totals.calories, 360);
  });

  it("parses whey protein shake and oats", () => {
    const input = "1 scoop whey protein and 40g oats";
    const res = parseMealOffline(input);

    assert.strictEqual(res.items.length, 2);
    const whey = res.items.find((i) => i.name.toLowerCase().includes("whey"));
    assert.ok(whey);
    assert.strictEqual(whey.quantity, 1);
    assert.strictEqual(whey.unit, "scoop");
    assert.strictEqual(whey.protein, 24);

    const oats = res.items.find((i) => i.name.toLowerCase().includes("oats"));
    assert.ok(oats);
    assert.strictEqual(oats.quantity, 40);
    assert.strictEqual(oats.unit, "g");
  });

  it("infers meal slot correctly from text context", () => {
    assert.strictEqual(inferMealSlot("Healthy breakfast: 3 egg whites"), "Breakfast");
    assert.strictEqual(inferMealSlot("Lunch today was 2 rotis and dal"), "Lunch");
    assert.strictEqual(inferMealSlot("Late night dinner: chicken salad"), "Dinner");
    assert.strictEqual(inferMealSlot("Post workout snack: 1 apple"), "Snack");
  });
});
