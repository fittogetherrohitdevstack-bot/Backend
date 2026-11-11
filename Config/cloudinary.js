const cloudinary = require("cloudinary").v2;
const config = require("./env");

let isConfigured = false;

if (
  config.CLOUDINARY_CLOUD_NAME &&
  config.CLOUDINARY_API_KEY &&
  config.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
  });
  isConfigured = true;
} else {
  console.log(
    "ℹ️ Cloudinary credentials not fully configured. Image uploads will use local placeholder/fallback."
  );
}

module.exports = {
  cloudinary,
  isConfigured,
};
