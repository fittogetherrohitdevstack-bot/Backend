const connectToDb = require("../Config/db");
const WaterLog = require("../Modals/WaterLog");
const Membership = require("../Modals/Membership");
const PointsLedger = require("../Modals/PointsLedger");
const { calculateWaterPoints } = require("../Utils/gamification");

async function syncAllWaterPoints() {
  await connectToDb();
  const waterLogs = await WaterLog.find({}).lean();
  console.log("Found", waterLogs.length, "water logs to inspect");
  let synced = 0;

  for (const w of waterLogs) {
    const totalConsumed = (w.entries || []).reduce((sum, e) => sum + (e.amountMl || 0), 0);
    const targetMl = w.targetMl || 3000;
    const points = calculateWaterPoints(totalConsumed, targetMl);

    if (points > 0) {
      const membership = await Membership.findOne({ userId: w.userId, status: "active" })
        .select("groupId")
        .lean();
      if (membership) {
        await PointsLedger.findOneAndUpdate(
          { userId: w.userId, date: w.date, type: "water" },
          {
            $set: {
              groupId: membership.groupId,
              points,
              meta: { totalConsumed, targetMl, goalHit: totalConsumed >= targetMl },
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );
        synced++;
      }
    }
  }

  console.log("Successfully synchronized", synced, "water points entries into PointsLedger!");
  process.exit(0);
}

syncAllWaterPoints().catch((err) => {
  console.error(err);
  process.exit(1);
});
