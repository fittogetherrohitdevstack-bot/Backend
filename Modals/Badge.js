const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: "Award",
    },
  },
  {
    timestamps: true,
  }
);

const Badge = mongoose.model("Badge", badgeSchema);

module.exports = Badge;
