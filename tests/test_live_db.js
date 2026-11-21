const mongoose = require("mongoose");
const connectToDb = require("../Config/db");
const Exercise = require("../Modals/Exercise");

async function testLiveDB() {
  try {
    await connectToDb();

    const total = await Exercise.countDocuments();
    console.log("Total Exercises in MongoDB:", total);

    // Media counts
    const videoCount = await Exercise.countDocuments({ mediaType: "video" });
    const gifCount = await Exercise.countDocuments({ mediaType: "gif" });
    const imagesCount = await Exercise.countDocuments({ mediaType: "images" });
    const noneCount = await Exercise.countDocuments({ mediaType: "none" });

    console.log(`Media Distribution:
- Video (MP4): ${videoCount}
- GIF: ${gifCount}
- Diagrams (Start/Peak): ${imagesCount}
- Text-only: ${noneCount}`);

    // Test text search
    const bench = await Exercise.find({ $text: { $search: "bench press" } }).limit(4);
    console.log("Text search 'bench press' results:", bench.map((b) => b.name));

    // Test muscle query
    const chestCount = await Exercise.countDocuments({ primaryMuscle: "Chest" });
    console.log("Chest exercises count:", chestCount);

    // Test sample video resolution
    const sampleVideo = await Exercise.findOne({ mediaType: "video", videoUrl: { $ne: null } });
    console.log("Sample Video:", sampleVideo.name, "URL:", sampleVideo.videoUrl);

    // Test sample GIF resolution
    const sampleGif = await Exercise.findOne({ mediaType: "gif", gifUrl: { $ne: null } });
    console.log("Sample GIF:", sampleGif.name, "URL:", sampleGif.gifUrl);

    // Test Controller APIs
    const { getExercises, getExerciseFilters } = require("../Controllers/workoutController");

    const mockRes = () => {
      const res = {};
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.body = data;
        return res;
      };
      return res;
    };

    const res1 = mockRes();
    await getExerciseFilters({ query: {} }, res1, (err) => { if (err) console.error("Error in getExerciseFilters:", err); });
    console.log("Filters API status:", res1.statusCode, "mediaTypes counts:", res1.body?.data?.mediaCounts);
    console.log("Filters API muscles count:", res1.body?.data?.muscles?.length);

    const res2 = mockRes();
    await getExercises({ query: { mediaType: "video", page: 1, limit: 10 } }, res2, (err) => { if (err) console.error("Error in getExercises:", err); });
    console.log("Video filter query status:", res2.statusCode, "returned:", res2.body?.data?.exercises?.length, "exercises. Total video matches:", res2.body?.data?.pagination?.total);

    const res3 = mockRes();
    await getExercises({ query: { search: "squat", muscle: "Quads", page: 1, limit: 5 } }, res3, (err) => { if (err) console.error("Error in getExercises search:", err); });
    console.log("Search 'squat' with Quads muscle returned:", res3.body?.data?.exercises?.map(e => e.name));

    await mongoose.disconnect();
    console.log("Database & controller tests complete!");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

testLiveDB();
