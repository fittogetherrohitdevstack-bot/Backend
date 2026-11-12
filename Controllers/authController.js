const jwt = require("jsonwebtoken");
const config = require("../Config/env");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const FitnessProfile = require("../Modals/FitnessProfile");
const WaterLog = require("../Modals/WaterLog");
const asyncHandler = require("../Utils/asyncHandler");
const { sendSuccess, sendError } = require("../Utils/apiResponse");
const { getLocalDateString } = require("../Utils/date");
const { POINTS_RULES, syncDailyHabitPoints } = require("../Utils/gamification");
const { calculateTDEE } = require("../Utils/nutrition");
const { emitGroupActivity } = require("../Utils/socket");
const { useStreakFreeze, recalculateUserStreak } = require("../Utils/streakService");
const {
  validateImageFile,
  uploadProfileAvatar,
  deletePrivateProgressPhoto,
} = require("../Utils/cloudinary");

const PRESET_AVATAR_IDS = new Set([
  "spark",
  "flame",
  "bolt",
  "dumbbell",
  "leaf",
  "wave",
  "mountain",
  "sun",
  "heart",
  "crown",
  "compass",
  "moon",
]);

const generateTokens = (user) => {
  const payload = { id: user._id, email: user.email, name: user.name };
  const accessToken = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  });
  const refreshToken = jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
  });
  return { accessToken, refreshToken };
};

const setCookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: config.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  domain: config.COOKIE_DOMAIN || undefined,
});

// @desc Register user
// @route POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    timezone,
    age,
    gender,
    height,
    currentWeight,
    targetWeight,
    fitnessGoal,
    activityLevel,
    dietPreference,
    inviteCode,
    needsOnboarding,
  } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return sendError(res, "An account with this email already exists", 400);
  }

  let inviteGroup = null;
  if (inviteCode && String(inviteCode).trim()) {
    inviteGroup = await Group.findOne({
      inviteCode: String(inviteCode).trim().toUpperCase(),
      isActive: true,
    });
    if (inviteGroup) {
      const activeCount = await Membership.countDocuments({
        groupId: inviteGroup._id,
        status: "active",
      });
      if (activeCount >= inviteGroup.maxMembers) {
        inviteGroup = null; // still let them register cleanly, don't fail signup
      }
    }
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    timezone: timezone || config.DEFAULT_TIMEZONE,
    needsOnboarding: Boolean(needsOnboarding || inviteCode),
  });

  // Calculate customized starting targets
  const tdeeCalc = calculateTDEE({
    gender: gender || "male",
    age: age || 25,
    heightCm: height || 175,
    weightKg: currentWeight || 70,
    activityLevel: activityLevel || "moderate",
    goal: fitnessGoal || "maintenance",
  });

  const profile = await FitnessProfile.create({
    userId: user._id,
    age: age || 25,
    gender: gender || "male",
    height: height || 175,
    currentWeight: currentWeight || 70,
    targetWeight: targetWeight || currentWeight || 70,
    fitnessGoal: fitnessGoal || "maintenance",
    activityLevel: activityLevel || "moderate",
    dietPreference: dietPreference || "non_vegetarian",
    targets: tdeeCalc.targets,
    featureFlags: {
      reminders: true,
      weeklyTargets: true,
      photoCheckins: true,
    },
    featureFlagsConfigured: true,
  });

  let joinedGroup = null;
  if (inviteGroup) {
    await Membership.create({
      groupId: inviteGroup._id,
      userId: user._id,
      role: "member",
      status: "active",
    });
    joinedGroup = {
      _id: inviteGroup._id,
      name: inviteGroup.name,
      inviteCode: inviteGroup.inviteCode,
    };
    emitGroupActivity(inviteGroup._id.toString(), "member-joined", {
      userId: user._id,
      userName: user.name,
    });
  }

  const { accessToken, refreshToken } = generateTokens(user);
  res.cookie("ft_refresh_token", refreshToken, setCookieOptions());

  return sendSuccess(
    res,
    {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        timezone: user.timezone,
        currentStreak: user.currentStreak || 0,
        longestStreak: user.longestStreak || 0,
        lastLogDate: user.lastLogDate || "",
        streakFreeze: user.streakFreeze,
        socialPrivacy: user.socialPrivacy,
        needsOnboarding: user.needsOnboarding,
      },
      profile,
      joinedGroup,
      accessToken,
    },
    "User registered successfully",
    201
  );
});

