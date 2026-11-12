const Challenge = require("../Modals/Challenge");
const ChallengeEntry = require("../Modals/ChallengeEntry");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const MealLog = require("../Modals/MealLog");
const WaterLog = require("../Modals/WaterLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const WeightLog = require("../Modals/WeightLog");
const Notification = require("../Modals/Notification");
const PointsLedger = require("../Modals/PointsLedger");
const { calculateChartTotals } = require("../Controllers/mealController");
const { getLocalDateString, getISOWeekDetails } = require("../Utils/date");
const { fetchUserLoggedDatesSet } = require("./streakService");
const { emitSquadFeedEvent } = require("./feedService");
const { sendPushToUser } = require("./pushService");
const { emitGroupActivity } = require("./socket");

const CHALLENGE_TEMPLATES = [
  {
    templateKey: "water_5_days",
    challengeType: "water_5_days",
    title: "8 Glasses for 5 Days",
    description: "Log at least 2,000 ml (8 glasses) of water on 5 days between Monday and Sunday.",
    target: 5,
    unit: "days",
  },
  {
    templateKey: "most_days_logged",
    challengeType: "most_days_logged",
    title: "Most Days Logged",
    description: "Stay consistent: log meals, water, weight, or workouts on as many days as you can.",
    target: 7,
    unit: "days",
  },
  {
    templateKey: "most_meals_ticked",
    challengeType: "most_meals_ticked",
    title: "Most Meals Ticked Off",
    description: "Check off your planned meals cleanly all week — consistency builds momentum!",
    target: 21,
    unit: "meals",
  },
  {
    templateKey: "full_diet_completion",
    challengeType: "full_diet_completion",
    title: "Full Diet Chart Completion",
    description: "Complete 100% of your planned diet chart on 5 days this week.",
    target: 5,
    unit: "perfect days",
  },
];

const TEMPLATE_BY_KEY = new Map(CHALLENGE_TEMPLATES.map((t) => [t.templateKey, t]));

/**
 * Computes live progress for a user in any legacy or weekly-template Challenge.
 */
const computeChallengeMemberProgress = async (challenge, userId, fallbackProgress = 0) => {
  const range = { $gte: challenge.startDate, $lte: challenge.endDate };

  switch (challenge.challengeType) {
    case "water_5_days": {
      const logs = await WaterLog.find({ userId, date: range }).lean();
      let daysHit = 0;
      for (const w of logs) {
        const sum = (w.entries || []).reduce((acc, e) => acc + (Number(e.amountMl) || 0), 0);
        if (sum >= 2000) daysHit += 1;
      }
      return daysHit;
    }

    case "water_goal": {
      const logs = await WaterLog.find({ userId, date: range }).lean();
      let daysHit = 0;
      for (const w of logs) {
        const sum = (w.entries || []).reduce((acc, e) => acc + (Number(e.amountMl) || 0), 0);
        if (sum >= (w.targetMl || 2000)) daysHit += 1;
      }
      return daysHit;
    }

    case "most_days_logged": {
      const { loggedDatesSet } = await fetchUserLoggedDatesSet(
        userId,
        challenge.startDate,
        challenge.endDate
      );
      return loggedDatesSet.size;
    }

    case "most_meals_ticked": {
      const logs = await MealLog.find({ userId, date: range }).lean();
      let eatenCount = 0;
      for (const log of logs) {
        for (const m of log.meals || []) {
          if (m.status === "eaten") {
            eatenCount += 1;
          } else if ((m.plannedFoodItems || []).some((it) => it.eaten)) {
            eatenCount += 1;
          }
        }
      }
      return eatenCount;
    }

    case "full_diet_completion": {
      const logs = await MealLog.find({ userId, date: range }).lean();
      let fullDays = 0;
      for (const log of logs) {
        if (log.meals && log.meals.length > 0) {
          const totals = calculateChartTotals(log.meals);
          if (totals.totalItems > 0 && totals.completionPercentage >= 100) {
            fullDays += 1;
          } else if (totals.totalMeals > 0 && totals.mealsCompleted >= totals.totalMeals) {
            fullDays += 1;
          }
        }
      }
      return fullDays;
    }

    case "meal_completion": {
      const logs = await MealLog.find({ userId, date: range }).lean();
      let days80 = 0;
      for (const log of logs) {
        if (log.meals && log.meals.length > 0) {
          const totals = calculateChartTotals(log.meals);
          const pct =
            totals.totalItems > 0
              ? totals.completionPercentage
              : Math.round((totals.mealsCompleted / totals.totalMeals) * 100);
          if (pct >= 80) days80 += 1;
        }
      }
      return days80;
    }

    case "workout_days": {
      const workouts = await WorkoutSession.find({
        userId,
        date: range,
        status: { $in: ["completed", "rest"] },
      }).lean();
      return workouts.length;
    }

    case "streak":
    default:
      return fallbackProgress || 0;
  }
};

/**
 * Picks or rotates the weekly Mon-Sun challenge for a group and auto-enrolls all active members.
 */
const ensureWeeklyChallengeForGroup = async (groupId, { templateKey = null, createdBy = null } = {}) => {
  const group = await Group.findById(groupId);
  if (!group || !group.isActive) return null;

  const todayStr = getLocalDateString(new Date(), "Asia/Kolkata");
  const { weekStart, weekEnd } = getISOWeekDetails(todayStr);

  // If explicit template override requested, archive existing active weekly auto challenge or create/replace cleanly
  const existingWeekly = await Challenge.findOne({
    groupId,
    weekStart,
    isAutoWeekly: true,
    status: "active",
  });

  if (existingWeekly && !templateKey) {
    // Ensure new members are enrolled
    const memberships = await Membership.find({ groupId, status: "active" }).select("userId").lean();
    for (const m of memberships) {
      await ChallengeEntry.findOneAndUpdate(
        { challengeId: existingWeekly._id, userId: m.userId },
        { $setOnInsert: { progress: 0, completed: false } },
        { upsert: true }
      );
    }
    return existingWeekly;
  }

  let selectedTemplate = templateKey ? TEMPLATE_BY_KEY.get(templateKey) : null;
  if (!selectedTemplate) {
    if (group.challengeSettings?.preferredTemplate && TEMPLATE_BY_KEY.has(group.challengeSettings.preferredTemplate)) {
      selectedTemplate = TEMPLATE_BY_KEY.get(group.challengeSettings.preferredTemplate);
    } else {
      const idx = (group.challengeSettings?.rotationIndex || 0) % CHALLENGE_TEMPLATES.length;
      selectedTemplate = CHALLENGE_TEMPLATES[idx];
      group.challengeSettings = {
        ...(group.challengeSettings || {}),
        rotationIndex: (group.challengeSettings?.rotationIndex || 0) + 1,
      };
    }
  }

  if (existingWeekly && templateKey) {
    existingWeekly.challengeType = selectedTemplate.challengeType;
    existingWeekly.templateKey = selectedTemplate.templateKey;
    existingWeekly.title = selectedTemplate.title;
    existingWeekly.description = selectedTemplate.description;
    existingWeekly.target = selectedTemplate.target;
    await existingWeekly.save();
    return existingWeekly;
  }

  const created = await Challenge.create({
    groupId,
    title: selectedTemplate.title,
    description: selectedTemplate.description,
    challengeType: selectedTemplate.challengeType,
    templateKey: selectedTemplate.templateKey,
    isAutoWeekly: true,
    weekStart,
    target: selectedTemplate.target,
    startDate: weekStart,
    endDate: weekEnd,
    createdBy: createdBy || group.createdBy,
    status: "active",
  });

  if (group.isModified("challengeSettings")) {
    await group.save();
  }

  const memberships = await Membership.find({ groupId, status: "active" }).select("userId").lean();
  for (const m of memberships) {
    await ChallengeEntry.findOneAndUpdate(
      { challengeId: created._id, userId: m.userId },
      { $setOnInsert: { progress: 0, completed: false } },
      { upsert: true }
    );
  }

  return created;
};

/**
 * Closes ended challenges, awards winner XP, notifies squad, and emits challenge_won feed event.
 */
const finalizeEndedChallenges = async () => {
  const todayStr = getLocalDateString(new Date(), "Asia/Kolkata");
  const ended = await Challenge.find({
    status: "active",
    endDate: { $lt: todayStr },
  });

  const closedResults = [];
  for (const ch of ended) {
    const entries = await ChallengeEntry.find({ challengeId: ch._id }).populate("userId", "name");
    let maxProgress = -1;
    const updatedEntries = [];

    for (const entry of entries) {
      if (!entry.userId) continue;
      const progress = await computeChallengeMemberProgress(ch, entry.userId._id, entry.progress);
      entry.progress = progress;
      entry.completed = progress >= ch.target;
      if (entry.completed && !entry.completedAt) entry.completedAt = new Date();
      await entry.save();
      if (progress > maxProgress) maxProgress = progress;
      updatedEntries.push(entry);
    }

    const winners =
      maxProgress > 0
        ? updatedEntries.filter((e) => e.progress === maxProgress)
        : [];

    ch.status = "completed";
    ch.winnerUserIds = winners.map((w) => w.userId._id);
    await ch.save();

    for (const w of winners) {
      // Idempotently grant +50 challenge win XP
      await PointsLedger.findOneAndUpdate(
        {
          userId: w.userId._id,
          type: "bonus",
          periodKey: `challenge_win_${ch._id}`,
        },
        {
          $setOnInsert: {
            groupId: ch.groupId,
            date: ch.endDate,
            points: 50,
            meta: { challengeId: ch._id, title: ch.title },
          },
        },
        { upsert: true }
      );

      await emitSquadFeedEvent({
        userId: w.userId._id,
        groupId: ch.groupId,
        type: "challenge_won",
        title: `won "${ch.title}" 🏆 (+50 XP)`,
        dateKey: ch.endDate,
        dedupeKey: `challenge_won_${ch._id}_${w.userId._id}`,
        meta: { challengeId: ch._id, title: ch.title, progress: w.progress },
      });

      const notifTitle = `🏆 Challenge Won: ${ch.title}`;
      const notifBody = `You led your squad with ${w.progress}/${ch.target} and earned +50 XP!`;
      await Notification.create({
        userId: w.userId._id,
        type: "challenge",
        title: notifTitle,
        body: notifBody,
        data: { groupId: ch.groupId, challengeId: ch._id, route: "/group" },
      });
      await sendPushToUser(w.userId._id, {
        title: notifTitle,
        body: notifBody,
        url: "/group",
        type: "challenge",
        tag: `challenge-win-${ch._id}`,
      });
    }

    emitGroupActivity(ch.groupId.toString(), "challenge-completed", {
      challengeId: ch._id,
      title: ch.title,
      winners: winners.map((w) => w.userId.name),
    });

    closedResults.push({ challengeId: ch._id, winners: winners.length });
  }

  return closedResults;
};

module.exports = {
  CHALLENGE_TEMPLATES,
  TEMPLATE_BY_KEY,
  computeChallengeMemberProgress,
  ensureWeeklyChallengeForGroup,
  finalizeEndedChallenges,
};
