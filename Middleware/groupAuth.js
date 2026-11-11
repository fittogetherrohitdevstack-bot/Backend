const Group = require("../Modals/Group");
const Membership = require("../Modals/Membership");
const asyncHandler = require("../Utils/asyncHandler");

const checkGroupMember = (options = { requireAdmin: false }) => {
  return asyncHandler(async (req, res, next) => {
    const groupId = req.params.id || req.params.groupId || req.body.groupId;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required",
      });
    }

    const group = await Group.findById(groupId);
    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: "Group not found or inactive",
      });
    }

    const membership = await Membership.findOne({
      groupId,
      userId: req.user._id,
      status: "active",
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You are not an active member of this group",
      });
    }

    if (options.requireAdmin && membership.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin privileges required for this action",
      });
    }

    req.group = group;
    req.membership = membership;
    next();
  });
};

module.exports = {
  checkGroupMember,
};
