const https = require("https");

/**
 * Built-in Nutrition Database (per standard serving / unit)
 * Covers popular fitness, Indian, and Western foods.
 */
const FOOD_DATABASE = [
  // --- EGGS & POULTRY ---
  {
    names: ["boiled egg", "boiled eggs", "egg", "eggs", "whole egg", "whole eggs"],
    defaultUnit: "piece",
    unitWeightG: 50,
    perUnit: { calories: 74, protein: 6.3, carbs: 0.4, fats: 5.0 },
  },
  {
    names: ["egg white", "egg whites"],
    defaultUnit: "piece",
    unitWeightG: 33,
    perUnit: { calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1 },
  },
  {
    names: ["omelette", "omelet", "scrambled egg", "scrambled eggs", "egg bhurji"],
    defaultUnit: "piece",
    unitWeightG: 60,
    perUnit: { calories: 110, protein: 7.0, carbs: 1.0, fats: 8.0 },
  },
  {
    names: ["chicken breast", "boiled chicken", "grilled chicken", "chicken"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 165, protein: 31.0, carbs: 0.0, fats: 3.6 },
  },
  {
    names: ["chicken curry", "butter chicken"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 240, protein: 22.0, carbs: 6.0, fats: 14.0 },
  },

  // --- DAIRY & PROTEIN ---
  {
    names: ["whey protein", "whey", "protein powder", "protein shake"],
    defaultUnit: "scoop",
    unitWeightG: 32,
    perUnit: { calories: 125, protein: 24.0, carbs: 2.5, fats: 1.5 },
  },
  {
    names: ["paneer", "cottage cheese", "raw paneer"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 265, protein: 18.0, carbs: 3.5, fats: 20.0 },
  },
  {
    names: ["tofu", "soya paneer"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 76, protein: 8.0, carbs: 1.9, fats: 4.8 },
  },
  {
    names: ["soy chunks", "soya chunks", "meal maker"],
    defaultUnit: "g",
    baseServing: 50,
    per100g: { calories: 345, protein: 52.0, carbs: 33.0, fats: 0.5 },
  },
  {
    names: ["greek yogurt", "hung curd"],
    defaultUnit: "cup",
    unitWeightG: 150,
    perUnit: { calories: 130, protein: 15.0, carbs: 6.0, fats: 3.5 },
  },
  {
    names: ["curd", "dahi", "plain yogurt"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 98, protein: 5.0, carbs: 7.0, fats: 4.5 },
  },
  {
    names: ["milk", "cow milk", "whole milk"],
    defaultUnit: "ml",
    baseServing: 200,
    per100g: { calories: 60, protein: 3.2, carbs: 4.8, fats: 3.2 },
  },
  {
    names: ["butter", "salted butter"],
    defaultUnit: "tbsp",
    unitWeightG: 14,
    perUnit: { calories: 102, protein: 0.1, carbs: 0.0, fats: 11.5 },
  },
  {
    names: ["ghee", "clarified butter"],
    defaultUnit: "tbsp",
    unitWeightG: 14,
    perUnit: { calories: 112, protein: 0.0, carbs: 0.0, fats: 12.7 },
  },
  {
    names: ["cheese slice", "cheddar cheese", "cheese"],
    defaultUnit: "slice",
    unitWeightG: 20,
    perUnit: { calories: 70, protein: 4.5, carbs: 0.5, fats: 5.5 },
  },

  // --- GRAINS, BREAD & INDIAN STAPLES ---
  {
    names: ["roti", "chapati", "phulka"],
    defaultUnit: "piece",
    unitWeightG: 35,
    perUnit: { calories: 85, protein: 3.0, carbs: 17.0, fats: 0.5 },
  },
  {
    names: ["paratha", "aloo paratha", "plain paratha"],
    defaultUnit: "piece",
    unitWeightG: 70,
    perUnit: { calories: 210, protein: 4.5, carbs: 30.0, fats: 8.5 },
  },
  {
    names: ["brown bread", "whole wheat bread", "wheat bread"],
    defaultUnit: "slice",
    unitWeightG: 30,
    perUnit: { calories: 69, protein: 3.6, carbs: 12.0, fats: 0.9 },
  },
  {
    names: ["white bread", "bread", "toast"],
    defaultUnit: "slice",
    unitWeightG: 30,
    perUnit: { calories: 75, protein: 2.5, carbs: 14.0, fats: 1.0 },
  },
  {
    names: ["oats", "rolled oats", "oatmeal"],
    defaultUnit: "g",
    baseServing: 40,
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fats: 6.9 },
  },
  {
    names: ["white rice", "rice", "cooked rice", "steamed rice", "basmati rice"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 195, protein: 4.0, carbs: 43.0, fats: 0.5 },
  },
  {
    names: ["brown rice", "cooked brown rice"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 165, protein: 3.8, carbs: 35.0, fats: 1.4 },
  },
  {
    names: ["poha", "flattened rice"],
    defaultUnit: "plate",
    unitWeightG: 150,
    perUnit: { calories: 230, protein: 4.0, carbs: 44.0, fats: 4.5 },
  },
  {
    names: ["upma", "rava upma"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 210, protein: 4.5, carbs: 36.0, fats: 5.0 },
  },
  {
    names: ["idli", "idlis"],
    defaultUnit: "piece",
    unitWeightG: 45,
    perUnit: { calories: 58, protein: 2.0, carbs: 12.0, fats: 0.2 },
  },
  {
    names: ["dosa", "plain dosa", "masala dosa"],
    defaultUnit: "piece",
    unitWeightG: 100,
    perUnit: { calories: 168, protein: 3.9, carbs: 28.0, fats: 4.2 },
  },

  // --- DAL & LEGUMES ---
  {
    names: ["dal", "moong dal", "toor dal", "dal tadka", "yellow dal", "lentils"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 145, protein: 8.5, carbs: 22.0, fats: 3.0 },
  },
  {
    names: ["chole", "chana", "chickpeas curry", "boiled chana"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 210, protein: 10.0, carbs: 32.0, fats: 4.5 },
  },
  {
    names: ["rajma", "kidney beans", "rajma curry"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 195, protein: 9.5, carbs: 31.0, fats: 3.5 },
  },

  // --- NUTS & SPREADS ---
  {
    names: ["peanut butter", "pb"],
    defaultUnit: "tbsp",
    unitWeightG: 16,
    perUnit: { calories: 95, protein: 4.0, carbs: 3.2, fats: 8.0 },
  },
  {
    names: ["almonds", "badam"],
    defaultUnit: "piece",
    unitWeightG: 1.2,
    perUnit: { calories: 7, protein: 0.25, carbs: 0.25, fats: 0.6 },
  },
  {
    names: ["walnuts", "akhrot"],
    defaultUnit: "piece",
    unitWeightG: 3,
    perUnit: { calories: 20, protein: 0.45, carbs: 0.4, fats: 2.0 },
  },

  // --- FRUITS & VEGGIES ---
  {
    names: ["banana", "kela"],
    defaultUnit: "piece",
    unitWeightG: 118,
    perUnit: { calories: 105, protein: 1.3, carbs: 27.0, fats: 0.3 },
  },
  {
    names: ["apple", "seb"],
    defaultUnit: "piece",
    unitWeightG: 150,
    perUnit: { calories: 80, protein: 0.4, carbs: 20.0, fats: 0.2 },
  },
  {
    names: ["orange", "santara"],
    defaultUnit: "piece",
    unitWeightG: 130,
    perUnit: { calories: 62, protein: 1.2, carbs: 15.0, fats: 0.2 },
  },
  {
    names: ["mixed salad", "salad", "cucumber", "tomato"],
    defaultUnit: "bowl",
    unitWeightG: 100,
    perUnit: { calories: 35, protein: 1.5, carbs: 7.0, fats: 0.2 },
  },
  {
    names: ["sweet potato", "shakarkandi"],
    defaultUnit: "piece",
    unitWeightG: 130,
    perUnit: { calories: 112, protein: 2.0, carbs: 26.0, fats: 0.1 },
  },

  // --- BEVERAGES & TREATS ---
  {
    names: ["black coffee", "espresso", "americano"],
    defaultUnit: "cup",
    unitWeightG: 200,
    perUnit: { calories: 4, protein: 0.3, carbs: 0.5, fats: 0.0 },
  },
  {
    names: ["coffee with milk", "coffee", "latte", "cappuccino"],
    defaultUnit: "cup",
    unitWeightG: 200,
    perUnit: { calories: 85, protein: 4.0, carbs: 7.0, fats: 4.5 },
  },
  {
    names: ["green tea"],
    defaultUnit: "cup",
    unitWeightG: 200,
    perUnit: { calories: 2, protein: 0.1, carbs: 0.2, fats: 0.0 },
  },
  {
    names: ["chai", "tea", "indian tea", "milk tea"],
    defaultUnit: "cup",
    unitWeightG: 150,
    perUnit: { calories: 95, protein: 3.0, carbs: 12.0, fats: 3.5 },
  },
];