// @desc Login user
// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    return sendError(res, "Invalid email or password", 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return sendError(res, "Invalid email or password", 401);
  }

  const profile = await FitnessProfile.findOne({ userId: user._id });
  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("ft_refresh_token", refreshToken, setCookieOptions());

  return sendSuccess(res, {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      timezone: user.timezone,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      lastLogDate: user.lastLogDate || "",
      streakFreeze: user.streakFreeze,
      socialPrivacy: user.socialPrivacy,
      needsOnboarding: Boolean(user.needsOnboarding),
    },
    profile,
    accessToken,
  }, "Logged in successfully");
});

// @desc Refresh token
// @route POST /api/auth/refresh
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies.ft_refresh_token || req.body.refreshToken;
  if (!token) {
    return sendError(res, "Refresh token required", 401);
  }

  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return sendError(res, "User not found", 401);
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    res.cookie("ft_refresh_token", newRefreshToken, setCookieOptions());

    return sendSuccess(res, { accessToken }, "Token refreshed successfully");
  } catch (err) {
    return sendError(res, "Invalid or expired refresh token", 401);
  }
});

// @desc Logout user
// @route POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  res.clearCookie("ft_refresh_token", setCookieOptions());
  return sendSuccess(res, null, "Logged out successfully");
});

// @desc Get current user & profile
// @route GET /api/users/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const profile = await FitnessProfile.findOne({ userId: req.user._id });
  return sendSuccess(res, { user, profile });
});

// @desc Update user profile & targets
// @route PUT /api/users/profile
const updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    timezone,
    age,
    gender,
    height,
    currentWeight,
    targetWeight,
    fitnessGoal,
    activityLevel,
    dietPreference,
    allergies,
    targets,
    privacy,
    featureFlags,
    targetDefaults,
    hideWeightNumbers,
    needsOnboarding,
  } = req.body;

  if (name || timezone || needsOnboarding !== undefined) {
    await User.findByIdAndUpdate(req.user._id, {
      ...(name && { name }),
      ...(timezone && { timezone }),
      ...(needsOnboarding !== undefined && { needsOnboarding: Boolean(needsOnboarding) }),
    });
    if (timezone) {
      const ReminderSetting = require("../Modals/ReminderSetting");
      await ReminderSetting.findOneAndUpdate(
        { userId: req.user._id },
        { $set: { timezone } }
      );
    }
  }

  let profile = await FitnessProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = new FitnessProfile({ userId: req.user._id });
  }

  if (age !== undefined) profile.age = age;
  if (gender !== undefined) profile.gender = gender;
  if (height !== undefined) profile.height = height;
  if (currentWeight !== undefined) profile.currentWeight = currentWeight;
  if (targetWeight !== undefined) profile.targetWeight = targetWeight;
  if (fitnessGoal !== undefined) profile.fitnessGoal = fitnessGoal;
  if (activityLevel !== undefined) profile.activityLevel = activityLevel;
  if (dietPreference !== undefined) profile.dietPreference = dietPreference;
  if (allergies !== undefined) profile.allergies = allergies;
  if (targets) {
    const existingTargets = profile.targets?.toObject ? profile.targets.toObject() : (profile.targets || {});
    profile.targets = { ...existingTargets, ...targets };
  }
  if (privacy) {
    const existingPrivacy = profile.privacy?.toObject ? profile.privacy.toObject() : (profile.privacy || {});
    profile.privacy = { ...existingPrivacy, ...privacy };
  }
  if (featureFlags && typeof featureFlags === "object") {
    const existingFlags = profile.featureFlags?.toObject ? profile.featureFlags.toObject() : (profile.featureFlags || {});
    profile.featureFlags = {
      reminders: featureFlags.reminders !== undefined ? Boolean(featureFlags.reminders) : Boolean(existingFlags.reminders),
      weeklyTargets: featureFlags.weeklyTargets !== undefined ? Boolean(featureFlags.weeklyTargets) : Boolean(existingFlags.weeklyTargets),
      photoCheckins: featureFlags.photoCheckins !== undefined ? Boolean(featureFlags.photoCheckins) : Boolean(existingFlags.photoCheckins),
    };
    profile.featureFlagsConfigured = true;
  }
  if (targetDefaults && typeof targetDefaults === "object") {
    const existingDefaults = profile.targetDefaults?.toObject ? profile.targetDefaults.toObject() : (profile.targetDefaults || {});
    profile.targetDefaults = { ...existingDefaults, ...targetDefaults };
  }
  if (hideWeightNumbers !== undefined) {
    profile.hideWeightNumbers = Boolean(hideWeightNumbers);
  }

  await profile.save();
  const updatedUser = await User.findById(req.user._id);

  // Sync today's WaterLog target & water points if user updated their hydration target
  if (targets && targets.waterMl !== undefined && profile.targets?.waterMl) {
    const todayStr = getLocalDateString(
      new Date(),
      updatedUser?.timezone || req.user.timezone || "Asia/Kolkata"
    );
    const todayWaterLog = await WaterLog.findOne({
      userId: req.user._id,
      date: todayStr,
    });
    if (todayWaterLog) {
      todayWaterLog.targetMl = profile.targets.waterMl;
      await todayWaterLog.save();

      const totalConsumed = (todayWaterLog.entries || []).reduce(
        (sum, entry) => sum + (entry.amountMl || 0),
        0
      );
      await syncDailyHabitPoints({
        userId: req.user._id,
        date: todayStr,
        type: "water",
        points: totalConsumed >= todayWaterLog.targetMl ? POINTS_RULES.WATER_GOAL_REACHED : 0,
        meta: { totalConsumed, targetMl: todayWaterLog.targetMl },
        eventName: "squad-sync",
      });
    }
  }

  return sendSuccess(res, { user: updatedUser, profile }, "Profile updated successfully");
});

