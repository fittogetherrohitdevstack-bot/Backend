/**
 * Test Suite for Extra Diet Memory and Selection System
 */
const axios = require("../../frontend/node_modules/axios");

const BASE_URL = "http://localhost:5000";

async function runTest() {
  console.log("=== Starting Extra Diet Memory & Selection Test ===");

  const timestamp = Date.now();
  const testUser = {
    name: "Extra Diet Tester",
    email: `extra_tester_${timestamp}@example.com`,
    password: "Password123!",
  };

  try {
    // 1. Register User
    console.log("1. Registering test user:", testUser.email);
    const regRes = await axios.post(`${BASE_URL}/api/auth/register`, testUser);
    const token = regRes.data?.data?.accessToken || regRes.data?.data?.token;
    if (!token) throw new Error("No token returned from register");

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    // 2. Initial check of GET /api/meals/extras (should be empty array)
    console.log("2. Checking initial extras list...");
    const initExtrasRes = await axios.get(`${BASE_URL}/api/meals/extras`, authHeaders);
    console.log("   Initial extras count:", initExtrasRes.data?.data?.extras?.length);
    if (!Array.isArray(initExtrasRes.data?.data?.extras)) {
      throw new Error("extras is not an array");
    }

    // 3. Get / initialize today's meal chart
    const todayStr = new Date().toISOString().slice(0, 10);
    console.log("3. Fetching day chart for:", todayStr);
    const dayRes = await axios.get(`${BASE_URL}/api/meals/day?date=${todayStr}`, authHeaders);
    let meals = dayRes.data?.data?.mealLog?.meals || [];

    // If no meals exist, save starter chart
    if (meals.length === 0) {
      console.log("   Initializing starter meals...");
      const saveRes = await axios.put(
        `${BASE_URL}/api/meals/day?date=${todayStr}`,
        {
          meals: [
            {
              mealName: "Breakfast",
              scheduledTime: "08:30",
              plannedFoodItems: [
                { name: "Oats", quantity: 60, unit: "g", calories: 230, protein: 8, carbs: 40, fats: 4 },
              ],
            },
            {
              mealName: "Lunch",
              scheduledTime: "13:30",
              plannedFoodItems: [
                { name: "Rice & Chicken", quantity: 200, unit: "g", calories: 350, protein: 35, carbs: 40, fats: 5 },
              ],
            },
          ],
        },
        authHeaders
      );
      meals = saveRes.data?.data?.mealLog?.meals || [];
    }

    const targetMeal = meals[0];
    const mealId = targetMeal.mealId || targetMeal._id;
    console.log("   Using mealId:", mealId, "(", targetMeal.mealName, ")");

    // 4. Log 1st Extra Food Item: "Almond Butter Toast"
    console.log("4. Adding 1st Extra Item: Almond Butter Toast...");
    const extraItem1 = {
      name: "Almond Butter Toast",
      quantity: 2,
      unit: "slices",
      calories: 285,
      protein: 11,
      carbs: 34,
      fats: 13,
      eaten: true,
    };

    const addRes1 = await axios.post(
      `${BASE_URL}/api/meals/day/items`,
      {
        date: todayStr,
        mealId,
        item: extraItem1,
      },
      authHeaders
    );
    console.log("   Added status:", addRes1.data?.success ? "SUCCESS" : "FAIL");

    // 5. Verify GET /api/meals/extras now remembers "Almond Butter Toast"
    console.log("5. Checking GET /api/meals/extras for remembered item...");
    const checkRes1 = await axios.get(`${BASE_URL}/api/meals/extras`, authHeaders);
    const extrasList1 = checkRes1.data?.data?.extras || [];
    console.log("   Remembered extras count:", extrasList1.length);
    const found1 = extrasList1.find((e) => e.name.toLowerCase() === "almond butter toast");
    if (!found1) throw new Error("Almond Butter Toast was NOT found in extras!");
    console.log("   Found Extra 1:", found1.name, "Calories:", found1.calories, "Protein:", found1.protein);
    if (found1.calories !== 285 || found1.protein !== 11 || found1.fats !== 13) {
      throw new Error("Macro values mismatch for Extra 1");
    }

    // 6. Log 2nd Extra Food Item: "Whey Isolate Shake"
    console.log("6. Adding 2nd Extra Item: Whey Isolate Shake...");
    const extraItem2 = {
      name: "Whey Isolate Shake",
      quantity: 1,
      unit: "scoop",
      calories: 125,
      protein: 27,
      carbs: 2,
      fats: 1,
      eaten: true,
    };

    await axios.post(
      `${BASE_URL}/api/meals/day/items`,
      {
        date: todayStr,
        mealId,
        item: extraItem2,
      },
      authHeaders
    );

    // 7. Verify GET /api/meals/extras now remembers BOTH extras
    console.log("7. Verifying both extras remembered in user's library...");
    const checkRes2 = await axios.get(`${BASE_URL}/api/meals/extras`, authHeaders);
    const extrasList2 = checkRes2.data?.data?.extras || [];
    console.log("   Updated extras count:", extrasList2.length);

    const names = extrasList2.map((e) => e.name);
    console.log("   Extras in library:", names);
    if (!names.includes("Almond Butter Toast") || !names.includes("Whey Isolate Shake")) {
      throw new Error("Library does not contain both items");
    }

    console.log("\n>>> ALL TESTS PASSED! Extra Diet Memory & Selection API is 100% functional! <<<");
  } catch (err) {
    console.error("Test failed with error:", err.response?.data || err.message);
    process.exit(1);
  }
}

runTest();
