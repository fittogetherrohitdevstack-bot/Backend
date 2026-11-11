const path = require("path");
const fs = require("fs");
const BodyMeasurement = require("../../Modals/BodyMeasurement");
const BodyMetric = require("../../Modals/BodyMetric");
const { getPhotoCycleDetails, isValidDateString } = require("../../Utils/date");

/**
 * Audits legacy bodyMeasurements.progressImage and bodyMetrics.progressImage records.
 * Preserves all existing progressImage values untouched.
 * Links legacy measurement photos into progressPhotoSets ONLY when explicitly opted-in via optInUserIds.
 */
async function run({ dryRun = false, optInUserIds = [], logger = console } = {}) {
  const measurementsWithImages = await BodyMeasurement.find({
    progressImage: { $exists: true, $nin: ["", null] },
  })
    .sort({ date: 1 })
    .lean();

  const metricsWithImages = await BodyMetric.find({
    progressImage: { $exists: true, $nin: ["", null] },
  })
    .sort({ date: 1 })
    .lean();

  logger.log(
    `[002_legacy_photos_audit_and_link] found ${measurementsWithImages.length} BodyMeasurement.progressImage and ${metricsWithImages.length} BodyMetric.progressImage records (all preserved intact).`
  );

  const optedInSet = new Set((optInUserIds || []).map((id) => String(id)));
  let linkedCount = 0;
  let wouldLinkCount = 0;

  if (optedInSet.size === 0) {
    return {
      name: "002_legacy_photos_audit_and_link",
      dryRun,
      legacyBodyMeasurementPhotos: measurementsWithImages.length,
      legacyBodyMetricPhotos: metricsWithImages.length,
      wouldLinkCount: 0,
      linkedCount: 0,
    };
  }

  const photoSetModelPath = path.resolve(__dirname, "../../Modals/ProgressPhotoSet.js");
  if (!fs.existsSync(photoSetModelPath)) {
    logger.log(
      "[002_legacy_photos_audit_and_link] ProgressPhotoSet model not installed yet; skipping opt-in link step."
    );
    return {
      name: "002_legacy_photos_audit_and_link",
      dryRun,
      legacyBodyMeasurementPhotos: measurementsWithImages.length,
      legacyBodyMetricPhotos: metricsWithImages.length,
      wouldLinkCount: 0,
      linkedCount: 0,
    };
  }

  const ProgressPhotoSet = require(photoSetModelPath);

  // Group opted-in records per user using their earliest photo date as anchor
  const byUser = new Map();
  for (const m of measurementsWithImages) {
    const uid = String(m.userId);
    if (!optedInSet.has(uid) || !isValidDateString(m.date)) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(m);
  }

  for (const [uid, items] of byUser.entries()) {
    const anchorDate = items[0].date;
    for (const item of items) {
      const cycleInfo = getPhotoCycleDetails(anchorDate, item.date, 1);
      const existing = await ProgressPhotoSet.findOne({
        userId: item.userId,
        $or: [
          { cycleNumber: cycleInfo.cycleNumber },
          { date: item.date },
        ],
      }).lean();

      if (existing && existing.photos?.front_relaxed?.url) {
        continue;
      }

      wouldLinkCount += 1;
      if (dryRun) {
        logger.log(
          `[DRY-RUN] Would link legacy BodyMeasurement ${item._id} (${item.date}) for opted-in user ${uid} into ProgressPhotoSet cycle ${cycleInfo.cycleNumber} (keeping bodyMeasurements.progressImage unchanged)`
        );
      } else {
        await ProgressPhotoSet.findOneAndUpdate(
          { userId: item.userId, cycleNumber: cycleInfo.cycleNumber },
          {
            $setOnInsert: {
              userId: item.userId,
              date: item.date,
              cycleNumber: cycleInfo.cycleNumber,
              visibility: "private",
              note: item.note || "Linked from legacy measurement check-in",
            },
            $set: {
              "photos.front_relaxed": {
                url: item.progressImage,
                publicId: "",
                takenAt: item.createdAt || new Date(),
                isLegacyLinked: true,
              },
            },
          },
          { upsert: true, new: true }
        );
        linkedCount += 1;
      }
    }
  }

  logger.log(
    `[002_legacy_photos_audit_and_link] wouldLink=${wouldLinkCount}, linked=${linkedCount}, dryRun=${dryRun}`
  );

  return {
    name: "002_legacy_photos_audit_and_link",
    dryRun,
    legacyBodyMeasurementPhotos: measurementsWithImages.length,
    legacyBodyMetricPhotos: metricsWithImages.length,
    wouldLinkCount,
    linkedCount,
  };
}

module.exports = {
  name: "002_legacy_photos_audit_and_link",
  run,
};