// @desc Update feature flags and experience settings
// @route PUT /api/users/features
const updateFeatureSettings = asyncHandler(async (req, res) => {
  const { reminders, weeklyTargets, photoCheckins, hideWeightNumbers } = req.body;

  let profile = await FitnessProfile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = new FitnessProfile({ userId: req.user._id });
  }

  const existingFlags = profile.featureFlags?.toObject
    ? profile.featureFlags.toObject()
    : (profile.featureFlags || {});

  profile.featureFlags = {
    reminders: reminders !== undefined ? Boolean(reminders) : Boolean(existingFlags.reminders),
    weeklyTargets: weeklyTargets !== undefined ? Boolean(weeklyTargets) : Boolean(existingFlags.weeklyTargets),
    photoCheckins: photoCheckins !== undefined ? Boolean(photoCheckins) : Boolean(existingFlags.photoCheckins),
  };
  profile.featureFlagsConfigured = true;

  if (hideWeightNumbers !== undefined) {
    profile.hideWeightNumbers = Boolean(hideWeightNumbers);
  }

  await profile.save();
  return sendSuccess(
    res,
    {
      featureFlags: profile.featureFlags,
      featureFlagsConfigured: profile.featureFlagsConfigured,
      hideWeightNumbers: profile.hideWeightNumbers,
      profile,
    },
    "Feature settings updated"
  );
});

