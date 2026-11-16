const { io } = require("../../frontend/node_modules/socket.io-client");
const axios = require("../../frontend/node_modules/axios");

const API_BASE = "http://localhost:5000/api";
const SOCKET_BASE = "http://localhost:5000";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runForensicAudit() {
  console.log("=== FITTOGETHER SQUAD CHAT: FORENSIC AUDIT ===");

  const timestamp = Date.now();
  // 1. Create two test accounts
  console.log("\n[1] Registering User A & User B...");
  const userAData = {
    name: "Forensic User A",
    email: `forensic_a_${timestamp}@example.com`,
    password: "Password123!",
  };
  const userBData = {
    name: "Forensic User B",
    email: `forensic_b_${timestamp}@example.com`,
    password: "Password123!",
  };

  const regA = await axios.post(`${API_BASE}/auth/register`, userAData);
  const tokenA = regA.data.data.accessToken;
  const userA = regA.data.data.user;
  console.log(`[PASS] User A registered: id=${userA._id || userA.id}, email=${userA.email}`);

  const regB = await axios.post(`${API_BASE}/auth/register`, userBData);
  const tokenB = regB.data.data.accessToken;
  const userB = regB.data.data.user;
  console.log(`[PASS] User B registered: id=${userB._id || userB.id}, email=${userB.email}`);

  // 2. User A creates a squad
  console.log("\n[2] User A creates a test squad...");
  const groupRes = await axios.post(
    `${API_BASE}/groups`,
    {
      name: `Forensic Squad ${timestamp}`,
      description: "Squad Chat Audit Squad",
      maxMembers: 10,
    },
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  const squad = groupRes.data.data.group;
  const squadId = squad._id;
  const inviteCode = squad.inviteCode;
  console.log(`[PASS] Squad created: id=${squadId}, inviteCode=${inviteCode}`);

  // 3. User B joins the squad
  console.log("\n[3] User B joins squad via invite code...");
  await axios.post(
    `${API_BASE}/groups/join`,
    { inviteCode },
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );
  console.log(`[PASS] User B joined squad`);

  // 4. Connect WebSockets for both users
  console.log("\n[4] Connecting WebSockets for User A & User B...");
  const socketA = io(SOCKET_BASE, {
    auth: { token: tokenA },
    transports: ["websocket"],
  });
  const socketB = io(SOCKET_BASE, {
    auth: { token: tokenB },
    transports: ["websocket"],
  });

  await new Promise((resolve, reject) => {
    let connectedCount = 0;
    const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 5000);

    socketA.on("connect", () => {
      console.log(`[PASS] Socket A connected: socketId=${socketA.id}`);
      connectedCount++;
      if (connectedCount === 2) {
        clearTimeout(timeout);
        resolve();
      }
    });

    socketB.on("connect", () => {
      console.log(`[PASS] Socket B connected: socketId=${socketB.id}`);
      connectedCount++;
      if (connectedCount === 2) {
        clearTimeout(timeout);
        resolve();
      }
    });

    socketA.on("connect_error", (err) => console.error("[FAIL] Socket A error:", err.message));
    socketB.on("connect_error", (err) => console.error("[FAIL] Socket B error:", err.message));
  });

  // 5. Both join the squad room
  console.log("\n[5] Joining squad chat room...");
  let onlineReceivedA = null;
  let onlineReceivedB = null;

  socketA.on("squad:online_members", (data) => {
    onlineReceivedA = data;
    console.log(`[SOCKET A] squad:online_members received:`, data);
  });
  socketB.on("squad:online_members", (data) => {
    onlineReceivedB = data;
    console.log(`[SOCKET B] squad:online_members received:`, data);
  });

  socketA.emit("squad:join_chat", { squadId });
  socketB.emit("squad:join_chat", { squadId });
  await sleep(600);

  // 6. Test Live Send from User A -> User B
  console.log("\n[6] Live Test: User A sends message -> User B receives in real time...");
  const messagePromiseB = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("User B did not receive message in 5000ms")), 5000);
    socketB.on("chat:message", (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
  });

  const sendResA = await axios.post(
    `${API_BASE}/chat/squads/${squadId}/messages`,
    {
      text: "Hello User B from User A – Forensic Test 001",
      clientMsgId: `opt_${Date.now()}`,
    },
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );

  console.log("[REST A] Send status:", sendResA.status, sendResA.data.message);
  const receivedMsgB = await messagePromiseB;
  console.log("[SOCKET B] Message received in real time!");
  console.log(`  - Text: "${receivedMsgB.text}"`);
  console.log(`  - Sender Name: "${receivedMsgB.sender?.name}"`);
  console.log(`  - Group ID: "${receivedMsgB.groupId}"`);
  console.log(`  - Message ID: "${receivedMsgB._id}"`);

  if (receivedMsgB.text !== "Hello User B from User A – Forensic Test 001") {
    throw new Error("Message text mismatch on User B");
  }

  // 7. Test Live Reply from User B -> User A
  console.log("\n[7] Live Test: User B replies to User A...");
  const messagePromiseA = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("User A did not receive reply in 5000ms")), 5000);
    socketA.on("chat:message", (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
  });

  const sendResB = await axios.post(
    `${API_BASE}/chat/squads/${squadId}/messages`,
    {
      text: "Hello User A, ready to crush Leg Day! – Forensic Test 002",
      replyToId: receivedMsgB._id,
      clientMsgId: `opt_${Date.now()}`,
    },
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );

  console.log("[REST B] Reply send status:", sendResB.status, sendResB.data.message);
  const receivedReplyA = await messagePromiseA;
  console.log("[SOCKET A] Reply received in real time!");
  console.log(`  - Text: "${receivedReplyA.text}"`);
  console.log(`  - Reply To Author: "${receivedReplyA.replyTo?.senderName}"`);
  console.log(`  - Reply To Text: "${receivedReplyA.replyTo?.text}"`);

  if (!receivedReplyA.replyTo || receivedReplyA.replyTo._id !== receivedMsgB._id) {
    throw new Error("Reply quote linkage failed");
  }

  // 8. Test Emoji Reaction from User B on User A's message
  console.log("\n[8] Live Test: Emoji reaction toggle...");
  const reactionPromiseA = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("User A did not receive reaction in 5000ms")), 5000);
    socketA.on("chat:reaction_updated", (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });

  await axios.post(
    `${API_BASE}/chat/messages/${receivedMsgB._id}/reactions`,
    { emoji: "🔥" },
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );

  const reactionData = await reactionPromiseA;
  console.log("[SOCKET A] Reaction update received:", reactionData.reactions);
  if (!reactionData.reactions.some((r) => r.emoji === "🔥")) {
    throw new Error("Emoji reaction missing");
  }

  // 9. Test Typing Indicator
  console.log("\n[9] Live Test: Typing indicator...");
  const typingPromiseA = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("User A did not receive typing indicator in 5000ms")), 5000);
    socketA.on("typing:user_typing", (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });

  socketB.emit("typing:start", { squadId, userName: "Forensic User B" });
  const typingData = await typingPromiseA;
  console.log("[SOCKET A] User typing received:", typingData);

  // 10. Test Persistence & History Fetching
  console.log("\n[10] Live Test: Persistence verification (Reload simulation)...");
  const historyRes = await axios.get(
    `${API_BASE}/chat/squads/${squadId}/messages`,
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  const history = historyRes.data.data.messages;
  console.log(`[PASS] Fetched ${history.length} messages from database.`);
  if (history.length < 2) {
    throw new Error("Persisted messages missing from database history");
  }

  // 11. Test Security / Authorization with User C (unauthorized)
  console.log("\n[11] Live Test: Security / Unauthorized access check...");
  const userCData = {
    name: "Unauthorized User C",
    email: `forensic_c_${timestamp}@example.com`,
    password: "Password123!",
  };
  const regC = await axios.post(`${API_BASE}/auth/register`, userCData);
  const tokenC = regC.data.data.accessToken;

  try {
    await axios.get(`${API_BASE}/chat/squads/${squadId}/messages`, {
      headers: { Authorization: `Bearer ${tokenC}` },
    });
    throw new Error("Security failure: Unauthorized User C was able to fetch squad messages!");
  } catch (err) {
    if (err.response?.status === 403) {
      console.log("[PASS] User C blocked with 403 Forbidden on history fetch");
    } else {
      throw err;
    }
  }

  try {
    await axios.post(
      `${API_BASE}/chat/squads/${squadId}/messages`,
      { text: "Hacked message" },
      { headers: { Authorization: `Bearer ${tokenC}` } }
    );
    throw new Error("Security failure: Unauthorized User C was able to post a message!");
  } catch (err) {
    if (err.response?.status === 403) {
      console.log("[PASS] User C blocked with 403 Forbidden on message send");
    } else {
      throw err;
    }
  }

  // Cleanup sockets
  socketA.disconnect();
  socketB.disconnect();

  console.log("\n=== ALL FORENSIC CHECKS PASSED SUCCESSFULLY! ===");
}

runForensicAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ FORENSIC AUDIT FAILED:", err.message, err.response?.data || "");
    process.exit(1);
  });
