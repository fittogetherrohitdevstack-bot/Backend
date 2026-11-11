const jwt = require("jsonwebtoken");
const config = require("../Config/env");
const User = require("../Modals/User");
const asyncHandler = require("../Utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.ft_access_token) {
    token = req.cookies.ft_access_token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "NO_TOKEN",
      message: "Authentication token required",
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: "TOKEN_EXPIRED",
      message: "Invalid or expired authentication token",
    });
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    return res.status(401).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "User no longer exists",
    });
  }

  req.user = user;
  next();
});

module.exports = protect;
