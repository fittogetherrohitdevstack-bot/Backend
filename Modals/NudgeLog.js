const mongoose = require("mongoose");

const nudgeLogSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dateKey: {
      type: String, // YYYY-MM-DD in receiver's local timezone
      required: true,
    },
    message: {
      type: String,
      default: "",
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
);

nudgeLogSchema.index({ senderId: 1, receiverId: 1, dateKey: 1 });
nudgeLogSchema.index({ receiverId: 1, dateKey: 1 });

const NudgeLog = mongoose.model("NudgeLog", nudgeLogSchema);

module.exports = NudgeLog;
