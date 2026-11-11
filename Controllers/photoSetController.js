const ProgressPhotoSet = require("../Modals/ProgressPhotoSet");
const WeightLog = require("../Modals/WeightLog");
const FitnessProfile = require("../Modals/FitnessProfile");
const ReminderSetting = require("../Modals/ReminderSetting");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const {
  getLocalDateString,
  getPhotoCycleDetails,
  anchorDateFromLocalString,
  isValidDateString,
} = require("../Utils/date");
const {
  isCloudinaryConfigured,
  validateImageFile,
  resolveSignedPhotoUrl,
  uploadPrivateProgressPhoto,
  deletePrivateProgressPhoto,
} = require("../Utils/cloudinary");
const { awardConsistencyPoints } = require("../Utils/consistencyPoints");

const VALID_POSES = ["front_relaxed", "side_relaxed", "back_relaxed"];

/**
 * Hydrates a ProgressPhotoSet with signed Cloudinary URLs & completion metadata.
 */
const formatPhotoSetResponse = (doc) => {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  const photos = {
    front_relaxed: resolveSignedPhotoUrl(plain.photos?.front_relaxed),
    side_relaxed: resolveSignedPhotoUrl(plain.photos?.side_relaxed),
    back_relaxed: resolveSignedPhotoUrl(plain.photos?.back_relaxed),
  };
  const completedCount = VALID_POSES.filter((p) => Boolean(photos[p]?.url)).length;
  return {
    ...plain,
    photos,
    completedCount,
    isComplete: completedCount === 3,
  };
};

/**
 * Loads anchorDate & timezone safely for a user without mutating historical photo sets.
 */
const resolveUserAnchorInfo = async (userId, userTimezone = "Asia/Kolkata") => {
  const tz = userTimezone || "Asia/Kolkata";
  const todayLocalDate = getLocalDateString(new Date(), tz);
  let reminderSetting = await ReminderSetting.findOne({ userId });

  if (!reminderSetting) {
    reminderSetting = await ReminderSetting.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          timezone: tz,
          "biweeklyPhotos.anchorDate": anchorDateFromLocalString(todayLocalDate, tz),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
  }

  const anchorDateLocal = reminderSetting?.biweeklyPhotos?.anchorDate
    ? getLocalDateString(reminderSetting.biweeklyPhotos.anchorDate, tz)
    : todayLocalDate;

  return { timezone: tz, todayLocalDate, anchorDateLocal, reminderSetting };
};

/**
 * @desc List user's private/owned progress photo sets
 * @route GET /api/progress/photo-sets?from=&to=
 */
const listPhotoSets = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { from, to } = req.validatedQuery || req.query || {};
  const { anchorDateLocal, todayLocalDate } = await resolveUserAnchorInfo(
    userId,
    req.user.timezone
  );

  const query = { userId };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const sets = await ProgressPhotoSet.find(query).sort({ date: -1, cycleNumber: -1 });

  return sendSuccess(res, {
    configured: isCloudinaryConfigured(),
    anchorDateLocal,
    todayLocalDate,
    sets: sets.map(formatPhotoSetResponse),
  });
});

/**
 * @desc Get current 14-day cycle set, completion count, and status
 * @route GET /api/progress/photo-sets/current
 */
const getCurrentPhotoCycle = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [profile, anchorInfo] = await Promise.all([
    FitnessProfile.findOne({ userId }).select("featureFlags currentWeight").lean(),
    resolveUserAnchorInfo(userId, req.user.timezone),
  ]);

  const { todayLocalDate, anchorDateLocal } = anchorInfo;
  const baseCycle = getPhotoCycleDetails(anchorDateLocal, todayLocalDate, 0);

  const currentDoc = await ProgressPhotoSet.findOne({
    userId,
    cycleNumber: baseCycle.cycleNumber,
  });

  const formattedSet = formatPhotoSetResponse(currentDoc);
  const completedCount = formattedSet?.completedCount || 0;
  const cycle = getPhotoCycleDetails(anchorDateLocal, todayLocalDate, completedCount);

  return sendSuccess(res, {
    enabled: Boolean(profile?.featureFlags?.photoCheckins),
    configured: isCloudinaryConfigured(),
    anchorDateLocal,
    todayLocalDate,
    cycleNumber: cycle.cycleNumber,
    dueDate: cycle.dueDate,
    nextDueDate: cycle.nextDueDate,
    daysSinceDue: cycle.daysSinceDue,
    status: cycle.status,
    completedCount,
    requiredCount: 3,
    isComplete: completedCount === 3,
    set: formattedSet,
  });
});

