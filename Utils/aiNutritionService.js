const https = require("https");
const AiNutritionCache = require("../Modals/AiNutritionCache");

/**
 * Built-in Verified Nutrition Database (per standard serving / unit)
 * 130+ Popular Fitness, Indian, Continental & Everyday Foods.
 * Verified against standard USDA and IFCT nutrition datasets.
 */
const FOOD_DATABASE = [
  // ==========================================
  // 1. EGGS & POULTRY
  // ==========================================
  {
    names: ["boiled egg", "boiled eggs", "egg", "eggs", "whole egg", "whole eggs", "hard boiled egg"],
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
    names: ["omelette", "omelet", "egg omelette", "egg omelet"],
    defaultUnit: "piece",
    unitWeightG: 70,
    perUnit: { calories: 130, protein: 7.5, carbs: 1.2, fats: 10.0 },
  },
  {
    names: ["scrambled egg", "scrambled eggs", "egg bhurji"],
    defaultUnit: "bowl",
    unitWeightG: 120,
    perUnit: { calories: 185, protein: 12.0, carbs: 3.0, fats: 14.0 },
  },
  {
    names: ["fried egg", "sunny side up", "poached egg"],
    defaultUnit: "piece",
    unitWeightG: 50,
    perUnit: { calories: 90, protein: 6.2, carbs: 0.4, fats: 7.0 },
  },
  {
    names: ["chicken breast", "boiled chicken breast", "raw chicken breast"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 165, protein: 31.0, carbs: 0.0, fats: 3.6 },
  },
  {
    names: ["grilled chicken", "roast chicken", "roasted chicken", "chicken"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 185, protein: 28.0, carbs: 0.0, fats: 7.5 },
  },
  {
    names: ["chicken thigh", "chicken leg"],
    defaultUnit: "piece",
    unitWeightG: 100,
    perUnit: { calories: 210, protein: 24.0, carbs: 0.0, fats: 12.0 },
  },
  {
    names: ["chicken curry", "chicken gravy", "homemade chicken curry"],
    defaultUnit: "bowl",
    unitWeightG: 180,
    perUnit: { calories: 260, protein: 24.0, carbs: 7.0, fats: 15.0 },
  },
  {
    names: ["butter chicken", "murgh makhani"],
    defaultUnit: "bowl",
    unitWeightG: 200,
    perUnit: { calories: 380, protein: 26.0, carbs: 12.0, fats: 25.0 },
  },
  {
    names: ["tandoori chicken", "chicken tikka"],
    defaultUnit: "piece",
    unitWeightG: 120,
    perUnit: { calories: 190, protein: 26.0, carbs: 3.5, fats: 8.0 },
  },
  {
    names: ["chicken biryani", "biryani"],
    defaultUnit: "plate",
    unitWeightG: 300,
    perUnit: { calories: 480, protein: 24.0, carbs: 58.0, fats: 16.0 },
  },
  {
    names: ["turkey breast", "sliced turkey"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 135, protein: 30.0, carbs: 0.0, fats: 1.5 },
  },

  // ==========================================
  // 2. DAIRY, PROTEIN & PLANT ALTERNATIVES
  // ==========================================
  {
    names: ["whey protein", "whey", "protein powder", "whey isolate", "protein shake"],
    defaultUnit: "scoop",
    unitWeightG: 32,
    perUnit: { calories: 125, protein: 25.0, carbs: 2.0, fats: 1.5 },
  },
  {
    names: ["casein protein", "casein"],
    defaultUnit: "scoop",
    unitWeightG: 32,
    perUnit: { calories: 120, protein: 24.0, carbs: 1.5, fats: 1.0 },
  },
  {
    names: ["paneer", "cottage cheese", "raw paneer", "fresh paneer"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 265, protein: 18.0, carbs: 3.5, fats: 20.0 },
  },
  {
    names: ["low fat paneer", "diet paneer"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 175, protein: 24.0, carbs: 4.0, fats: 7.0 },
  },
  {
    names: ["paneer bhurji"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 280, protein: 18.0, carbs: 6.0, fats: 20.0 },
  },
  {
    names: ["tofu", "soya paneer", "firm tofu"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 80, protein: 9.0, carbs: 2.0, fats: 4.5 },
  },
  {
    names: [
      "soy chunks",
      "soya chunks",
      "soyachunks",
      "soychunks",
      "soya chunk",
      "soy chunk",
      "soya nuggets",
      "meal maker",
      "soyabeans",
      "soya beans",
      "soyabean",
      "soybean",
      "soybeans",
      "soya",
    ],
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
    names: ["curd", "dahi", "plain yogurt", "yogurt"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 98, protein: 5.0, carbs: 7.0, fats: 4.5 },
  },
  {
    names: ["cow milk", "milk", "toned milk"],
    defaultUnit: "ml",
    baseServing: 200,
    per100g: { calories: 60, protein: 3.2, carbs: 4.8, fats: 3.2 },
  },
  {
    names: ["skimmed milk", "skim milk", "fat free milk"],
    defaultUnit: "ml",
    baseServing: 200,
    per100g: { calories: 35, protein: 3.4, carbs: 5.0, fats: 0.2 },
  },
  {
    names: ["almond milk", "unsweetened almond milk"],
    defaultUnit: "ml",
    baseServing: 200,
    per100g: { calories: 15, protein: 0.5, carbs: 0.3, fats: 1.2 },
  },
  {
    names: ["soy milk", "soya milk"],
    defaultUnit: "ml",
    baseServing: 200,
    per100g: { calories: 45, protein: 3.3, carbs: 2.5, fats: 1.8 },
  },
  {
    names: ["butter", "salted butter", "white butter", "makhan"],
    defaultUnit: "tbsp",
    unitWeightG: 14,
    perUnit: { calories: 102, protein: 0.1, carbs: 0.0, fats: 11.5 },
  },
  {
    names: ["ghee", "clarified butter", "desi ghee"],
    defaultUnit: "tbsp",
    unitWeightG: 14,
    perUnit: { calories: 112, protein: 0.0, carbs: 0.0, fats: 12.7 },
  },
  {
    names: ["cheese slice", "cheddar cheese", "slice of cheese"],
    defaultUnit: "slice",
    unitWeightG: 20,
    perUnit: { calories: 70, protein: 4.5, carbs: 0.5, fats: 5.5 },
  },
  {
    names: ["mozzarella cheese", "mozzarella"],
    defaultUnit: "g",
    baseServing: 30,
    per100g: { calories: 280, protein: 22.0, carbs: 2.2, fats: 21.0 },
  },

  // ==========================================
  // 3. SEAFOOD & FISH
  // ==========================================
  {
    names: ["salmon", "grilled salmon", "baked salmon"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 206, protein: 22.0, carbs: 0.0, fats: 12.0 },
  },
  {
    names: ["tuna", "canned tuna", "tuna in water"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 115, protein: 26.0, carbs: 0.0, fats: 0.8 },
  },
  {
    names: ["tilapia", "white fish", "cod", "rohu fish", "fish"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 105, protein: 21.0, carbs: 0.0, fats: 2.0 },
  },
  {
    names: ["prawns", "shrimp", "grilled prawns"],
    defaultUnit: "g",
    baseServing: 100,
    per100g: { calories: 90, protein: 20.0, carbs: 0.5, fats: 1.0 },
  },

  // ==========================================
  // 4. GRAINS, BREADS & INDIAN STAPLES
  // ==========================================
  {
    names: ["roti", "chapati", "phulka"],
    defaultUnit: "piece",
    unitWeightG: 35,
    perUnit: { calories: 85, protein: 3.0, carbs: 17.0, fats: 0.5 },
  },
  {
    names: ["aloo paratha", "potato paratha"],
    defaultUnit: "piece",
    unitWeightG: 100,
    perUnit: { calories: 240, protein: 5.0, carbs: 36.0, fats: 9.0 },
  },
  {
    names: ["paneer paratha"],
    defaultUnit: "piece",
    unitWeightG: 110,
    perUnit: { calories: 280, protein: 10.0, carbs: 32.0, fats: 12.0 },
  },
  {
    names: ["plain paratha", "paratha"],
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
    names: ["multigrain bread", "seeded bread"],
    defaultUnit: "slice",
    unitWeightG: 35,
    perUnit: { calories: 85, protein: 4.0, carbs: 14.0, fats: 1.5 },
  },
  {
    names: ["sourdough", "sourdough bread"],
    defaultUnit: "slice",
    unitWeightG: 45,
    perUnit: { calories: 110, protein: 4.0, carbs: 22.0, fats: 0.8 },
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
    names: ["jeera rice"],
    defaultUnit: "bowl",
    unitWeightG: 160,
    perUnit: { calories: 220, protein: 4.2, carbs: 44.0, fats: 3.5 },
  },
  {
    names: ["poha", "flattened rice"],
    defaultUnit: "plate",
    unitWeightG: 150,
    perUnit: { calories: 230, protein: 4.0, carbs: 44.0, fats: 4.5 },
  },
  {
    names: ["upma", "rava upma", "sooji upma"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 210, protein: 4.5, carbs: 36.0, fats: 5.0 },
  },
  {
    names: ["idli", "idlis", "steamed idli"],
    defaultUnit: "piece",
    unitWeightG: 45,
    perUnit: { calories: 58, protein: 2.0, carbs: 12.0, fats: 0.2 },
  },
  {
    names: ["masala dosa"],
    defaultUnit: "piece",
    unitWeightG: 150,
    perUnit: { calories: 260, protein: 5.5, carbs: 42.0, fats: 8.0 },
  },
  {
    names: ["plain dosa", "dosa"],
    defaultUnit: "piece",
    unitWeightG: 100,
    perUnit: { calories: 168, protein: 3.9, carbs: 28.0, fats: 4.2 },
  },
  {
    names: ["uttapam", "onion uttapam"],
    defaultUnit: "piece",
    unitWeightG: 120,
    perUnit: { calories: 190, protein: 4.5, carbs: 32.0, fats: 5.0 },
  },
  {
    names: ["thepla", "methi thepla"],
    defaultUnit: "piece",
    unitWeightG: 40,
    perUnit: { calories: 110, protein: 3.0, carbs: 16.0, fats: 3.8 },
  },
  {
    names: ["quinoa", "cooked quinoa"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 180, protein: 6.5, carbs: 32.0, fats: 3.0 },
  },
  {
    names: ["pasta", "cooked pasta", "white pasta"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 220, protein: 7.5, carbs: 43.0, fats: 1.2 },
  },
  {
    names: ["maggi", "noodles", "instant noodles"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 310, protein: 6.0, carbs: 46.0, fats: 11.5 },
  },

  // ==========================================
  // 5. DALS, LEGUMES & BEANS
  // ==========================================
  {
    names: ["moong dal", "yellow dal", "dal tadka", "toor dal", "arhar dal", "dal"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 145, protein: 8.5, carbs: 22.0, fats: 3.0 },
  },
  {
    names: ["dal makhani"],
    defaultUnit: "bowl",
    unitWeightG: 180,
    perUnit: { calories: 280, protein: 10.0, carbs: 28.0, fats: 14.0 },
  },
  {
    names: ["chana dal", "bengal gram dal"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 160, protein: 9.5, carbs: 24.0, fats: 3.0 },
  },
  {
    names: ["rajma", "kidney beans", "rajma curry", "rajma masala"],
    defaultUnit: "bowl",
    unitWeightG: 180,
    perUnit: { calories: 210, protein: 10.5, carbs: 33.0, fats: 4.0 },
  },
  {
    names: ["chole", "chana", "chickpeas curry", "chana masala"],
    defaultUnit: "bowl",
    unitWeightG: 180,
    perUnit: { calories: 230, protein: 11.0, carbs: 34.0, fats: 5.5 },
  },
  {
    names: ["kala chana", "black chickpeas", "boiled chana"],
    defaultUnit: "bowl",
    unitWeightG: 120,
    perUnit: { calories: 170, protein: 10.0, carbs: 28.0, fats: 2.5 },
  },
  {
    names: ["sprouts", "moong sprouts", "boiled sprouts"],
    defaultUnit: "bowl",
    unitWeightG: 100,
    perUnit: { calories: 85, protein: 7.0, carbs: 14.0, fats: 0.5 },
  },

  // ==========================================
  // 6. NUTS, SEEDS & SPREADS
  // ==========================================
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
  {
    names: ["cashews", "kaju"],
    defaultUnit: "piece",
    unitWeightG: 1.5,
    perUnit: { calories: 9, protein: 0.3, carbs: 0.5, fats: 0.7 },
  },
  {
    names: ["peanuts", "roasted peanuts", "moongfali"],
    defaultUnit: "tbsp",
    unitWeightG: 15,
    perUnit: { calories: 85, protein: 3.8, carbs: 2.4, fats: 7.2 },
  },
  {
    names: ["chia seeds"],
    defaultUnit: "tbsp",
    unitWeightG: 12,
    perUnit: { calories: 60, protein: 2.0, carbs: 5.0, fats: 3.8 },
  },
  {
    names: ["flax seeds"],
    defaultUnit: "tbsp",
    unitWeightG: 10,
    perUnit: { calories: 55, protein: 1.9, carbs: 3.0, fats: 4.2 },
  },

  // ==========================================
  // 7. FRUITS
  // ==========================================
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
    names: ["papaya", "papita"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 65, protein: 0.8, carbs: 16.0, fats: 0.3 },
  },
  {
    names: ["watermelon", "tarbooz"],
    defaultUnit: "bowl",
    unitWeightG: 200,
    perUnit: { calories: 60, protein: 1.2, carbs: 15.0, fats: 0.3 },
  },
  {
    names: ["mango", "aam"],
    defaultUnit: "piece",
    unitWeightG: 180,
    perUnit: { calories: 120, protein: 1.5, carbs: 30.0, fats: 0.6 },
  },
  {
    names: ["blueberries", "berries", "strawberries"],
    defaultUnit: "bowl",
    unitWeightG: 100,
    perUnit: { calories: 57, protein: 0.7, carbs: 14.0, fats: 0.3 },
  },
  {
    names: ["kiwi"],
    defaultUnit: "piece",
    unitWeightG: 70,
    perUnit: { calories: 42, protein: 0.8, carbs: 10.0, fats: 0.4 },
  },
  {
    names: ["pomegranate", "anaar"],
    defaultUnit: "bowl",
    unitWeightG: 120,
    perUnit: { calories: 100, protein: 2.0, carbs: 22.0, fats: 1.4 },
  },

  // ==========================================
  // 8. VEGETABLES & GREENS
  // ==========================================
  {
    names: ["mixed salad", "green salad", "salad", "cucumber", "kheera"],
    defaultUnit: "bowl",
    unitWeightG: 120,
    perUnit: { calories: 35, protein: 1.5, carbs: 7.0, fats: 0.2 },
  },
  {
    names: ["sweet potato", "shakarkandi"],
    defaultUnit: "piece",
    unitWeightG: 130,
    perUnit: { calories: 112, protein: 2.0, carbs: 26.0, fats: 0.1 },
  },
  {
    names: ["boiled potato", "potato", "aloo"],
    defaultUnit: "piece",
    unitWeightG: 120,
    perUnit: { calories: 105, protein: 2.5, carbs: 24.0, fats: 0.2 },
  },
  {
    names: ["broccoli", "steamed broccoli"],
    defaultUnit: "bowl",
    unitWeightG: 100,
    perUnit: { calories: 35, protein: 2.8, carbs: 7.0, fats: 0.4 },
  },
  {
    names: ["spinach", "palak", "cooked spinach"],
    defaultUnit: "bowl",
    unitWeightG: 100,
    perUnit: { calories: 30, protein: 3.0, carbs: 4.0, fats: 0.5 },
  },
  {
    names: ["bhindi", "okra"],
    defaultUnit: "bowl",
    unitWeightG: 120,
    perUnit: { calories: 90, protein: 2.5, carbs: 10.0, fats: 4.5 },
  },
  {
    names: ["cauliflower", "gobi", "aloo gobi"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 120, protein: 3.5, carbs: 15.0, fats: 5.0 },
  },
  {
    names: ["mixed vegetables", "mix veg sabzi", "sabzi"],
    defaultUnit: "bowl",
    unitWeightG: 150,
    perUnit: { calories: 130, protein: 3.5, carbs: 16.0, fats: 6.0 },
  },

  // ==========================================
  // 9. PREPARED MEALS & FAST CASUAL
  // ==========================================
  {
    names: ["veg sandwich", "vegetable sandwich"],
    defaultUnit: "piece",
    unitWeightG: 150,
    perUnit: { calories: 230, protein: 6.0, carbs: 38.0, fats: 6.0 },
  },
  {
    names: ["chicken sandwich", "grilled chicken sandwich"],
    defaultUnit: "piece",
    unitWeightG: 180,
    perUnit: { calories: 350, protein: 26.0, carbs: 36.0, fats: 10.0 },
  },
  {
    names: ["egg sandwich"],
    defaultUnit: "piece",
    unitWeightG: 150,
    perUnit: { calories: 280, protein: 14.0, carbs: 30.0, fats: 11.0 },
  },
  {
    names: ["grilled cheese sandwich", "cheese sandwich"],
    defaultUnit: "piece",
    unitWeightG: 140,
    perUnit: { calories: 320, protein: 12.0, carbs: 32.0, fats: 16.0 },
  },
  {
    names: ["paneer wrap", "paneer roll"],
    defaultUnit: "piece",
    unitWeightG: 180,
    perUnit: { calories: 360, protein: 15.0, carbs: 42.0, fats: 15.0 },
  },
  {
    names: ["chicken wrap", "chicken roll", "shawarma"],
    defaultUnit: "piece",
    unitWeightG: 200,
    perUnit: { calories: 390, protein: 24.0, carbs: 44.0, fats: 13.0 },
  },
  {
    names: ["veg burger"],
    defaultUnit: "piece",
    unitWeightG: 180,
    perUnit: { calories: 380, protein: 9.0, carbs: 50.0, fats: 16.0 },
  },
  {
    names: ["chicken burger"],
    defaultUnit: "piece",
    unitWeightG: 200,
    perUnit: { calories: 440, protein: 24.0, carbs: 46.0, fats: 18.0 },
  },
  {
    names: ["pizza slice", "cheese pizza", "margherita pizza"],
    defaultUnit: "slice",
    unitWeightG: 100,
    perUnit: { calories: 270, protein: 11.0, carbs: 32.0, fats: 11.0 },
  },

  // ==========================================
  // 10. BEVERAGES & HEALTHY SNACKS
  // ==========================================
  {
    names: ["black coffee", "espresso", "americano"],
    defaultUnit: "cup",
    unitWeightG: 200,
    perUnit: { calories: 4, protein: 0.3, carbs: 0.5, fats: 0.0 },
  },
  {
    names: ["coffee with milk", "coffee", "latte", "cappuccino", "flat white"],
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
    names: ["chai", "tea", "indian tea", "milk tea", "masala chai"],
    defaultUnit: "cup",
    unitWeightG: 150,
    perUnit: { calories: 95, protein: 3.0, carbs: 12.0, fats: 3.5 },
  },
  {
    names: ["coconut water", "nariyal pani"],
    defaultUnit: "glass",
    unitWeightG: 240,
    perUnit: { calories: 45, protein: 1.5, carbs: 9.0, fats: 0.5 },
  },
  {
    names: ["roasted makhana", "makhana", "fox nuts"],
    defaultUnit: "bowl",
    unitWeightG: 30,
    perUnit: { calories: 105, protein: 3.0, carbs: 20.0, fats: 0.5 },
  },
  {
    names: ["dhokla"],
    defaultUnit: "piece",
    unitWeightG: 50,
    perUnit: { calories: 80, protein: 2.5, carbs: 13.0, fats: 2.0 },
  },
  {
    names: ["samosa"],
    defaultUnit: "piece",
    unitWeightG: 80,
    perUnit: { calories: 260, protein: 4.0, carbs: 28.0, fats: 15.0 },
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
 * Preprocess input to normalize units and common compound food words.
 * Examples:
 * "25g soyachunks" -> "25 g soya chunks"
 * "200ml milk" -> "200 ml milk"
 * "2tbsp peanutbutter" -> "2 tbsp peanut butter"
 */
const preprocessNutritionText = (input = "") => {
  let text = String(input || "").toLowerCase().trim();

  // Separate numbers and attached units (e.g. "25g" -> "25 g", "200ml" -> "200 ml")
  text = text.replace(/(\d+(?:\.\d+)?)([a-zA-Z]+)/g, "$1 $2");
  text = text.replace(/([a-zA-Z]+)(\d+(?:\.\d+)?)/g, "$1 $2");

  // Normalize common compound food names so users can type with or without spaces
  const compoundReplacements = [
    { regex: /\bsoya?\s*chunks?\b|\bsoya?chunks?\b|\bsoya?nuggets?\b/gi, to: "soya chunks" },
    { regex: /\bsoya?\s*beans?\b|\bsoya?beans?\b/gi, to: "soya chunks" },
    { regex: /\bpeanut\s*butter\b|\bpeanutbutter\b/gi, to: "peanut butter" },
    { regex: /\bbrown\s*bread\b|\bbrownbread\b/gi, to: "brown bread" },
    { regex: /\bwhite\s*bread\b|\bwhitebread\b/gi, to: "white bread" },
    { regex: /\bboiled\s*eggs?\b|\bboiledeggs?\b/gi, to: "boiled egg" },
    { regex: /\begg\s*whites?\b|\beggwhites?\b/gi, to: "egg white" },
    { regex: /\bchicken\s*breast\b|\bchickenbreast\b/gi, to: "chicken breast" },
    { regex: /\bwhey\s*protein\b|\bwheyprotein\b/gi, to: "whey protein" },
    { regex: /\bsweet\s*potatoes?\b|\bsweetpotatoes?\b|\bsweetpotato\b/gi, to: "sweet potato" },
    { regex: /\bblack\s*coffee\b|\bblackcoffee\b/gi, to: "black coffee" },
    { regex: /\bgreen\s*tea\b|\bgreentea\b/gi, to: "green tea" },
    { regex: /\b(gms?|gm)\b/gi, to: "g" },
  ];

  for (const { regex, to } of compoundReplacements) {
    text = text.replace(regex, to);
  }

  return text;
};

/**
 * Clean & normalize input query for exact deterministic caching.
 */
const normalizeNutritionQuery = (text = "") => {
  return preprocessNutritionText(text)
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Infer meal slot ("Breakfast", "Lunch", "Snack", "Dinner")
 * from text clues or current local hour.
 */
const inferMealSlot = (text = "", currentHour = new Date().getHours()) => {
  const lower = String(text).toLowerCase();
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
 * Parse natural language numbers & quantities (e.g. "2", "1/2", "1.5", "two", "150g")
 */
const extractQuantity = (phrase) => {
  // Check for fractions first (e.g. 1/2, 3/4)
  const fractionMatch = phrase.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const val = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
    return { quantity: Number(val.toFixed(2)), matchedStr: fractionMatch[0] };
  }

  // Check for decimals or integers (handles 150g, 200ml, 2.5)
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
 * Identify units in phrase (attached or detached)
 */
const extractUnit = (phrase) => {
  const lower = phrase.toLowerCase();
  if (/(?:^|\s|\d)(g|gm|gms|gram|grams)(?:$|\s)/i.test(lower)) return "g";
  if (/(?:^|\s|\d)(ml|milliliter|milliliters|millilitres)(?:$|\s)/i.test(lower)) return "ml";
  if (/(?:^|\s|\d)(kg|kgs|kilo|kilogram|kilograms)(?:$|\s)/i.test(lower)) return "kg";
  if (/(?:^|\s|\d)(scoop|scoops)(?:$|\s)/i.test(lower)) return "scoop";
  if (/(?:^|\s|\d)(slice|slices)(?:$|\s)/i.test(lower)) return "slice";
  if (/(?:^|\s|\d)(bowl|bowls|katori)(?:$|\s)/i.test(lower)) return "bowl";
  if (/(?:^|\s|\d)(cup|cups)(?:$|\s)/i.test(lower)) return "cup";
  if (/(?:^|\s|\d)(plate|plates)(?:$|\s)/i.test(lower)) return "plate";
  if (/(?:^|\s|\d)(tbsp|tablespoon|tablespoons)(?:$|\s)/i.test(lower)) return "tbsp";
  if (/(?:^|\s|\d)(tsp|teaspoon|teaspoons)(?:$|\s)/i.test(lower)) return "tsp";
  if (/(?:^|\s|\d)(piece|pieces|pcs|pc)(?:$|\s)/i.test(lower)) return "piece";
  if (/(?:^|\s|\d)(glass|glasses)(?:$|\s)/i.test(lower)) return "glass";
  return null;
};

/**
 * Intelligent heuristic macro estimator for unknown items
 */
const getHeuristicMacroForUnknown = (name = "", quantity = 1) => {
  const lower = name.toLowerCase();
  let base = { calories: 160, protein: 6, carbs: 22, fats: 5 };

  if (/shake|smoothie|frappe/.test(lower)) {
    base = { calories: 280, protein: 15, carbs: 42, fats: 6 };
  } else if (/sandwich|toastie/.test(lower)) {
    base = { calories: 320, protein: 14, carbs: 38, fats: 12 };
  } else if (/burger/.test(lower)) {
    base = { calories: 450, protein: 22, carbs: 40, fats: 22 };
  } else if (/pizza/.test(lower)) {
    base = { calories: 280, protein: 12, carbs: 32, fats: 11 };
  } else if (/salad/.test(lower)) {
    base = { calories: 120, protein: 4, carbs: 12, fats: 6 };
  } else if (/soup/.test(lower)) {
    base = { calories: 110, protein: 5, carbs: 14, fats: 4 };
  } else if (/wrap|roll|shawarma|burrito/.test(lower)) {
    base = { calories: 360, protein: 18, carbs: 42, fats: 13 };
  } else if (/curry|gravy|sabzi|sabji/.test(lower)) {
    base = { calories: 210, protein: 8, carbs: 16, fats: 13 };
  } else if (/biryani|pulao|fried rice/.test(lower)) {
    base = { calories: 360, protein: 14, carbs: 52, fats: 10 };
  } else if (/cookie|biscuit/.test(lower)) {
    base = { calories: 95, protein: 1.5, carbs: 14, fats: 4 };
  } else if (/cake|pastry|muffin|brownie|donut|doughnut/.test(lower)) {
    base = { calories: 310, protein: 4.5, carbs: 42, fats: 14 };
  } else if (/juice/.test(lower)) {
    base = { calories: 110, protein: 1, carbs: 26, fats: 0.2 };
  } else if (/beer|wine|whiskey|alcohol|cocktail/.test(lower)) {
    base = { calories: 150, protein: 1, carbs: 13, fats: 0 };
  } else if (/snack|chips|crisps|fries|nachos/.test(lower)) {
    base = { calories: 220, protein: 3, carbs: 26, fats: 12 };
  }

  return {
    calories: Math.round(base.calories * quantity),
    protein: Number((base.protein * quantity).toFixed(1)),
    carbs: Number((base.carbs * quantity).toFixed(1)),
    fats: Number((base.fats * quantity).toFixed(1)),
    isEstimate: true,
  };
};

/**
 * Offline Intelligent NLP Nutrition Parser
 */
const parseMealOffline = (input = "", requestedMealSlot = null) => {
  const cleanInput = preprocessNutritionText(input);
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
  let allMatchedVerified = true;

  for (const part of rawParts) {
    const lowerPart = part.toLowerCase();
    let { quantity } = extractQuantity(lowerPart);
    let specifiedUnit = extractUnit(lowerPart);

    if (specifiedUnit === "kg") {
      quantity = quantity * 1000;
      specifiedUnit = "g";
    }

    // Find best match in FOOD_DATABASE (longest name match first)
    let bestFood = null;
    let bestMatchLen = 0;

    for (const food of FOOD_DATABASE) {
      for (const name of food.names) {
        // Use word boundary or substring inclusion
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if ((regex.test(lowerPart) || lowerPart.includes(name)) && name.length > bestMatchLen) {
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
        // Unit-based item (egg, slice, scoop, bowl)
        let multiplier = quantity;
        if (unit === "g" && bestFood.unitWeightG) {
          multiplier = quantity / bestFood.unitWeightG;
        }
        calories = Math.round(bestFood.perUnit.calories * multiplier);
        protein = Number((bestFood.perUnit.protein * multiplier).toFixed(1));
        carbs = Number((bestFood.perUnit.carbs * multiplier).toFixed(1));
        fats = Number((bestFood.perUnit.fats * multiplier).toFixed(1));
      } else if (bestFood.per100g) {
        // Weight-based item
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
        isEstimate: false,
      });
    } else {
      allMatchedVerified = false;
      const cleanName = part
        .replace(/\d+(?:\.\d+)?\s*(?:g|gm|gms|grams|ml|kg|cup|cups|slice|slices|bowl|piece|pieces|plate|serving|tbsp|tsp)?/gi, "")
        .trim();
      const displayName = cleanName
        ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
        : part;

      const unit = specifiedUnit || "serving";
      let effectiveQuantity = quantity;
      if (unit === "g" || unit === "ml") {
        effectiveQuantity = quantity / 100;
      }
      const heuristic = getHeuristicMacroForUnknown(displayName, effectiveQuantity);

      parsedItems.push({
        name: displayName,
        quantity,
        unit,
        calories: heuristic.calories,
        protein: heuristic.protein,
        carbs: heuristic.carbs,
        fats: heuristic.fats,
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
    source: allMatchedVerified && parsedItems.length > 0 ? "verified-db" : "offline-nlp",
  };
};

const geminiHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5 });

/**
 * Perform HTTPS call to Gemini model endpoint
 */
const requestGeminiModel = (modelName, payload, apiKey) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: "POST",
      agent: geminiHttpsAgent,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
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
              return resolve(result);
            }
          }
          reject(new Error(`Model ${modelName} returned status ${res.statusCode}: ${data.slice(0, 100)}`));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Model ${modelName} timed out after 15s`));
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Call Gemini Flash for high-precision nutrition estimation
 */
const callGeminiNutrition = async (promptText, requestedMealSlot = null) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("No GEMINI_API_KEY");

  const systemPrompt = `You are a certified sports nutritionist and macro calculation AI for FitTogether.
Analyze this meal logged by an athlete:
"${promptText}"

Follow these rules:
1. Parse every food item with reasonable quantity and standard unit.
2. Standardize units to: "piece", "slice", "scoop", "bowl", "cup", "g", "ml", "tbsp", "serving".
3. Calculate calories, protein (g), carbs (g), and fats (g). Ensure calories roughly match (protein*4 + carbs*4 + fats*9).
4. Example: "25g soyachunks" -> name: "Soya Chunks", quantity: 25, unit: "g", calories: 86, protein: 13, carbs: 8, fats: 0.1.
5. Return ONLY valid JSON matching this schema:
{
  "mealSlot": "Breakfast" | "Lunch" | "Snack" | "Dinner",
  "items": [
    {
      "name": "Clean Title Food Name",
      "quantity": 1,
      "unit": "piece" | "slice" | "scoop" | "bowl" | "cup" | "g" | "ml" | "tbsp" | "serving",
      "calories": 150,
      "protein": 10.5,
      "carbs": 15.0,
      "fats": 5.0
    }
  ],
  "totals": {
    "calories": 150,
    "protein": 10.5,
    "carbs": 15.0,
    "fats": 5.0
  }
}`;

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  // Try available Gemini flash models in order
  const candidateModels = [
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
  ];

  for (const model of candidateModels) {
    try {
      const res = await requestGeminiModel(model, payload, apiKey);
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        if (requestedMealSlot) res.mealSlot = requestedMealSlot;
        res.source = "gemini-ai";
        return res;
      }
    } catch (modelErr) {
      console.warn(`[AI Nutrition] Model ${model} skipped:`, modelErr.message);
    }
  }

  throw new Error("All Gemini candidate models failed or unavailable");
};

/**
 * Cache lookup helper
 */
const checkNutritionCache = async (normalizedText) => {
  try {
    if (!normalizedText) return null;
    if (AiNutritionCache?.db?.readyState !== 1) return null;
    const cached = await AiNutritionCache.findOne({ normalizedText }).lean();
    if (cached && cached.items && cached.items.length > 0) {
      return {
        mealSlot: cached.mealSlot,
        items: cached.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fats: it.fats,
          isEstimate: it.isEstimate,
        })),
        totals: cached.totals,
        source: "cache",
        cachedAt: cached.updatedAt,
      };
    }
  } catch (err) {
    // Ignore cache lookup errors so execution continues seamlessly
  }
  return null;
};

/**
 * Cache save helper
 */
const saveNutritionCache = async ({ normalizedText, mealSlot, items, totals, source }) => {
  try {
    if (!normalizedText || !items || items.length === 0) return;
    if (AiNutritionCache?.db?.readyState !== 1) return;
    await AiNutritionCache.findOneAndUpdate(
      { normalizedText },
      {
        $set: {
          normalizedText,
          mealSlot: mealSlot || "Breakfast",
          items,
          totals,
          source: source || "gemini-ai",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Ignore cache save errors
  }
};

/**
 * Master AI Meal Parser:
 * 1. Checks MongoDB Deterministic Cache (returns in <5ms).
 * 2. If not cached, calls Gemini 2.0 / 1.5 Flash if key is present.
 * 3. Falls back seamlessly to offline 130+ verified item DB & smart heuristics.
 * 4. Saves newly resolved calculations to cache for instant subsequent calls.
 */
const parseMealWithAI = async (input, requestedMealSlot = null) => {
  const normalized = normalizeNutritionQuery(input);

  // 1. Check Deterministic Cache
  if (normalized) {
    const cachedResult = await checkNutritionCache(normalized);
    if (cachedResult) {
      if (requestedMealSlot) cachedResult.mealSlot = requestedMealSlot;
      return cachedResult;
    }
  }

  // 2. Try Gemini AI if API key is configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiResult = await callGeminiNutrition(input, requestedMealSlot);
      if (geminiResult && geminiResult.items && geminiResult.items.length > 0) {
        saveNutritionCache({
          normalizedText: normalized,
          mealSlot: geminiResult.mealSlot,
          items: geminiResult.items,
          totals: geminiResult.totals,
          source: "gemini-ai",
        }).catch(() => {});
        return geminiResult;
      }
    } catch (err) {
      // Fall through to offline parser
    }
  }

  // 3. High-fidelity Offline Parser
  const offlineResult = parseMealOffline(input, requestedMealSlot);

  // Cache offline calculation for speed and consistency
  if (normalized && offlineResult.items && offlineResult.items.length > 0) {
    saveNutritionCache({
      normalizedText: normalized,
      mealSlot: offlineResult.mealSlot,
      items: offlineResult.items,
      totals: offlineResult.totals,
      source: offlineResult.source,
    }).catch(() => {});
  }

  return offlineResult;
};

module.exports = {
  parseMealWithAI,
  parseMealOffline,
  inferMealSlot,
  normalizeNutritionQuery,
  checkNutritionCache,
  saveNutritionCache,
  FOOD_DATABASE,
};
