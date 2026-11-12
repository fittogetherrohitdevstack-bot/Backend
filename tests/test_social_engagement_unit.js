const { test } = require("node:test");
const assert = require("node:assert");

const { calculateStreakFromActivity } = require("../Utils/streakService");
const { serializeFeedEvent, toggleFeedEventReaction } = require("../Utils/feedService");
const { sendPushToUser, isPushCategoryEnabled } = require("../Utils/pushService");
const { CHALLENGE_TEMPLATES, computeChallengeMemberProgress } = require("../Utils/challengeService");

const User = require("../Modals/User");
const Membership = require("../Modals/Membership");
const NudgeLog = require("../Modals/NudgeLog");
const Notification = require("../Modals/Notification");
const FeedEvent = require("../Modals/FeedEvent");
const WaterLog = require("../Modals/WaterLog");
const MealLog = require("../Modals/MealLog");
const WeightLog = require("../Modals/WeightLog");
const WorkoutSession = require("../Modals/WorkoutSession");
const PointsLedger = require("../Modals/PointsLedger");
const WeeklyRecap = require("../Modals/WeeklyRecap");
const Group = require("../Modals/Group");

const nudgeController = require("../Controllers/nudgeController");
const feedController = require("../Controllers/feedController");
const leaderboardController = require("../Controllers/leaderboardController");
const groupController = require("../Controllers/groupController");
const { generateWeeklyRecapForUser } = require("../Utils/recapService");

const invokeController = (fn, req) =>
  new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve(this);
        return this;
      },
    };
    Promise.resolve(fn(req, res, (err) => (err ? reject(err) : resolve(res)))).catch(reject);
  });

