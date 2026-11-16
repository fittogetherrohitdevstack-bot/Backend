const test = require("node:test");
const assert = require("node:assert");

/**
 * Replicates the exact parsing logic in frontend/public/sw.js
 */
function parsePushEventData(eventData) {
  let rawText = "";
  let payload = null;

  if (eventData) {
    if (typeof eventData.text === "function") {
      try {
        rawText = eventData.text();
      } catch (_) {}
    }
    if (typeof eventData.json === "function") {
      try {
        payload = eventData.json();
      } catch (_) {
        if (rawText) {
          try {
            payload = JSON.parse(rawText);
          } catch (_) {
            payload = null;
          }
        }
      }
    }
  }

  // Handle double-encoded or triple-encoded JSON strings
  let parseAttempts = 0;
  while (typeof payload === "string" && parseAttempts < 3) {
    parseAttempts++;
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      break;
    }
  }

  const notifObj =
    payload && typeof payload === "object" && typeof payload.notification === "object"
      ? payload.notification
      : {};
  const dataObj =
    payload && typeof payload === "object" && typeof payload.data === "object"
      ? payload.data
      : {};
  const apsAlert =
    payload &&
    typeof payload === "object" &&
    payload.aps &&
    typeof payload.aps.alert === "object"
      ? payload.aps.alert
      : {};

  let candidateTitle = "";
  if (payload && typeof payload === "object") {
    candidateTitle =
      payload.title ||
      notifObj.title ||
      dataObj.title ||
      apsAlert.title ||
      payload.heading ||
      dataObj.heading ||
      payload.name ||
      dataObj.name ||
      payload.subject ||
      dataObj.subject ||
      "";
  }

  let candidateBody = "";
  if (payload && typeof payload === "object") {
    candidateBody =
      payload.body ||
      notifObj.body ||
      dataObj.body ||
      apsAlert.body ||
      payload.message ||
      dataObj.message ||
      payload.text ||
      dataObj.text ||
      payload.description ||
      dataObj.description ||
      "";
  }

  // If payload was plain text without JSON formatting
  if (
    !candidateTitle &&
    !candidateBody &&
    rawText &&
    !rawText.trim().startsWith("{") &&
    !rawText.trim().startsWith("[")
  ) {
    if (rawText.includes(" - ")) {
      const parts = rawText.split(" - ");
      candidateTitle = parts[0].trim();
      candidateBody = parts.slice(1).join(" - ").trim();
    } else if (rawText.includes(": ")) {
      const parts = rawText.split(": ");
      candidateTitle = parts[0].trim();
      candidateBody = parts.slice(1).join(": ").trim();
    } else {
      candidateBody = rawText.trim();
    }
  }

  const senderName =
    (payload && payload.senderName) ||
    dataObj.senderName ||
    (payload && payload.actorName) ||
    dataObj.actorName ||
    "";
  const notifType =
    (payload && payload.type) ||
    dataObj.type ||
    (payload && payload.category) ||
    dataObj.category ||
    "";

  if (!candidateTitle && senderName) {
    if (notifType === "meal_added") {
      candidateTitle = `🍎 ${senderName} added a new meal`;
    } else if (notifType === "water_logged") {
      candidateTitle = `💧 ${senderName} logged water`;
    } else if (notifType === "moment_posted") {
      candidateTitle = `📸 ${senderName} shared a moment`;
    } else if (notifType === "workout_completed") {
      candidateTitle = `💪 ${senderName} completed a workout`;
    } else if (notifType === "diet_updated") {
      candidateTitle = `🥗 ${senderName} updated today's diet`;
    } else {
      candidateTitle = `${senderName} updated FitTogether`;
    }
  }

  const finalTitle =
    candidateTitle && String(candidateTitle).trim().length > 0
      ? String(candidateTitle).trim()
      : "FitTogether";

  const finalBody =
    candidateBody && String(candidateBody).trim().length > 0
      ? String(candidateBody).trim()
      : "Time to keep your squad streak burning!";

  return { finalTitle, finalBody, senderName, notifType };
}

test("SW Parser: Format 1 - Direct root title & body", () => {
  const event = {
    text: () => JSON.stringify({ title: "🍎 Rahul added a new meal", body: "Check out his breakfast" }),
    json: () => ({ title: "🍎 Rahul added a new meal", body: "Check out his breakfast" }),
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "🍎 Rahul added a new meal");
  assert.strictEqual(res.finalBody, "Check out his breakfast");
});

test("SW Parser: Format 2 - Nested FCM notification wrapper", () => {
  const data = {
    notification: {
      title: "🍎 Rahul added a new meal",
      body: "Rahul just logged his breakfast",
    },
    data: { type: "meal_added" },
  };
  const event = {
    text: () => JSON.stringify(data),
    json: () => data,
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "🍎 Rahul added a new meal");
  assert.strictEqual(res.finalBody, "Rahul just logged his breakfast");
});

test("SW Parser: Format 3 - FCM Data-only wrapper", () => {
  const data = {
    data: {
      title: "💧 Rahul drank 500ml water",
      body: "Rahul is staying hydrated!",
      type: "water_logged",
    },
  };
  const event = {
    text: () => JSON.stringify(data),
    json: () => data,
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "💧 Rahul drank 500ml water");
  assert.strictEqual(res.finalBody, "Rahul is staying hydrated!");
});

test("SW Parser: Format 4 - Double stringified JSON", () => {
  const inner = JSON.stringify({
    title: "💪 Rahul completed Push Day",
    body: "Heavy bench and shoulder presses done!",
  });
  const event = {
    text: () => inner,
    json: () => inner, // returns string because double serialized
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "💪 Rahul completed Push Day");
  assert.strictEqual(res.finalBody, "Heavy bench and shoulder presses done!");
});

test("SW Parser: Format 5 - Delimited Plain text", () => {
  const text = "📸 Rahul shared a new moment - Check out the gym flex!";
  const event = {
    text: () => text,
    json: () => {
      throw new Error("Not JSON");
    },
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "📸 Rahul shared a new moment");
  assert.strictEqual(res.finalBody, "Check out the gym flex!");
});

test("SW Parser: Fallback ONLY when title is completely empty", () => {
  const event = {
    text: () => "{}",
    json: () => ({}),
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "FitTogether");
  assert.strictEqual(res.finalBody, "Time to keep your squad streak burning!");
});

test("SW Parser: Title synthesized from senderName + activity type when title omitted", () => {
  const data = {
    data: {
      senderName: "Pooja",
      type: "workout_completed",
      body: "Pooja smashed today's HIIT workout!",
    },
  };
  const event = {
    text: () => JSON.stringify(data),
    json: () => data,
  };
  const res = parsePushEventData(event);
  assert.strictEqual(res.finalTitle, "💪 Pooja completed a workout");
  assert.strictEqual(res.finalBody, "Pooja smashed today's HIIT workout!");
});