/**
 * @desc Upload or replace one pose photo inside the current (or targeted) 2-week cycle set
 * @route PUT /api/progress/photo-sets/current/photo
 */
const uploadCurrentCyclePose = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { pose, note, date: requestedDate, cycleNumber: requestedCycle } = req.body;

  if (!VALID_POSES.includes(pose)) {
    return sendError(
      res,
      "Invalid pose. Must be front_relaxed, side_relaxed, or back_relaxed.",
      400
    );
  }

  const fileCheck = validateImageFile(req.file);
  if (!fileCheck.valid) {
    return sendError(res, fileCheck.message, 400);
  }

  if (!isCloudinaryConfigured()) {
    return sendError(
      res,
      "Photo storage isn't configured. Please add Cloudinary keys in backend/.env.",
      503
    );
  }

  const { timezone, todayLocalDate, anchorDateLocal } = await resolveUserAnchorInfo(
    userId,
    req.user.timezone
  );
  const entryDate =
    requestedDate && isValidDateString(requestedDate) ? requestedDate : todayLocalDate;
  const baseCycle = getPhotoCycleDetails(anchorDateLocal, entryDate, 0);
  const cycleNumber =
    requestedCycle && Number.isInteger(Number(requestedCycle)) && Number(requestedCycle) >= 1
      ? Number(requestedCycle)
      : baseCycle.cycleNumber;

  const existingSet = await ProgressPhotoSet.findOne({ userId, cycleNumber }).lean();
  const previousPublicId = existingSet?.photos?.[pose]?.publicId || null;

  // Snapshot weight on that day (or recent baseline)
  let weightSnapshot = existingSet?.weightKg ?? null;
  if (weightSnapshot === null) {
    const exactWeight = await WeightLog.findOne({ userId, date: entryDate }).lean();
    if (exactWeight) {
      weightSnapshot = exactWeight.weightKg;
    } else {
      const latestWeight = await WeightLog.findOne({ userId }).sort({ date: -1 }).lean();
      if (latestWeight) {
        weightSnapshot = latestWeight.weightKg;
      } else {
        const profile = await FitnessProfile.findOne({ userId }).select("currentWeight").lean();
        weightSnapshot = profile?.currentWeight ?? null;
      }
    }
  }

  // Upload NEW asset first before replacing reference so an aborted upload never loses older photo
  const uploadedAsset = await uploadPrivateProgressPhoto(req.file.buffer, {
    userId: userId.toString(),
    cycleNumber,
    pose,
  });

  const setFields = {
    [`photos.${pose}`]: uploadedAsset,
  };
  if (!existingSet) {
    setFields.date = entryDate;
    setFields.weightKg = weightSnapshot;
    setFields.visibility = "private";
  } else if (existingSet.weightKg === null && weightSnapshot !== null) {
    setFields.weightKg = weightSnapshot;
  }
  if (note !== undefined) {
    setFields.note = String(note).slice(0, 500);
  }

  const updatedSet = await ProgressPhotoSet.findOneAndUpdate(
    { userId, cycleNumber },
    {
      $set: setFields,
      $setOnInsert: {
        userId,
        cycleNumber,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  // Clean up replaced Cloudinary file only after MongoDB write commits safely
  if (previousPublicId && previousPublicId !== uploadedAsset.publicId) {
    await deletePrivateProgressPhoto(previousPublicId);
  }

  const formatted = formatPhotoSetResponse(updatedSet);
  if (formatted.isComplete) {
    await awardConsistencyPoints({
      userId,
      date: entryDate,
      periodKey: `cycle-${cycleNumber}`,
      type: "photo_checkin",
      points: 20,
      meta: { cycleNumber },
    });
  }

  return sendSuccess(
    res,
    {
      set: formatted,
      pose,
      completedCount: formatted.completedCount,
    },
    `${pose.replace("_", " ")} photo saved privately`
  );
});

/**
 * @desc Delete a single pose photo from a set (also deletes from Cloudinary)
 * @route DELETE /api/progress/photo-sets/:id/photo/:pose
 */
const deleteSinglePosePhoto = asyncHandler(async (req, res) => {
  const { id, pose } = req.params;
  if (!VALID_POSES.includes(pose)) {
    return sendError(res, "Invalid pose specified.", 400);
  }

  const set = await ProgressPhotoSet.findOne({ _id: id, userId: req.user._id });
  if (!set) {
    return sendError(res, "Progress photo set not found.", 404);
  }

  const existingPose = set.photos?.[pose];
  if (!existingPose?.url) {
    return sendError(res, "Pose photo not present in this set.", 404);
  }

  const oldPublicId = existingPose.publicId;
  set.photos[pose] = null;
  await set.save();

  if (oldPublicId) {
    await deletePrivateProgressPhoto(oldPublicId);
  }

  return sendSuccess(
    res,
    { set: formatPhotoSetResponse(set) },
    "Pose photo deleted"
  );
});

/**
 * @desc Delete an entire progress photo set and its Cloudinary assets
 * @route DELETE /api/progress/photo-sets/:id
 */
const deletePhotoSet = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const set = await ProgressPhotoSet.findOne({ _id: id, userId: req.user._id });
  if (!set) {
    return sendError(res, "Progress photo set not found.", 404);
  }

  const publicIds = VALID_POSES.map((p) => set.photos?.[p]?.publicId).filter(Boolean);
  await ProgressPhotoSet.deleteOne({ _id: set._id, userId: req.user._id });

  await Promise.all(publicIds.map((pid) => deletePrivateProgressPhoto(pid)));

  return sendSuccess(res, { deletedId: id }, "Progress photo set deleted");
});

