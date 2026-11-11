const app = require("../App");
console.log("App required!");
console.log("Active handles count:", process._getActiveHandles().length);
for (const h of process._getActiveHandles()) {
  console.log("Handle:", h.constructor?.name || typeof h);
}
process.exit(0);
