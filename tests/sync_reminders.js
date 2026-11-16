const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");
const config = require("../Config/env");
const ReminderSetting = require("../Modals/ReminderSetting");

async function sync() {
  await mongoose.connect(config.MONGODB_URI);
  const res = await ReminderSetting.updateMany(
    {},
    { $set: { "channels.push": true } }
  );
  console.log("Updated ReminderSetting channels.push to true for all records:", res);
  await mongoose.disconnect();
}
sync().catch(console.error);