/**
 * @desc Change sharing visibility ('private' | 'group') with explicit revocation support
 * @route PUT /api/progress/photo-sets/:id/visibility
 */
const updatePhotoSetVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { visibility } = req.body;

  const set = await ProgressPhotoSet.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { $set: { visibility } },
    { returnDocument: "after", runValidators: true }
  );

  if (!set) {
    return sendError(res, "Progress photo set not found.", 404);
  }

  return sendSuccess(
    res,
    { set: formatPhotoSetResponse(set) },
    visibility === "group"
      ? "Photo set shared with your squad"
      : "Photo set is now private"
  );
});

/**
 * @desc Change the 2-week cycle start anchor date without modifying historical sets
 * @route PUT /api/progress/photo-sets/anchor
 */
const updatePhotoCycleAnchor = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const tz = req.user.timezone || "Asia/Kolkata";
  const { anchorDate } = req.body;

  if (!isValidDateString(anchorDate)) {
    return sendError(res, "Invalid anchorDate format. Expected YYYY-MM-DD.", 400);
  }

  const anchoredDateObj = anchorDateFromLocalString(anchorDate, tz);
  await ReminderSetting.findOneAndUpdate(
    { userId },
    {
      $set: {
        timezone: tz,
        "biweeklyPhotos.anchorDate": anchoredDateObj,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const todayLocalDate = getLocalDateString(new Date(), tz);
  const cycle = getPhotoCycleDetails(anchorDate, todayLocalDate, 0);

  return sendSuccess(
    res,
    {
      anchorDateLocal: anchorDate,
      nextDueDate: cycle.dueDate,
      cycleNumber: cycle.cycleNumber,
    },
    "2-week photo check-in schedule updated without altering history"
  );
});

/**
 * @desc List strictly opted-in (visibility === 'group') photo check-ins for a group
 * @route GET /api/groups/:id/shared-photos
 */
const getGroupSharedPhotos = asyncHandler(async (req, res) => {
  const groupId = req.group._id;
  const Membership = require("../Modals/Membership");

  const memberships = await Membership.find({
    groupId,
    status: "active",
  }).populate("userId", "name profileImage");

  const memberIds = memberships.map((m) => m.userId?._id).filter(Boolean);
  const memberMap = new Map(
    memberships
      .filter((m) => m.userId)
      .map((m) => [m.userId._id.toString(), m.userId])
  );

  // Strict privacy filter: NEVER return sets unless visibility === 'group'
  const sharedSets = await ProgressPhotoSet.find({
    userId: { $in: memberIds },
    visibility: "group",
  })
    .sort({ date: -1, createdAt: -1 })
    .limit(30);

  const items = sharedSets.map((setDoc) => {
    const formatted = formatPhotoSetResponse(setDoc);
    const owner = memberMap.get(setDoc.userId.toString());
    return {
      _id: formatted._id,
      userId: formatted.userId,
      ownerName: owner?.name || "Squad Member",
      ownerAvatar: owner?.profileImage || "",
      date: formatted.date,
      cycleNumber: formatted.cycleNumber,
      photos: formatted.photos,
      completedCount: formatted.completedCount,
      note: formatted.note,
      visibility: formatted.visibility,
    };
  });

  return sendSuccess(res, { sharedSets: items });
});

module.exports = {
  listPhotoSets,
  getCurrentPhotoCycle,
  uploadCurrentCyclePose,
  deleteSinglePosePhoto,
  deletePhotoSet,
  updatePhotoSetVisibility,
  updatePhotoCycleAnchor,
  getGroupSharedPhotos,
};