// @desc Upload profile photo or choose preset avatar
// @route POST /api/users/avatar
const uploadAvatar = asyncHandler(async (req, res) => {
  const file =
    req.file ||
    req.files?.photo?.[0] ||
    req.files?.avatar?.[0] ||
    null;

  const existingUser = await User.findById(req.user._id).select("+profileImagePublicId");
  if (!existingUser) {
    return sendError(res, "User not found", 404);
  }
  const previousPublicId = existingUser.profileImagePublicId || "";

  let nextProfileImage = null;
  let nextPublicId = "";

  if (file) {
    const check = validateImageFile(file);
    if (!check.valid) {
      return sendError(res, check.message, 400);
    }

    try {
      const uploaded = await uploadProfileAvatar(file.buffer, {
        userId: String(req.user._id),
      });
      nextProfileImage = uploaded.url;
      nextPublicId = uploaded.publicId || "";
    } catch (err) {
      if (err?.statusCode === 503) {
        return sendError(
          res,
          "Photo storage isn't configured on the server yet. You can still choose any built-in avatar.",
          503
        );
      }
      throw err;
    }
  } else {
    const rawAvatarId = req.body?.avatarId;
    const rawImageUrl = req.body?.imageUrl;

    if (rawAvatarId) {
      const cleanId = String(rawAvatarId).replace(/^avatar:/, "").trim();
      if (!PRESET_AVATAR_IDS.has(cleanId)) {
        return sendError(res, "Unsupported preset avatar selected", 400);
      }
      nextProfileImage = `avatar:${cleanId}`;
      nextPublicId = "";
    } else if (typeof rawImageUrl === "string" && rawImageUrl.trim()) {
      const trimmed = rawImageUrl.trim();
      if (trimmed.startsWith("avatar:")) {
        const cleanId = trimmed.slice("avatar:".length).trim();
        if (!PRESET_AVATAR_IDS.has(cleanId)) {
          return sendError(res, "Unsupported preset avatar selected", 400);
        }
        nextProfileImage = `avatar:${cleanId}`;
        nextPublicId = "";
      } else if (/^https?:\/\//i.test(trimmed) || /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed)) {
        nextProfileImage = trimmed;
        nextPublicId = "";
      } else {
        return sendError(res, "Please provide a valid image URL or preset avatar", 400);
      }
    } else {
      return sendError(res, "Please upload a photo or pick an avatar", 400);
    }
  }

  existingUser.profileImage = nextProfileImage;
  existingUser.profileImagePublicId = nextPublicId;
  await existingUser.save();

  if (previousPublicId && previousPublicId !== nextPublicId) {
    await deletePrivateProgressPhoto(previousPublicId);
  }

  const cleanUser = await User.findById(req.user._id);
  return sendSuccess(res, { user: cleanUser }, "Profile picture updated successfully");
});

// @desc Remove profile photo / preset avatar (revert to initials)
// @route DELETE /api/users/avatar
const removeAvatar = asyncHandler(async (req, res) => {
  const existingUser = await User.findById(req.user._id).select("+profileImagePublicId");
  if (!existingUser) {
    return sendError(res, "User not found", 404);
  }
  const previousPublicId = existingUser.profileImagePublicId || "";

  existingUser.profileImage = "";
  existingUser.profileImagePublicId = "";
  await existingUser.save();

  if (previousPublicId) {
    await deletePrivateProgressPhoto(previousPublicId);
  }

  const cleanUser = await User.findById(req.user._id);
  return sendSuccess(res, { user: cleanUser }, "Profile photo removed");
});

// @desc Update social privacy settings (feed weight visibility, recap weight visibility, nudges)
// @route PUT /api/users/me/social-settings
const updateSocialSettings = asyncHandler(async (req, res) => {
  const { showWeightInFeed, showWeightInRecap, allowNudges } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    return sendError(res, "User not found", 404);
  }

  user.socialPrivacy = {
    showWeightInFeed:
      showWeightInFeed !== undefined
        ? Boolean(showWeightInFeed)
        : Boolean(user.socialPrivacy?.showWeightInFeed),
    showWeightInRecap:
      showWeightInRecap !== undefined
        ? Boolean(showWeightInRecap)
        : Boolean(user.socialPrivacy?.showWeightInRecap),
    allowNudges:
      allowNudges !== undefined
        ? Boolean(allowNudges)
        : user.socialPrivacy?.allowNudges !== false,
  };
  await user.save();

  return sendSuccess(
    res,
    { socialPrivacy: user.socialPrivacy, user },
    "Social privacy settings updated"
  );
});

// @desc Activate weekly streak freeze (1 per Mon-Sun week)
// @route POST /api/users/me/streak-freeze
const activateStreakFreeze = asyncHandler(async (req, res) => {
  const result = await useStreakFreeze(req.user._id, req.body?.targetDate || null);
  if (!result.ok) {
    return sendError(res, result.reason, 400);
  }
  return sendSuccess(
    res,
    result,
    `Streak freeze applied for ${result.frozenDate}! Your streak is safe ❄️`
  );
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateProfile,
  updateFeatureSettings,
  uploadAvatar,
  removeAvatar,
  updateSocialSettings,
  activateStreakFreeze,
};