const NUMBER_WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  single: 1,
  double: 2,
  triple: 3,
  couple: 2,
  few: 3,
};

/**
 * Infer meal slot ("Breakfast", "Lunch", "Snack", "Dinner")
 * from text clues or current local hour.
 */
const inferMealSlot = (text = "", currentHour = new Date().getHours()) => {
  const lower = text.toLowerCase();
  if (lower.includes("breakfast") || lower.includes("morning")) return "Breakfast";
  if (lower.includes("lunch") || lower.includes("afternoon")) return "Lunch";
  if (lower.includes("snack") || lower.includes("evening") || lower.includes("tea time"))
    return "Snack";
  if (lower.includes("dinner") || lower.includes("night")) return "Dinner";

  if (currentHour >= 5 && currentHour < 11) return "Breakfast";
  if (currentHour >= 11 && currentHour < 16) return "Lunch";
  if (currentHour >= 16 && currentHour < 19) return "Snack";
  return "Dinner";
};

/**
 * Parse natural language numbers & quantities (e.g., "2", "1/2", "two", "150g")
 */
const extractQuantity = (phrase) => {
  // Check for fractions first (e.g. 1/2)
  const fractionMatch = phrase.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const val = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
    return { quantity: Number(val.toFixed(2)), matchedStr: fractionMatch[0] };
  }

  // Check for digits (handles standalone numbers and attached units like 40g, 200ml)
  const numMatch = phrase.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return { quantity: parseFloat(numMatch[1]), matchedStr: numMatch[0] };
  }

  const words = phrase.toLowerCase().split(/\s+/);
  for (const w of words) {
    if (NUMBER_WORDS[w] !== undefined) {
      return { quantity: NUMBER_WORDS[w], matchedStr: w };
    }
  }

  return { quantity: 1, matchedStr: null };
};

