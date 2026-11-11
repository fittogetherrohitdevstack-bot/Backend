const assert = require("assert");
const {
  getLocalClockDetails,
  isTimeInQuietHours,
  getPhotoCycleDetails,
} = require("../Utils/date");
const { evaluateReminderDecision } = require("../Utils/reminderScheduler");
const { validateImageFile } = require("../Utils/cloudinary");

console.log("🧪 Running Smart Reminders & Bi-Weekly Photo Unit Tests...\n");

// 1. Timezone conversion & clock details
{
  // 2026-11-11T01:30:00Z -> 07:00 IST (same Wed) vs 20:30 prev Tue EST
  const instant = new Date("2026-11-11T01:30:00.000Z");
  const ist = getLocalClockDetails(instant, "Asia/Kolkata");
  const ny = getLocalClockDetails(instant, "America/New_York");
  assert.strictEqual(ist.dateString, "2026-11-11");
  assert.strictEqual(ist.hhmm, "07:00");
  assert.strictEqual(ny.dateString, "2026-11-10");
  assert.strictEqual(ny.hhmm, "20:30");
  console.log("  ✓ Multi-timezone local clock resolution (IST 07:00 vs NY prev evening): PASSED");
}

// 2. Quiet hours edge cases
{
  const overnight = { enabled: true, from: "22:00", to: "06:00" };
  assert.strictEqual(isTimeInQuietHours("23:15", overnight), true);
  assert.strictEqual(isTimeInQuietHours("05:59", overnight), true);
  assert.strictEqual(isTimeInQuietHours("06:00", overnight), false);
  assert.strictEqual(isTimeInQuietHours("21:59", overnight), false);
  assert.strictEqual(isTimeInQuietHours("02:00", { enabled: false, from: "22:00", to: "06:00" }), false);
  console.log("  ✓ Overnight & disabled quiet hours logic: PASSED");
}

// 3. Reminder decision engine: initial, skip-if-logged, snooze, skip, single follow-up
{
  const baseSetting = {
    dailyWeight: { enabled: true, time: "07:00", days: [0, 1, 2, 3, 4, 5, 6], onlyIfNotLogged: true },
    quietHours: { enabled: true, from: "22:00", to: "06:00" },
  };
  const morningClock = { dateString: "2026-11-11", hhmm: "07:02", weekday: 3 };
  const photoCycle = { status: "due", dueDate: "2026-11-11" };

  // Fires initial within window
  const d1 = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: morningClock,
    photoCycle,
    isCompleted: false,
    controlEvent: null,
    deliveredEvents: [],
    now: new Date("2026-11-11T01:32:00.000Z"),
  });
  assert.strictEqual(d1.action, "send");
  assert.strictEqual(d1.attempt, "initial");

  // Skips if already logged
  const dLogged = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: morningClock,
    photoCycle,
    isCompleted: true,
    controlEvent: null,
    deliveredEvents: [],
  });
  assert.strictEqual(dLogged.action, "skip_completed");

  // Skips if user clicked skip
  const dSkipped = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: morningClock,
    photoCycle,
    isCompleted: false,
    controlEvent: { skipped: true },
    deliveredEvents: [],
  });
  assert.strictEqual(dSkipped.action, "skip_user");

  // Waits while snoozed, fires after snoozedUntil passes
  const snoozedUntil = new Date("2026-11-11T02:30:00.000Z");
  const dSnoozeWait = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: { dateString: "2026-11-11", hhmm: "07:45", weekday: 3 },
    photoCycle,
    isCompleted: false,
    controlEvent: { snoozedUntil, snoozeCount: 1 },
    deliveredEvents: [{ attempt: "initial", sentAt: new Date("2026-11-11T01:30:00.000Z") }],
    now: new Date("2026-11-11T02:15:00.000Z"),
  });
  assert.strictEqual(dSnoozeWait.action, "snoozed_waiting");

  const dSnoozeFire = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: { dateString: "2026-11-11", hhmm: "08:05", weekday: 3 },
    photoCycle,
    isCompleted: false,
    controlEvent: { snoozedUntil, snoozeCount: 1 },
    deliveredEvents: [{ attempt: "initial", sentAt: new Date("2026-11-11T01:30:00.000Z") }],
    now: new Date("2026-11-11T02:35:00.000Z"),
  });
  assert.strictEqual(dSnoozeFire.action, "send");
  assert.strictEqual(dSnoozeFire.attempt, "snooze_1");

  // One gentle follow-up ~3 hours later (10:05), then stops
  const dFollowup = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: { dateString: "2026-11-11", hhmm: "10:05", weekday: 3 },
    photoCycle,
    isCompleted: false,
    controlEvent: null,
    deliveredEvents: [{ attempt: "initial", sentAt: new Date("2026-11-11T01:30:00.000Z") }],
    now: new Date("2026-11-11T04:35:00.000Z"),
  });
  assert.strictEqual(dFollowup.action, "send");
  assert.strictEqual(dFollowup.attempt, "followup");
  assert.strictEqual(dFollowup.isFollowup, true);

  // Never sends another follow-up once followup is already recorded
  const dStop = evaluateReminderDecision({
    type: "daily_weight",
    setting: baseSetting,
    clock: { dateString: "2026-11-11", hhmm: "10:15", weekday: 3 },
    photoCycle,
    isCompleted: false,
    controlEvent: null,
    deliveredEvents: [
      { attempt: "initial", sentAt: new Date("2026-11-11T01:30:00.000Z") },
      { attempt: "followup", sentAt: new Date("2026-11-11T04:35:00.000Z") },
    ],
    now: new Date("2026-11-11T04:45:00.000Z"),
  });
  assert.strictEqual(dStop.action, "outside_window");

  console.log("  ✓ Reminder decision rules (initial, skip-if-logged, snooze, skip, 1 followup max): PASSED");
}

// 4. Image validation (MIME + size limits)
{
  const okJpg = validateImageFile({ mimetype: "image/jpeg", size: 512000, buffer: Buffer.alloc(1024) });
  assert.strictEqual(okJpg.valid, true);

  const okWebp = validateImageFile({ mimetype: "image/webp", size: 2 * 1024 * 1024, buffer: Buffer.alloc(1024) });
  assert.strictEqual(okWebp.valid, true);

  const badPdf = validateImageFile({ mimetype: "application/pdf", size: 1024, buffer: Buffer.alloc(1024) });
  assert.strictEqual(badPdf.valid, false);

  const tooBig = validateImageFile({ mimetype: "image/png", size: 9 * 1024 * 1024, buffer: Buffer.alloc(100) });
  assert.strictEqual(tooBig.valid, false);

  const c1 = getPhotoCycleDetails("2026-11-01", "2026-11-15", 0);
  assert.strictEqual(c1.cycleNumber, 2);
  assert.strictEqual(c1.status, "due");
  console.log("  ✓ Photo MIME/size validation & cycle transitions: PASSED");
}

console.log("\n🎉 ALL STEP 3–6 UNIT TESTS PASSED (100% green)!");
