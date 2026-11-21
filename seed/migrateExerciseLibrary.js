/**
 * Database Migration Script: Expand Exercise Library to 1,000+ Exercises
 * Safe, idempotent upsert into MongoDB.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const Exercise = require("../Modals/Exercise");

async function runMigration() {
  console.log("=== STARTING EXERCISE LIBRARY MIGRATION ===");
  await connectToDb();

  const catalogPath = path.join(__dirname, "comprehensiveExerciseCatalog.json");
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Catalog file not found at ${catalogPath}. Please run buildComprehensiveCatalog.js first.`);
  }

  const rawData = fs.readFileSync(catalogPath, "utf8");
  const exercises = JSON.parse(rawData);
  console.log(`Loaded ${exercises.length} exercises from comprehensive catalog.`);

  const initialCount = await Exercise.countDocuments();
  console.log(`Current exercises in database before migration: ${initialCount}`);

  // Batch upsert in chunks of 250
  const CHUNK_SIZE = 250;
  let upsertedCount = 0;
  let modifiedCount = 0;

  for (let i = 0; i < exercises.length; i += CHUNK_SIZE) {
    const chunk = exercises.slice(i, i + CHUNK_SIZE);
    const operations = chunk.map((ex) => ({
      updateOne: {
        filter: { slug: ex.slug },
        update: {
          $setOnInsert: { isCustom: false },
          $set: {
            name: ex.name,
            alternativeNames: ex.alternativeNames || [],
            description: ex.description || "",
            primaryMuscle: ex.primaryMuscle,
            secondaryMuscles: ex.secondaryMuscles || [],
            equipment: ex.equipment,
            difficulty: ex.difficulty || "Intermediate",
            category: ex.category || "Strength",
            instructions: ex.instructions || [],
            formCues: ex.formCues || [],
            commonMistakes: ex.commonMistakes || [],
            breathingInstructions: ex.breathingInstructions || "",
            mediaType: ex.mediaType || "none",
            videoUrl: ex.videoUrl || null,
            videoUrlFemale: ex.videoUrlFemale || null,
            gifUrl: ex.gifUrl || null,
            thumbnailUrl: ex.thumbnailUrl || null,
            images: ex.images || [],
            source: ex.source || "fittogether",
            sourceId: ex.sourceId || null,
            attribution: ex.attribution || "",
          },
        },
        upsert: true,
      },
    }));

    const result = await Exercise.bulkWrite(operations, { ordered: false });
    upsertedCount += result.upsertedCount || 0;
    modifiedCount += result.modifiedCount || 0;
    console.log(`Processed chunk ${Math.floor(i / CHUNK_SIZE) + 1} / ${Math.ceil(exercises.length / CHUNK_SIZE)} (Total upserted: ${upsertedCount}, updated: ${modifiedCount})`);
  }

  const finalCount = await Exercise.countDocuments();
  const videoCount = await Exercise.countDocuments({ mediaType: "video" });
  const gifCount = await Exercise.countDocuments({ mediaType: "gif" });
  const imagesCount = await Exercise.countDocuments({ mediaType: "images" });
  const noneCount = await Exercise.countDocuments({ mediaType: "none" });

  const muscleAggregation = await Exercise.aggregate([
    { $group: { _id: "$primaryMuscle", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const categoryAggregation = await Exercise.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log("\n================ MIGRATION REPORT ================");
  console.log(`Total exercises now in DB: ${finalCount}`);
  console.log(`  - Newly inserted: ${upsertedCount}`);
  console.log(`  - Existing updated: ${modifiedCount}`);
  console.log("\nBy Media Type:");
  console.log(`  - MP4 Demonstration Videos: ${videoCount}`);
  console.log(`  - Animated Demonstration GIFs: ${gifCount}`);
  console.log(`  - Static Start/Peak Illustrations: ${imagesCount}`);
  console.log(`  - Text-based Only: ${noneCount}`);
  console.log("\nBy Muscle Groups:");
  muscleAggregation.forEach((m) => console.log(`  - ${m._id}: ${m.count}`));
  console.log("\nBy Categories:");
  categoryAggregation.forEach((c) => console.log(`  - ${c._id}: ${c.count}`));
  console.log("==================================================\n");

  await mongoose.connection.close();
  console.log("Database connection closed cleanly. Migration complete!");
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

module.exports = runMigration;
