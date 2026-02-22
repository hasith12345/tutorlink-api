const express = require("express");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const authMiddleware = require("../middleware/auth.middleware");
const { prisma } = require("../models");

const router = express.Router();

// Helper: extract Cloudinary public_id from a secure_url
// e.g. https://res.cloudinary.com/demo/image/upload/v123/tutorlink/avatars/abc.jpg
// → "tutorlink/avatars/abc"
function extractPublicId(url) {
  try {
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    const afterUpload = parts[1]; // "v123/tutorlink/avatars/abc.jpg"
    // Strip optional version segment (v\d+/)
    const withoutVersion = afterUpload.replace(/^v\d+\//, "");
    // Strip file extension
    return withoutVersion.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

// Helper: delete from Cloudinary if a previous avatar exists
async function deleteOldAvatar(avatarUrl) {
  if (!avatarUrl) return;
  const publicId = extractPublicId(avatarUrl);
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.warn("Failed to delete old avatar from Cloudinary:", err.message);
    }
  }
}

// General image upload (unauthenticated)
router.post("/", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await streamUploadToCloudinary(req.file.buffer, "tutorlink");

    res.status(200).json({
      imageUrl: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
});

// ✅ Student avatar upload (authenticated)
router.post("/student-avatar", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.user.id;

    // Verify student profile exists
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }

    // Delete old avatar from Cloudinary if exists
    await deleteOldAvatar(student.avatar);

    // Upload new image to Cloudinary
    const result = await streamUploadToCloudinary(req.file.buffer, "tutorlink/avatars");

    // Update student avatar in database
    await prisma.student.update({
      where: { userId },
      data: { avatar: result.secure_url },
    });

    res.status(200).json({
      message: "Avatar updated successfully",
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Avatar upload failed:", error);
    res.status(500).json({ message: "Avatar upload failed", error: error.message });
  }
});

// ✅ Tutor avatar upload (authenticated)
router.post("/tutor-avatar", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.user.id;

    // Verify tutor profile exists
    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    // Delete old avatar from Cloudinary if exists
    await deleteOldAvatar(tutor.avatar);

    // Upload new image to Cloudinary
    const result = await streamUploadToCloudinary(req.file.buffer, "tutorlink/avatars");

    // Update tutor avatar in database
    await prisma.tutor.update({
      where: { userId },
      data: { avatar: result.secure_url },
    });

    res.status(200).json({
      message: "Avatar updated successfully",
      imageUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Tutor avatar upload failed:", error);
    res.status(500).json({ message: "Tutor avatar upload failed", error: error.message });
  }
});

// Helper: upload buffer to Cloudinary via stream
function streamUploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }] },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = router;