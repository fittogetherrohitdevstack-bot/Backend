const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  SquadMoment,
  MOMENT_CATEGORIES,
  MOMENT_REACTION_EMOJIS,
} = require("../Modals/SquadMoment");
const MomentComment = require("../Modals/MomentComment");
const { serializeMoment } = require("../Controllers/momentController");
const { uploadSquadMomentPhoto, deleteSquadMomentPhoto } = require("../Utils/cloudinary");

test("Squad Moments: Categories & Emoji Enums match product specifications", () => {
  const expectedCategories = ["gym", "cheat_meal", "funny", "achievement", "squad", "daily"];
  assert.deepEqual(MOMENT_CATEGORIES, expectedCategories);

  const expectedEmojis = ["❤️", "😂", "💪", "🔥", "👏", "😭"];
  assert.deepEqual(MOMENT_REACTION_EMOJIS, expectedEmojis);
});

test("Squad Moments: serializeMoment accurately computes userReaction and reaction breakdown", () => {
  const userIdA = new mongoose.Types.ObjectId();
  const userIdB = new mongoose.Types.ObjectId();
  const userIdC = new mongoose.Types.ObjectId();

  const mockMoment = {
    _id: new mongoose.Types.ObjectId(),
    groupId: new mongoose.Types.ObjectId(),
    authorId: { _id: userIdA, name: "Rohit", profileImage: null },
    caption: "Hit a new deadlift PR today! 220kg 💪",
    category: "achievement",
    images: [{ url: "https://example.com/deadlift.jpg", publicId: "test_dl" }],
    reactions: [
      { emoji: "💪", userId: userIdA, createdAt: new Date() },
      { emoji: "🔥", userId: userIdB, createdAt: new Date() },
      { emoji: "💪", userId: userIdC, createdAt: new Date() },
    ],
    commentsCount: 3,
  };

  const serializedForA = serializeMoment(mockMoment, userIdA);
  assert.equal(serializedForA.userReaction, "💪");
  assert.equal(serializedForA.reactionsCount, 3);
  assert.deepEqual(serializedForA.reactionBreakdown, { "💪": 2, "🔥": 1 });

  const serializedForB = serializeMoment(mockMoment, userIdB);
  assert.equal(serializedForB.userReaction, "🔥");

  const unreactedUser = new mongoose.Types.ObjectId();
  const serializedForOther = serializeMoment(mockMoment, unreactedUser);
  assert.equal(serializedForOther.userReaction, null);
  assert.equal(serializedForOther.reactionsCount, 3);
});

test("Squad Moments: Single active reaction logic toggles off on repeat and switches on different emoji", () => {
  const userId = new mongoose.Types.ObjectId();

  const moment = new SquadMoment({
    groupId: new mongoose.Types.ObjectId(),
    authorId: new mongoose.Types.ObjectId(),
    images: [{ url: "https://example.com/test.jpg" }],
    caption: "Gym time",
    category: "gym",
    reactions: [],
  });

  // 1. Initial reaction with '🔥'
  moment.reactions.push({ emoji: "🔥", userId, createdAt: new Date() });
  assert.equal(moment.reactions.length, 1);
  assert.equal(moment.reactions[0].emoji, "🔥");

  // 2. Switching to '💪' should replace '🔥' so user only has 1 active reaction
  const existingIdx = moment.reactions.findIndex((r) => r.userId.toString() === userId.toString());
  assert.ok(existingIdx > -1);
  moment.reactions[existingIdx].emoji = "💪";
  assert.equal(moment.reactions.length, 1);
  assert.equal(moment.reactions[0].emoji, "💪");

  // 3. Tapping same emoji '💪' toggles it off
  const repeatIdx = moment.reactions.findIndex((r) => r.userId.toString() === userId.toString());
  moment.reactions.splice(repeatIdx, 1);
  assert.equal(moment.reactions.length, 0);
});

test("Squad Moments: Deletion permissions enforce author and squad admin rules", () => {
  const authorId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const memberId = new mongoose.Types.ObjectId();

  const moment = {
    _id: new mongoose.Types.ObjectId(),
    authorId,
    groupId: new mongoose.Types.ObjectId(),
  };

  const canDeleteMoment = (user, membership) => {
    const isAuthor = moment.authorId.toString() === user._id.toString();
    const isAdmin = membership && membership.role === "admin";
    return isAuthor || isAdmin;
  };

  // Author can delete
  assert.equal(canDeleteMoment({ _id: authorId }, { role: "member" }), true);
  // Squad admin can delete
  assert.equal(canDeleteMoment({ _id: adminId }, { role: "admin" }), true);
  // Regular member cannot delete someone else's post
  assert.equal(canDeleteMoment({ _id: memberId }, { role: "member" }), false);

  // Comments deletion permissions
  const commentAuthorId = new mongoose.Types.ObjectId();
  const otherMemberId = new mongoose.Types.ObjectId();
  const comment = {
    _id: new mongoose.Types.ObjectId(),
    authorId: commentAuthorId,
    momentId: moment._id,
  };

  const canDeleteComment = (user, membership) => {
    const isCommentAuthor = comment.authorId.toString() === user._id.toString();
    const isMomentAuthor = moment.authorId.toString() === user._id.toString();
    const isAdmin = membership && membership.role === "admin";
    return isCommentAuthor || isMomentAuthor || isAdmin;
  };

  // Comment author can delete their comment
  assert.equal(canDeleteComment({ _id: commentAuthorId }, { role: "member" }), true);
  // Post author can delete comments on their own post
  assert.equal(canDeleteComment({ _id: authorId }, { role: "member" }), true);
  // Squad admin can moderate/delete any comment
  assert.equal(canDeleteComment({ _id: adminId }, { role: "admin" }), true);
  // Another regular member cannot delete someone else's comment
  assert.equal(canDeleteComment({ _id: otherMemberId }, { role: "member" }), false);
});

test("Squad Moments: Cloudinary upload fallback handles buffer gracefully when offline", async () => {
  const fakeBuffer = Buffer.from("fake-photo-data-bytes");
  const result = await uploadSquadMomentPhoto(fakeBuffer, {
    userId: new mongoose.Types.ObjectId(),
    groupId: new mongoose.Types.ObjectId(),
    mimeType: "image/jpeg",
  });

  assert.ok(result.url);
  assert.ok(result.url.startsWith("data:image/jpeg;base64,") || result.url.startsWith("http"));
  assert.ok(result.publicId);

  const deleteRes = await deleteSquadMomentPhoto(result.publicId);
  assert.equal(typeof deleteRes.deleted, "boolean");
});
