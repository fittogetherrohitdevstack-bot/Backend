const mongoose = require("mongoose");
const config = require("../Config/env");
const User = require("../Modals/User");
const WeightLog = require("../Modals/WeightLog");
const FitnessProfile = require("../Modals/FitnessProfile");
const { getLocalDateString } = require("../Utils/date");

const seedWeightLogs = async () => {
  try {
    console.log("🌱 Seeding 60 days of realistic weight logs...");
    await mongoose.connect(config.MONGODB_URI);

    const user = await User.findOne({ email: "alex@fittogether.test" });
    if (!user) {
      console.log("User alex@fittogether.test not found. Run main seed first.");
      process.exit(1);
    }

    // Clear old weight logs for Alex
    await WeightLog.deleteMany({ userId: user._id });

    const now = new Date();
    // 60 days back to today
    // Start at ~78.4 kg, gradual healthy downward trend to ~74.6 kg (target 74 kg)
    // with normal daily fluctuations (+/- 0.4 kg due to water/glycogen)
    const logs = [];
    let currentTrend = 78.4;

    for (let i = 59; i >= 0; i--) {
      const dObj = new Date(now.getTime() - i * 86400000);
      const dateStr = getLocalDateString(dObj, user.timezone || "Asia/Kolkata");

      // Gradual decrease of ~0.06 kg per day on average
      currentTrend -= 0.062;

      // Realistic noise between -0.35 and +0.35 kg
      const noise = (Math.sin(i * 1.5) * 0.25) + ((i % 5 === 0 ? 0.3 : -0.15));
      const weight = Math.round((currentTrend + noise) * 10) / 10;

      // Skip 2 random days across 60 days to test missing day handling realistically
      if (i === 12 || i === 38) continue;

      let note = "";
      if (i === 59) note = "Starting cut phase. Weighed fasted morning.";
      else if (i === 45) note = "Post high-carb refeed day";
      else if (i === 30) note = "1 month check-in. Consistent calorie deficit.";
      else if (i === 15) note = "New low! Feeling energetic.";
      else if (i === 0) note = "Morning weigh-in after workout";

      logs.push({
        userId: user._id,
        date: dateStr,
        weightKg: weight,
        timeOfDay: i % 7 === 0 ? "evening" : "morning",
        note,
      });
    }

    await WeightLog.insertMany(logs);
    console.log(`✅ Inserted ${logs.length} weight entries for ${user.name}`);

    // Update currentWeight in FitnessProfile to the latest entry
    const latest = logs[logs.length - 1];
    await FitnessProfile.findOneAndUpdate(
      { userId: user._id },
      { $set: { currentWeight: latest.weightKg, targetWeight: 74.0 } }
    );
    console.log(`✅ Updated profile currentWeight: ${latest.weightKg} kg, target: 74.0 kg`);

    console.log("🎉 Weight seed complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Weight seed failed:", err);
    process.exit(1);
  }
};

seedWeightLogs();
