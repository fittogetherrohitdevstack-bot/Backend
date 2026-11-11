const PointsLedger = require("../Modals/PointsLedger");
const Membership = require("../Modals/Membership");

/**
 * Awards consistency-only points idempotently (once per user/type/periodKey)
 * when the user belongs to at least one active squad.
 * Never rewards weight loss or body dimensions — only the habit of showing up.
 */
const awardConsistencyPoints = async ({
  userId,
  date,
  periodKey,
  type,
  points,
  meta = {},
}) => {
  try {
    const memberships = await Membership.find({
      userId,
      status: "active",
    })
      .select("groupId")
      .lean();

    if (!memberships.length) return { awarded: false, reason: "no_group" };

    const canonicalPeriod = periodKey || date;
    const existingForPeriod = await PointsLedger.findOne({
      userId,
      type,
      "meta.periodKey": canonicalPeriod,
    }).lean();

    if (existingForPeriod) {
      return { awarded: false, deduplicated: true, entryId: existingForPeriod._id };
    }

    // Use primary active group for leaderboard consistency accounting
    const groupId = memberships[0].groupId;
    const doc = await PointsLedger.findOneAndUpdate(
      { userId, date, type },
      {
        $setOnInsert: {
          userId,
          groupId,
          date,
          type,
          points,
          meta: {
            ...meta,
            periodKey: canonicalPeriod,
          },
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return { awarded: true, entryId: doc._id, points };
  } catch (err) {
    if (err?.code === 11000) {
      return { awarded: false, deduplicated: true };
    }
    return { awarded: false, error: err.message };
  }
};

module.exports = {
  awardConsistencyPoints,
};
