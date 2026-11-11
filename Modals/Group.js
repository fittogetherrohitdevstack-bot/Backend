const mongoose = require("mongoose");
const crypto = require("crypto");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      maxlength: 60,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    inviteCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    maxMembers: {
      type: Number,
      default: 15,
      min: 2,
      max: 50,
    },
  },
  {
    timestamps: true,
  }
);

// Generate random 8-character invite code before save
groupSchema.pre("save", function () {
  if (!this.inviteCode) {
    this.inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  }
});

const Group = mongoose.model("Group", groupSchema);

module.exports = Group;
