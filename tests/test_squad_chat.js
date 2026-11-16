const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../App");
const config = require("../Config/env");
const User = require("../Modals/User");
const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const Message = require("../Modals/Message");
const chatService = require("../services/chatService");

let userAToken = "";
let userBToken = "";
let userCToken = ""; // Not a member of the squad
let userA = null;
let userB = null;
let userC = null;
let testSquad = null;

test.before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.MONGODB_URI);
  }

  const timestamp = Date.now();

  // Create User A
  const regA = await request(app).post("/api/auth/register").send({
    name: "Chat User A",
    email: `chata_${timestamp}@example.com`,
    password: "Password123!",
  });
  userAToken = regA.body.data.accessToken;
  userA = regA.body.data.user;

  // Create User B
  const regB = await request(app).post("/api/auth/register").send({
    name: "Chat User B",
    email: `chatb_${timestamp}@example.com`,
    password: "Password123!",
  });
  userBToken = regB.body.data.accessToken;
  userB = regB.body.data.user;

  // Create User C (Non-member)
  const regC = await request(app).post("/api/auth/register").send({
    name: "Chat User C",
    email: `chatc_${timestamp}@example.com`,
    password: "Password123!",
  });
  userCToken = regC.body.data.accessToken;
  userC = regC.body.data.user;

  const userAId = userA._id || userA.id;
  const userBId = userB._id || userB.id;
  const userCId = userC._id || userC.id;

  // Create a Squad with User A as Admin and User B as Member
  testSquad = await Group.create({
    name: `Squad Alpha ${timestamp}`,
    createdBy: userAId,
    inviteCode: `ALP${timestamp.toString().slice(-4)}`,
  });

  await Membership.create({
    groupId: testSquad._id,
    userId: userAId,
    role: "admin",
    status: "active",
  });

  await Membership.create({
    groupId: testSquad._id,
    userId: userBId,
    role: "member",
    status: "active",
  });
});

test.after(async () => {
  if (testSquad) {
    await Message.deleteMany({ groupId: testSquad._id });
    await Membership.deleteMany({ groupId: testSquad._id });
    await Group.findByIdAndDelete(testSquad._id);
  }
  if (userA) await User.findByIdAndDelete(userA._id || userA.id);
  if (userB) await User.findByIdAndDelete(userB._id || userB.id);
  if (userC) await User.findByIdAndDelete(userC._id || userC.id);
  await mongoose.disconnect();
});

test("Squad Chat: 1. Send message by authorized member (User A)", async () => {
  const res = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({
      text: "Hello Squad Alpha! Today is Leg Day! 🦵🔥",
    });

  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.text, "Hello Squad Alpha! Today is Leg Day! 🦵🔥");
  assert.strictEqual(res.body.data.sender._id.toString(), (userA._id || userA.id).toString());
  assert.strictEqual(res.body.data.isMine, true);
});

test("Squad Chat: 2. Unauthorized non-member (User C) cannot send messages", async () => {
  const res = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userCToken}`)
    .send({
      text: "I should not be able to talk here!",
    });

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
});

test("Squad Chat: 3. Unauthorized non-member (User C) cannot fetch messages", async () => {
  const res = await request(app)
    .get(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userCToken}`);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
});

test("Squad Chat: 4. Authorized member (User B) fetches message history & replies", async () => {
  const listRes = await request(app)
    .get(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userBToken}`);

  assert.strictEqual(listRes.statusCode, 200);
  assert.strictEqual(listRes.body.success, true);
  assert.strictEqual(listRes.body.data.messages.length >= 1, true);

  const parentMsg = listRes.body.data.messages[0];

  // User B sends a reply
  const replyRes = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userBToken}`)
    .send({
      text: "Count me in! Ready to squat 120kg 💪",
      replyToId: parentMsg._id,
    });

  assert.strictEqual(replyRes.statusCode, 201);
  assert.strictEqual(replyRes.body.data.replyTo._id.toString(), parentMsg._id.toString());
  assert.strictEqual(replyRes.body.data.replyTo.senderName, "Chat User A");
});

