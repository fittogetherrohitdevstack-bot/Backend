const mongoose = require("mongoose");
const connectToDb = require("../../Config/db");
const migration001 = require("./001_feature_flags_and_defaults");
const migration002 = require("./002_legacy_photos_audit_and_link");

const MIGRATIONS = [migration001, migration002];

async function runMigrations({ dryRun = false, optInUserIds = [], logger = console } = {}) {
  const results = [];
  for (const m of MIGRATIONS) {
    const res = await m.run({ dryRun, optInUserIds, logger });
    results.push(res);
  }
  return results;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const linkFlag = args.find((a) => a.startsWith("--link-legacy-user="));
  const optInUserIds = linkFlag ? linkFlag.split("=")[1].split(",").filter(Boolean) : [];

  console.log(`🔄 Running FitTogether migrations (dryRun=${dryRun})...`);
  connectToDb()
    .then(async () => {
      const results = await runMigrations({ dryRun, optInUserIds, logger: console });
      console.log("✅ Migrations finished:", JSON.stringify(results, null, 2));
      await mongoose.connection.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Migration error:", err);
      try {
        await mongoose.connection.close();
      } catch (_) {}
      process.exit(1);
    });
}

module.exports = {
  MIGRATIONS,
  runMigrations,
};