/**
 * Identify units in phrase
 */
const extractUnit = (phrase) => {
  const lower = phrase.toLowerCase();
  if (/\b(g|grams|gram)\b/.test(lower)) return "g";
  if (/\b(ml|milliliters)\b/.test(lower)) return "ml";
  if (/\b(scoop|scoops)\b/.test(lower)) return "scoop";
  if (/\b(slice|slices)\b/.test(lower)) return "slice";
  if (/\b(bowl|bowls|katori)\b/.test(lower)) return "bowl";
  if (/\b(cup|cups)\b/.test(lower)) return "cup";
  if (/\b(plate|plates)\b/.test(lower)) return "plate";
  if (/\b(tbsp|tablespoon|tablespoons)\b/.test(lower)) return "tbsp";
  if (/\b(tsp|teaspoon|teaspoons)\b/.test(lower)) return "tsp";
  if (/\b(piece|pieces|pcs)\b/.test(lower)) return "piece";
  if (/\b(glass|glasses)\b/.test(lower)) return "glass";
  return null;
};

/**
 * Offline Intelligent NLP Nutrition Parser
 */
const parseMealOffline = (input = "", requestedMealSlot = null) => {
  const cleanInput = input.trim();
  if (!cleanInput) {
    return {
      mealSlot: requestedMealSlot || "Breakfast",
      items: [],
      totals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      source: "offline-nlp",
    };
  }

  // Split by commas, "and", "with", "+", "&", newlines, or semicolons
  const rawParts = cleanInput
    .split(/,|\band\b|\bwith\b|\+|\n|;|\&/gi)
    .map((p) => p.trim())
    .filter(Boolean);

  const parsedItems = [];

  for (const part of rawParts) {
    const lowerPart = part.toLowerCase();
    const { quantity } = extractQuantity(lowerPart);
    const specifiedUnit = extractUnit(lowerPart);

    // Find best match in FOOD_DATABASE
    let bestFood = null;
    let bestMatchLen = 0;

    for (const food of FOOD_DATABASE) {
      for (const name of food.names) {
        if (lowerPart.includes(name) && name.length > bestMatchLen) {
          bestFood = food;
          bestMatchLen = name.length;
        }
      }
    }

    if (bestFood) {
      const unit = specifiedUnit || bestFood.defaultUnit || "g";
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fats = 0;

      if (bestFood.perUnit) {
        // unit-based item (egg, slice, scoop, bowl)
        let multiplier = quantity;
        if (unit === "g" && bestFood.unitWeightG) {
          multiplier = quantity / bestFood.unitWeightG;
        }
        calories = Math.round(bestFood.perUnit.calories * multiplier);
        protein = Number((bestFood.perUnit.protein * multiplier).toFixed(1));
        carbs = Number((bestFood.perUnit.carbs * multiplier).toFixed(1));
        fats = Number((bestFood.perUnit.fats * multiplier).toFixed(1));
      } else if (bestFood.per100g) {
        // weight-based item
        const grams = unit === "g" || unit === "ml" ? quantity : quantity * (bestFood.baseServing || 100);
        const factor = grams / 100;
        calories = Math.round(bestFood.per100g.calories * factor);
        protein = Number((bestFood.per100g.protein * factor).toFixed(1));
        carbs = Number((bestFood.per100g.carbs * factor).toFixed(1));
        fats = Number((bestFood.per100g.fats * factor).toFixed(1));
      }

      // Title-case clean name
      const primaryName = bestFood.names[0]
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      parsedItems.push({
        name: primaryName,
        quantity,
        unit,
        calories,
        protein,
        carbs,
        fats,
      });
    } else {
      // Unrecognized food fallback: assign conservative standard estimates
      const cleanName = part
        .replace(/\b(\d+(?:\.\d+)?)\b/g, "")
        .replace(/\b(g|grams|ml|cup|cups|slice|slices|bowl|piece|pieces|plate)\b/gi, "")
        .trim();
      const displayName = cleanName
        ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
        : part;

      parsedItems.push({
        name: displayName,
        quantity,
        unit: specifiedUnit || "serving",
        calories: Math.round(150 * quantity),
        protein: Number((5 * quantity).toFixed(1)),
        carbs: Number((20 * quantity).toFixed(1)),
        fats: Number((5 * quantity).toFixed(1)),
        isEstimate: true,
      });
    }
  }

  const totals = parsedItems.reduce(
    (acc, it) => {
      acc.calories += it.calories || 0;
      acc.protein = Number((acc.protein + (it.protein || 0)).toFixed(1));
      acc.carbs = Number((acc.carbs + (it.carbs || 0)).toFixed(1));
      acc.fats = Number((acc.fats + (it.fats || 0)).toFixed(1));
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const mealSlot = requestedMealSlot || inferMealSlot(input);

  return {
    mealSlot,
    items: parsedItems,
    totals,
    source: "offline-nlp",
  };
};

/**
 * Call Gemini API with structured JSON output if GEMINI_API_KEY is present
 */
const callGeminiNutrition = (promptText, requestedMealSlot = null) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Promise.reject(new Error("No GEMINI_API_KEY"));

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a certified sports nutritionist and macro calculation AI for FitTogether.
Analyze this meal logged by an athlete:
"${promptText}"

Return ONLY valid JSON matching this exact structure:
{
  "mealSlot": "Breakfast" | "Lunch" | "Snack" | "Dinner",
  "items": [
    {
      "name": "string (clean food title)",
      "quantity": number,
      "unit": "g" | "ml" | "piece" | "slice" | "scoop" | "bowl" | "cup" | "tbsp" | "serving",
      "calories": number (whole kcal),
      "protein": number (grams, 1 decimal),
      "carbs": number (grams, 1 decimal),
      "fats": number (grams, 1 decimal)
    }
  ],
  "totals": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fats": number
  }
}
If meal slot was not explicitly specified, infer the most appropriate one from the food and quantity.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data);
            const rawText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              const result = JSON.parse(rawText);
              if (requestedMealSlot) result.mealSlot = requestedMealSlot;
              result.source = "gemini-ai";
              return resolve(result);
            }
          }
          reject(new Error(`Gemini API responded with status ${res.statusCode}`));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Gemini API timed out"));
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Main AI Meal Parser:
 * Tries Gemini first if API key is configured; seamlessly falls back to offline NLP.
 */
const parseMealWithAI = async (input, requestedMealSlot = null) => {
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiResult = await callGeminiNutrition(input, requestedMealSlot);
      if (geminiResult && geminiResult.items && geminiResult.items.length > 0) {
        return geminiResult;
      }
    } catch (err) {
      // Fallback seamlessly to offline NLP
    }
  }

  return parseMealOffline(input, requestedMealSlot);
};

module.exports = {
  parseMealWithAI,
  parseMealOffline,
  inferMealSlot,
  FOOD_DATABASE,
};
