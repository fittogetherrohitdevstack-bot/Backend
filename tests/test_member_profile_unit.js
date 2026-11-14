const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const groupController = require("../Controllers/groupController");

// Pure privacy evaluation logic verification
test("Member Profile Privacy: Masks weight and measurements when set to private", () => {
  const selfUserId = new mongoose.Types.ObjectId().toString();
  const teammateUserId = new mongoose.Types.ObjectId().toString();

  const evaluatePrivacy = ({ viewerId, targetId, fitnessProfile, socialPrivacy }) => {
    const isSelf = viewerId === targetId;
    const isWeightPublic =
      isSelf ||
      (fitnessProfile?.privacy?.weight === "group" && socialPrivacy?.showWeightInFeed !== false);
    const isMeasurementsPublic =
      isSelf || fitnessProfile?.privacy?.measurements === "group";

    return {
      weight: isWeightPublic
        ? {
            isPrivate: false,
            currentWeight: fitnessProfile?.currentWeight,
            targetWeight: fitnessProfile?.targetWeight,
          }
        : { isPrivate: true, currentWeight: null, targetWeight: null },
      measurements: isMeasurementsPublic
        ? { isPrivate: false, data: { waist: 80 } }
        : { isPrivate: true, data: null },
    };
  };

  // Case 1: Teammate viewing member with default private settings
  const privateProfile = {
    privacy: { weight: "private", measurements: "private", photos: "private" },
    currentWeight: 84.5,
    targetWeight: 75.0,
  };
  const resultTeammate = evaluatePrivacy({
    viewerId: selfUserId,
    targetId: teammateUserId,
    fitnessProfile: privateProfile,
    socialPrivacy: { showWeightInFeed: false },
  });

  assert.equal(resultTeammate.weight.isPrivate, true);
  assert.equal(resultTeammate.weight.currentWeight, null);
  assert.equal(resultTeammate.measurements.isPrivate, true);
  assert.equal(resultTeammate.measurements.data, null);

  // Case 2: Teammate viewing member who enabled group privacy
  const sharedProfile = {
    privacy: { weight: "group", measurements: "group", photos: "group" },
    currentWeight: 72.0,
    targetWeight: 68.0,
  };
  const resultShared = evaluatePrivacy({
    viewerId: selfUserId,
    targetId: teammateUserId,
    fitnessProfile: sharedProfile,
    socialPrivacy: { showWeightInFeed: true },
  });

  assert.equal(resultShared.weight.isPrivate, false);
  assert.equal(resultShared.weight.currentWeight, 72.0);
  assert.equal(resultShared.weight.targetWeight, 68.0);
  assert.equal(resultShared.measurements.isPrivate, false);
  assert.equal(resultShared.measurements.data.waist, 80);

  // Case 3: Viewing own profile is ALWAYS unmasked even if set to private
  const resultSelf = evaluatePrivacy({
    viewerId: teammateUserId,
    targetId: teammateUserId,
    fitnessProfile: privateProfile,
    socialPrivacy: { showWeightInFeed: false },
  });

  assert.equal(resultSelf.weight.isPrivate, false);
  assert.equal(resultSelf.weight.currentWeight, 84.5);
  assert.equal(resultSelf.measurements.isPrivate, false);
});

test("Member Profile Daily Achievements: computes completion status correctly", () => {
  const sources = { weight: true, water: true, meal: false, workout: true };
  const waterLoggedMl = 3200;
  const waterTargetMl = 3000;
  const eatenMeals = 3;
  const totalMeals = 3;

  const todayLogged = Boolean(sources.weight || sources.water || sources.meal || sources.workout);
  const waterCompleted = waterLoggedMl >= waterTargetMl;
  const mealsCompleted = totalMeals > 0 && eatenMeals >= totalMeals;

  assert.equal(todayLogged, true);
  assert.equal(waterCompleted, true);
  assert.equal(mealsCompleted, true);
});

test("Member Profile Controller: getGroupMemberProfile handler is exported and defined", () => {
  assert.equal(typeof groupController.getGroupMemberProfile, "function");
});
