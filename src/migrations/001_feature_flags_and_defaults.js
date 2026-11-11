const FitnessProfile = require("../../Modals/FitnessProfile");

const DEFAULT_FEATURE_FLAGS = {
  reminders: false,
  weeklyTargets: false,
  photoCheckins: false,
};

const DEFAULT_TARGET_DEFAULTS = {
  enabled: false,
  weightChangeKgPerWeek: null,
  weighInsTarget: 5,
  waistChangeCm: null,
  note: "",
};

/**
 * Idempotent migration: backfills safe opt-in featureFlags (false for existing users),
 * targetDefaults, and hideWeightNumbers on FitnessProfile documents without overwriting
 * any already-configured fields.
 */
async function run({ dryRun = false, logger = console } = {}) {
  const collection = FitnessProfile.collection;
  const docs = await collection.find({}).toArray();

  let needsUpdate = 0;
  let updated = 0;
  const plannedChanges = [];

  for (const doc of docs) {
    const setFields = {};

    if (!doc.featureFlags || typeof doc.featureFlags !== "object") {
      setFields.featureFlags = { ...DEFAULT_FEATURE_FLAGS };
    } else {
      for (const key of ["reminders", "weeklyTargets", "photoCheckins"]) {
        if (typeof doc.featureFlags[key] !== "boolean") {
          setFields[`featureFlags.${key}`] = false;
        }
      }
    }

    if (typeof doc.featureFlagsConfigured !== "boolean") {
      setFields.featureFlagsConfigured = false;
    }

    if (!doc.targetDefaults || typeof doc.targetDefaults !== "object") {
      setFields.targetDefaults = { ...DEFAULT_TARGET_DEFAULTS };
    } else {
      if (typeof doc.targetDefaults.enabled !== "boolean") {
        setFields["targetDefaults.enabled"] = false;
      }
      if (doc.targetDefaults.weightChangeKgPerWeek === undefined) {
        setFields["targetDefaults.weightChangeKgPerWeek"] = null;
      }
      if (typeof doc.targetDefaults.weighInsTarget !== "number") {
        setFields["targetDefaults.weighInsTarget"] = 5;
      }
      if (doc.targetDefaults.waistChangeCm === undefined) {
        setFields["targetDefaults.waistChangeCm"] = null;
      }
      if (typeof doc.targetDefaults.note !== "string") {
        setFields["targetDefaults.note"] = "";
      }
    }

    if (typeof doc.hideWeightNumbers !== "boolean") {
      setFields.hideWeightNumbers = false;
    }

    const keysToSet = Object.keys(setFields);
    if (keysToSet.length > 0) {
      needsUpdate += 1;
      plannedChanges.push({
        profileId: String(doc._id),
        userId: String(doc.userId),
        fields: keysToSet,
      });

      if (dryRun) {
        logger.log(
          `[DRY-RUN] FitnessProfile ${doc._id} (user ${doc.userId}) would set: ${keysToSet.join(", ")}`
        );
      } else {
        await collection.updateOne({ _id: doc._id }, { $set: setFields });
        updated += 1;
      }
    }
  }

  logger.log(
    `[001_feature_flags_and_defaults] inspected=${docs.length}, needsUpdate=${needsUpdate}, updated=${updated}, dryRun=${dryRun}`
  );

  return {
    name: "001_feature_flags_and_defaults",
    dryRun,
    inspected: docs.length,
    needsUpdate,
    updated,
    plannedChanges,
  };
}

module.exports = {
  name: "001_feature_flags_and_defaults",
  run,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_TARGET_DEFAULTS,
};