test("Squad Chat: 5. Emoji Reactions toggle on and off", async () => {
  const listRes = await request(app)
    .get(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userAToken}`);

  const targetMsg = listRes.body.data.messages[listRes.body.data.messages.length - 1];

  // User A reacts with 🔥
  const react1 = await request(app)
    .post(`/api/chat/messages/${targetMsg._id}/reactions`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ emoji: "🔥" });

  assert.strictEqual(react1.statusCode, 200);
  assert.strictEqual(react1.body.data.reactions.length, 1);
  assert.strictEqual(react1.body.data.reactions[0].emoji, "🔥");

  // User A toggles the same reaction off
  const react2 = await request(app)
    .post(`/api/chat/messages/${targetMsg._id}/reactions`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ emoji: "🔥" });

  assert.strictEqual(react2.statusCode, 200);
  assert.strictEqual(react2.body.data.reactions.length, 0);
});

test("Squad Chat: 6. Edit own message & prevent editing others' messages", async () => {
  // User B sends a message
  const sendRes = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userBToken}`)
    .send({ text: "Typo text to fix" });

  const msgId = sendRes.body.data._id;

  // User A (non-author) attempts to edit -> 403
  const failEdit = await request(app)
    .patch(`/api/chat/messages/${msgId}`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ text: "Hacked text" });
  assert.strictEqual(failEdit.statusCode, 403);

  // User B (author) edits -> 200
  const successEdit = await request(app)
    .patch(`/api/chat/messages/${msgId}`)
    .set("Authorization", `Bearer ${userBToken}`)
    .send({ text: "Fixed correct text" });
  assert.strictEqual(successEdit.statusCode, 200);
  assert.strictEqual(successEdit.body.data.text, "Fixed correct text");
  assert.notStrictEqual(successEdit.body.data.editedAt, null);
});

test("Squad Chat: 7. Soft delete message & admin moderation permissions", async () => {
  // User B sends a message
  const sendRes = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userBToken}`)
    .send({ text: "Message to moderate" });

  const msgId = sendRes.body.data._id;

  // User A is squad admin, so User A can delete User B's message for moderation
  const delRes = await request(app)
    .delete(`/api/chat/messages/${msgId}`)
    .set("Authorization", `Bearer ${userAToken}`);

  assert.strictEqual(delRes.statusCode, 200);
  assert.strictEqual(delRes.body.data.isDeleted, true);
  assert.strictEqual(delRes.body.data.text, "This message was deleted");
});

test("Squad Chat: 8. Unread message count and mark squad as read", async () => {
  // User A sends 2 new messages
  await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ text: "Unread 1" });

  await request(app)
    .post(`/api/chat/squads/${testSquad._id}/messages`)
    .set("Authorization", `Bearer ${userAToken}`)
    .send({ text: "Unread 2" });

  // User B checks unread counts
  const unreadRes = await request(app)
    .get("/api/chat/unread-counts")
    .set("Authorization", `Bearer ${userBToken}`);

  assert.strictEqual(unreadRes.statusCode, 200);
  assert.strictEqual(unreadRes.body.data.bySquad[testSquad._id.toString()] >= 2, true);

  // User B marks squad as read
  const readRes = await request(app)
    .post(`/api/chat/squads/${testSquad._id}/read`)
    .set("Authorization", `Bearer ${userBToken}`);

  assert.strictEqual(readRes.statusCode, 200);

  // Re-check unread counts for User B -> should be 0
  const afterRead = await request(app)
    .get("/api/chat/unread-counts")
    .set("Authorization", `Bearer ${userBToken}`);

  assert.strictEqual(afterRead.body.data.bySquad[testSquad._id.toString()] || 0, 0);
});
