const { v2: cloudinary } = require("cloudinary");
const config = require("../Config/env");

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB

const isCloudinaryConfigured = () => {
  return Boolean(
    (config.CLOUDINARY_CLOUD_NAME || "").trim() &&
      (config.CLOUDINARY_API_KEY || "").trim() &&
      (config.CLOUDINARY_API_SECRET || "").trim()
  );
};

const ensureCloudinaryConfigured = () => {
  if (!isCloudinaryConfigured()) return false;
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: config.CLOUDINARY_API_KEY.trim(),
    api_secret: config.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });
  return true;
};

/**
 * Validates image file buffer size and MIME type before uploading.
 */
const validateImageFile = (file) => {
  if (!file || !file.buffer) {
    return { valid: false, message: "No photo file provided." };
  }
  const mime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    return { valid: false, message: "Only JPEG, PNG, and WebP images are supported." };
  }
  if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
    return { valid: false, message: "Photo exceeds the 8 MB size limit." };
  }
  return { valid: true };
};

/**
 * Generates a signed authenticated Cloudinary delivery URL for private viewing,
 * falling back cleanly to the stored URL for non-Cloudinary/placeholder entries.
 */
const resolveSignedPhotoUrl = (photoEntry) => {
  if (!photoEntry) return null;
  const plain = photoEntry.toObject ? photoEntry.toObject() : { ...photoEntry };
  if (plain.publicId && isCloudinaryConfigured() && !String(plain.publicId).startsWith("seed_")) {
    ensureCloudinaryConfigured();
    try {
      const signed = cloudinary.url(plain.publicId, {
        resource_type: "image",
        type: "authenticated",
        sign_url: true,
        secure: true,
        quality: "auto",
        fetch_format: "auto",
      });
      return { ...plain, url: signed };
    } catch (_) {
      return plain;
    }
  }
  return plain;
};

/**
 * Uploads an image buffer to Cloudinary into a per-user private/authenticated folder.
 * Uses unique_filename so retakes never overwrite an older photo mid-flight.
 */
const uploadPrivateProgressPhoto = (buffer, { userId, cycleNumber, pose }) => {
  if (!ensureCloudinaryConfigured()) {
    const err = new Error("Photo storage isn't configured");
    err.statusCode = 503;
    throw err;
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `fittogether/users/${userId}/photos`,
        resource_type: "image",
        type: "authenticated",
        unique_filename: true,
        overwrite: false,
        tags: ["progress_photo", pose, `cycle_${cycleNumber}`],
      },
      (error, result) => {
        if (error) return reject(error);
        const signedUrl = cloudinary.url(result.public_id, {
          resource_type: "image",
          type: "authenticated",
          sign_url: true,
          secure: true,
          quality: "auto",
          fetch_format: "auto",
        });
        return resolve({
          url: signedUrl || result.secure_url,
          publicId: result.public_id,
          takenAt: new Date(),
        });
      }
    );

    uploadStream.end(buffer);
  });
};

/**
 * Uploads a user's profile photo to Cloudinary for fast public avatar display
 * (scaled cleanly up to 512px max dimension, auto format/quality).
 */
const uploadProfileAvatar = (buffer, { userId }) => {
  if (!ensureCloudinaryConfigured()) {
    const err = new Error("Photo storage isn't configured");
    err.statusCode = 503;
    throw err;
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `fittogether/avatars/${userId}`,
        resource_type: "image",
        type: "upload",
        unique_filename: true,
        overwrite: false,
        transformation: [{ width: 512, height: 512, crop: "limit", quality: "auto", fetch_format: "auto" }],
        tags: ["profile_avatar"],
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    uploadStream.end(buffer);
  });
};

/**
 * Best-effort Cloudinary asset removal (ignores seed/non-Cloudinary IDs safely).
 */
const deletePrivateProgressPhoto = async (publicId) => {
  if (!publicId || String(publicId).startsWith("seed_") || !ensureCloudinaryConfigured()) {
    return { deleted: false };
  }
  try {
    const res = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      type: "authenticated",
      invalidate: true,
    });
    if (res?.result !== "ok") {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
    }
    return { deleted: true };
  } catch (_) {
    return { deleted: false };
  }
};

module.exports = {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PHOTO_BYTES,
  isCloudinaryConfigured,
  validateImageFile,
  resolveSignedPhotoUrl,
  uploadPrivateProgressPhoto,
  uploadProfileAvatar,
  deletePrivateProgressPhoto,
};