const wrapLeanChain = (value) => ({
  select: () => wrapLeanChain(value),
  populate: () => wrapLeanChain(value),
  sort: () => wrapLeanChain(value),
  lean: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

test("Phase 1: calculateStreakFromActivity supports weekly streak freeze & preserves active chain", () => {
  const dates = [
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
    "2026-11-09", // missed, covered by freeze
    "2026-11-10",
    "2026-11-11",
    "2026-11-12", // today not yet logged -> still keeps chain up to 11th!
  ];

  const loggedDatesSet = new Set([
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
    "2026-11-10",
    "2026-11-11",
  ]);
  const frozenDatesSet = new Set(["2026-11-09"]);

  const res = calculateStreakFromActivity({
    lookbackDates: dates,
    loggedDatesSet,
    frozenDatesSet,
    todayStr: "2026-11-12",
  });

  assert.strictEqual(res.currentStreak, 6);
  assert.strictEqual(res.longestStreak, 6);
  assert.strictEqual(res.lastLogDate, "2026-11-11");
  assert.strictEqual(res.todayLogged, false);

  // Without freeze, only 2026-11-10 and 2026-11-11 form current streak
  const withoutFreeze = calculateStreakFromActivity({
    lookbackDates: dates,
    loggedDatesSet,
    frozenDatesSet: new Set(),
    todayStr: "2026-11-12",
  });
  assert.strictEqual(withoutFreeze.currentStreak, 2);
  assert.strictEqual(withoutFreeze.longestStreak, 3);
});

test("Phase 2: Feed privacy hides weight by default & enforces 1 reaction per emoji per user + squad isolation", async () => {
  const hiddenWeightEvent = serializeFeedEvent(
    {
      _id: "ev1",
      groupId: "g1",
      userId: { _id: "u1", name: "Rohit", socialPrivacy: { showWeightInFeed: false } },
      type: "logged_weight",
      title: "logged weight (72.5 kg) ✅",
      dateKey: "2026-11-12",
      meta: { weightKg: 72.5, showWeight: false },
      reactions: [{ emoji: "🔥", userId: "u2" }],
    },
    "u2"
  );

  assert.strictEqual(hiddenWeightEvent.title, "logged weight ✅");
  assert.strictEqual(hiddenWeightEvent.meta.weightKg, undefined);
  assert.strictEqual(hiddenWeightEvent.reactionCounts["🔥"], 1);
  assert.deepStrictEqual(hiddenWeightEvent.myReactions, ["🔥"]);

  // Squad isolation on reactToFeedEvent (non-member receives 403)
  const origFeedFindById = FeedEvent.findById;
  const origMemberFindOne = Membership.findOne;
  try {
    FeedEvent.findById = () => wrapLeanChain({ _id: "65f000000000000000000101", groupId: "65f000000000000000000202" });
    Membership.findOne = () => wrapLeanChain(null);

    const res = await invokeController(feedController.reactToFeedEvent, {
      params: { eventId: "65f000000000000000000101" },
      body: { emoji: "👏" },
      user: { _id: "65f000000000000000000999" },
    });

    assert.strictEqual(res.statusCode, 403);
  } finally {
    FeedEvent.findById = origFeedFindById;
    Membership.findOne = origMemberFindOne;
  }
});

test("Phase 3: Nudge enforces mute setting, max 1/sender/day, and max 3/receiver/day", async () => {
  const origMemFindOne = Membership.findOne;
  const origUserFindById = User.findById;
  const origNudgeCount = NudgeLog.countDocuments;

  try {
    // 1) Muted receiver -> 400
    Membership.findOne = () => wrapLeanChain({ _id: "m1", status: "active" });
    User.findById = () =>
      wrapLeanChain({ _id: "u2", name: "Alex", timezone: "Asia/Kolkata", socialPrivacy: { allowNudges: false } });

    const mutedRes = await invokeController(nudgeController.nudgeMember, {
      group: { _id: "g1", name: "Iron" },
      user: { _id: "u1", name: "Rohit" },
      body: { targetUserId: "u2" },
    });
    assert.strictEqual(mutedRes.statusCode, 400);

    // 2) Already nudged by sender today -> 429
    User.findById = () =>
      wrapLeanChain({ _id: "u2", name: "Alex", timezone: "Asia/Kolkata", socialPrivacy: { allowNudges: true } });
    NudgeLog.countDocuments = async (query) => (query.senderId ? 1 : 1);

    const repeatRes = await invokeController(nudgeController.nudgeMember, {
      group: { _id: "g1", name: "Iron" },
      user: { _id: "u1", name: "Rohit" },
      body: { targetUserId: "u2" },
    });
    assert.strictEqual(repeatRes.statusCode, 429);

    // 3) Receiver hit 3 nudges total today -> 429
    NudgeLog.countDocuments = async (query) => (query.senderId ? 0 : 3);
    const capRes = await invokeController(nudgeController.nudgeMember, {
      group: { _id: "g1", name: "Iron" },
      user: { _id: "u1", name: "Rohit" },
      body: { targetUserId: "u2" },
    });
    assert.strictEqual(capRes.statusCode, 429);
  } finally {
    Membership.findOne = origMemFindOne;
    User.findById = origUserFindById;
    NudgeLog.countDocuments = origNudgeCount;
  }
});

test("Phase 4: Web Push removes expired 404/410 subscriptions & respects category preferences", async () => {
  assert.strictEqual(
    isPushCategoryEnabled({ channels: { push: true }, nudges: { enabled: false } }, "nudge"),
    false
  );
  assert.strictEqual(
    isPushCategoryEnabled({ channels: { push: true }, nudges: { enabled: true } }, "nudge"),
    true
  );

  let deletedIds = [];
  const fakeSubModel = {
    find: async () => [
      { _id: "sub_valid", endpoint: "https://push.example/1", keys: { p256dh: "a", auth: "b" } },
      { _id: "sub_expired", endpoint: "https://push.example/2", keys: { p256dh: "c", auth: "d" } },
    ],
    deleteMany: async (filter) => {
      deletedIds = filter._id.$in;
    },
  };
  const fakeSettingModel = {
    findOne: () => wrapLeanChain({ channels: { push: true }, nudges: { enabled: true } }),
  };

  const result = await sendPushToUser(
    "u1",
    { title: "Test", body: "Hello", type: "nudge" },
    {
      forceVapid: true,
      PushSubscription: fakeSubModel,
      ReminderSetting: fakeSettingModel,
      sendNotification: async (sub) => {
        if (sub.endpoint.endsWith("/2")) {
          const err = new Error("Gone");
          err.statusCode = 410;
          throw err;
        }
      },
    }
  );

  assert.strictEqual(result.sent, 1);
  assert.strictEqual(result.removed, 1);
  assert.deepStrictEqual(deletedIds, ["sub_expired"]);
});

test("Phase 5: Weekly challenge templates compute progress accurately", async () => {
  assert.strictEqual(CHALLENGE_TEMPLATES.length, 4);

  const origWaterFind = WaterLog.find;
  try {
    WaterLog.find = () =>
      wrapLeanChain([
        { date: "2026-11-09", entries: [{ amountMl: 2200 }] },
        { date: "2026-11-10", entries: [{ amountMl: 1500 }] }, // under 2000ml
        { date: "2026-11-11", entries: [{ amountMl: 2000 }] },
      ]);

    const daysHit = await computeChallengeMemberProgress(
      { challengeType: "water_5_days", startDate: "2026-11-09", endDate: "2026-11-15" },
      "u1"
    );
    assert.strictEqual(daysHit, 2);
  } finally {
    WaterLog.find = origWaterFind;
  }
});

test("Phase 6 & 8: Weekly Recap gates weight change by privacy & flags lowest XP for optional fun stakes", async () => {
  const origUserFindById = User.findById;
  const origWaterFind = WaterLog.find;
  const origWeightFind = WeightLog.find;
  const origMealFind = MealLog.find;
  const origWorkoutFind = WorkoutSession.find;
  const origLedgerFind = PointsLedger.find;
  const origMemFindOne = Membership.findOne;
  const origMemFind = Membership.find;
  const origUserSave = User.findByIdAndUpdate;

  try {
    User.findById = () =>
      wrapLeanChain({
        _id: "u1",
        name: "Rohit",
        timezone: "Asia/Kolkata",
        currentStreak: 5,
        longestStreak: 9,
        socialPrivacy: { showWeightInRecap: false },
      });
    WaterLog.find = () => wrapLeanChain([{ date: "2026-11-10", entries: [{ amountMl: 2500 }] }]);
    WeightLog.find = () =>
      wrapLeanChain([
        { date: "2026-11-09", weightKg: 75.0 },
        { date: "2026-11-12", weightKg: 74.1 },
      ]);
    MealLog.find = () => wrapLeanChain([]);
    WorkoutSession.find = () => wrapLeanChain([]);
    PointsLedger.find = (q) => {
      if (q.userId === "u1") {
        return wrapLeanChain([{ userId: "u1", points: 45 }]);
      }
      return wrapLeanChain([
        { userId: "u1", points: 45 },
        { userId: "u2", points: 90 },
      ]);
    };
    Membership.findOne = () =>
      wrapLeanChain({
        groupId: {
          _id: "g1",
          name: "Chai Squad",
          inviteCode: "CHAI88",
          currentStreak: 3,
          weeklyStakes: { enabled: true, forfeitText: "Loser buys chai" },
        },
      });
    Membership.find = () =>
      wrapLeanChain([
        { userId: { _id: "u1", name: "Rohit" } },
        { userId: { _id: "u2", name: "Sam" } },
      ]);

    const recap = await generateWeeklyRecapForUser("u1", { persist: false });
    assert.strictEqual(recap.stats.weightChangeAllowed, false);
    assert.strictEqual(recap.stats.weightChangeKg, null);
    assert.strictEqual(recap.stats.waterTotalMl, 2500);
    assert.strictEqual(recap.stats.squadRank, 2);
    assert.strictEqual(recap.stats.forfeitAlert.enabled, true);
    assert.strictEqual(recap.stats.forfeitAlert.lowestMemberName, "Rohit");
    assert.strictEqual(recap.stats.forfeitAlert.isCurrentUserLowest, true);
    assert.strictEqual(recap.stats.forfeitAlert.forfeitText, "Loser buys chai");
  } finally {
    User.findById = origUserFindById;
    WaterLog.find = origWaterFind;
    WeightLog.find = origWeightFind;
    MealLog.find = origMealFind;
    WorkoutSession.find = origWorkoutFind;
    PointsLedger.find = origLedgerFind;
    Membership.findOne = origMemFindOne;
    Membership.find = origMemFind;
  }
});

test("Phase 7: Public invite preview exposes only safe squad metadata without logs", async () => {
  const origGroupFindOne = Group.findOne;
  const origMemCount = Membership.countDocuments;
  try {
    Group.findOne = () =>
      wrapLeanChain({
        _id: "g1",
        name: "Morning Hustlers",
        description: "6 AM club",
        inviteCode: "FIT123",
        maxMembers: 15,
        currentStreak: 4,
        longestStreak: 10,
      });
    Membership.countDocuments = async () => 6;

    const res = await invokeController(groupController.getInvitePreview, {
      params: { code: "fit123" },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.squad.name, "Morning Hustlers");
    assert.strictEqual(res.body.data.squad.memberCount, 6);
    assert.strictEqual(res.body.data.squad.currentStreak, 4);
    assert.strictEqual(res.body.data.squad.members, undefined);
  } finally {
    Group.findOne = origGroupFindOne;
    Membership.countDocuments = origMemCount;
  }
});
