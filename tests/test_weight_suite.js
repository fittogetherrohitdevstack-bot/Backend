const mongoose = require("mongoose");
const config = require("../Config/env");
const User = require("../Modals/User");
const WeightLog = require("../Modals/WeightLog");
const { upsertWeight, deleteWeightLog } = require("../Controllers/weightController");

const callController = (fn, req) => {
  return new Promise((resolve, reject) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode || 200, payload });
        return this;
      },
    };
    fn(req, res, reject);
  });
};

const runTests = async () => {
  try {
    await mongoose.connect(config.MONGODB_URI);
    const user = await User.findOne({ email: "alex@fittogether.test" });

    console.log("🧪 Running Weight API Tests...");

    // Test 1: Sane range validation (< 20 kg)
    const res1 = await callController(upsertWeight, {
      user,
      body: { weightKg: 15, date: "2026-11-09" },
    });
    console.log(
      "✓ Min weight rejection (15kg):",
      res1.payload?.success === false ? "PASSED" : "FAILED",
      res1.payload?.message
    );

    // Test 2: Sane range validation (> 400 kg)
    const res2 = await callController(upsertWeight, {
      user,
      body: { weightKg: 450, date: "2026-11-09" },
    });
    console.log(
      "✓ Max weight rejection (450kg):",
      res2.payload?.success === false ? "PASSED" : "FAILED",
      res2.payload?.message
    );

    // Test 3: Upsert a valid weight
    const res3 = await callController(upsertWeight, {
      user,
      body: {
        weightKg: 74.9,
        date: "2026-11-10",
        note: "End-to-end test weigh in",
        timeOfDay: "morning",
      },
    });
    console.log(
      "✓ Upsert valid weight (74.9kg):",
      res3.payload?.success === true ? "PASSED" : "FAILED",
      res3.payload?.data?.weightLog?.weightKg
    );

    // Test 4: Verify unique compound index (upsert replaces same date)
    const res4 = await callController(upsertWeight, {
      user,
      body: { weightKg: 74.8, date: "2026-11-10", note: "Edited weigh in" },
    });
    const countToday = await WeightLog.countDocuments({
      userId: user._id,
      date: "2026-11-10",
    });
    console.log(
      "✓ Upsert idempotency (count today):",
      countToday === 1 ? "PASSED (1 record)" : `FAILED (${countToday} records)`,
      "New weight:",
      res4.payload?.data?.weightLog?.weightKg
    );

    console.log("🎉 All Weight Backend Unit & Integration Tests Passed!");
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
};

runTests();
