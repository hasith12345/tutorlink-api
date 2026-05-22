const express = require("express");
const multer = require("multer");
const upload = require("../middleware/upload");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const authMiddleware = require("../middleware/auth.middleware");
const { prisma } = require("../models");

const router = express.Router();

// Multer config for ID copy uploads: images (5 MB each) + PDF (10 MB)
const idCopyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP images and PDF files are allowed"), false);
    }
  },
});

// Multer config for CV uploads: PDF, DOC, DOCX, images (max 5 MB)
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, DOCX, and image files are allowed"), false);
    }
  },
});

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
    const result = await streamUploadToCloudinary(req.file.buffer, "tutorlink/avatars", {
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

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
    const result = await streamUploadToCloudinary(req.file.buffer, "tutorlink/avatars", {
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

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

// ✅ ID copy upload (unauthenticated - used during tutor signup before account creation)
// Accepts: image/jpeg, image/png, image/webp (max 5 MB each) OR application/pdf (max 10 MB)
// Returns: { url, publicId, resourceType }
router.post("/id-copy", idCopyUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const isPdf = req.file.mimetype === "application/pdf";

    // Enforce image size cap (5 MB) even though the multer limit is 10 MB
    if (!isPdf && req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Image files must be 5 MB or smaller" });
    }

    const uploadOptions = isPdf
      ? { resource_type: "raw" }
      : { resource_type: "image" };

    const result = await streamUploadToCloudinary(
      req.file.buffer,
      "tutorlink/id-copies",
      uploadOptions
    );

    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: isPdf ? "pdf" : "image",
    });
  } catch (error) {
    console.error("ID copy upload failed:", error);
    // Handle multer file-size error
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 10 MB for PDFs and 5 MB for images." });
    }
    res.status(500).json({ message: "ID copy upload failed", error: error.message });
  }
});

// ✅ CV upload (unauthenticated - used during tutor signup before account creation)
// Accepts: application/pdf, application/msword, .docx, images (max 5 MB)
// Returns: { url, publicId, resourceType }
router.post("/cv", cvUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const mimeType = req.file.mimetype;
    const isImage = mimeType.startsWith("image/");

    // Determine resource type for Cloudinary
    let uploadOptions = {};
    if (mimeType === "application/pdf") {
      uploadOptions = { resource_type: "raw" };
    } else if (mimeType === "application/msword" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      uploadOptions = { resource_type: "raw" }; // Store DOC/DOCX as raw files
    } else if (isImage) {
      uploadOptions = { resource_type: "image" };
    }

    const result = await streamUploadToCloudinary(
      req.file.buffer,
      "tutorlink/cvs",
      uploadOptions
    );

    res.status(200).json({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: isImage ? "image" : "document",
    });
  } catch (error) {
    console.error("CV upload failed:", error);
    // Handle multer file-size error
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 5 MB." });
    }
    res.status(500).json({ message: "CV upload failed", error: error.message });
  }
});

// Multer config for class material uploads: images, PDF, DOC/DOCX, video (max 50 MB)
const classMaterialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4", "video/webm", "video/quicktime",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Accepted: images, PDF, DOC/DOCX, MP4/WEBM video"), false);
    }
  },
});

// ✅ Class material upload (authenticated tutor)
router.post("/class-material", authMiddleware, classMaterialUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { folderId, description } = req.body;
    if (!folderId) {
      return res.status(400).json({ message: "folderId is required" });
    }

    const userId = req.user.id;

    // Verify the folder belongs to a class owned by this tutor
    const folder = await prisma.classFolder.findUnique({
      where: { id: folderId },
      include: { class: true },
    });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor || folder.class.tutorId !== tutor.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const mimeType = req.file.mimetype;
    let resourceType = "raw";
    let materialResourceType = "document";

    if (mimeType.startsWith("image/")) {
      resourceType = "image";
      materialResourceType = "image";
    } else if (mimeType.startsWith("video/")) {
      resourceType = "video";
      materialResourceType = "video";
    }

    const result = await streamUploadToCloudinary(
      req.file.buffer,
      "tutorlink/class-materials",
      { resource_type: resourceType }
    );

    const material = await prisma.classMaterial.create({
      data: {
        folderId,
        name: req.file.originalname,
        description: description || null,
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: materialResourceType,
        mimeType,
        sizeBytes: req.file.size,
      },
    });

    res.status(201).json({ material });
  } catch (error) {
    console.error("Class material upload failed:", error);
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File is too large. Maximum size is 50 MB." });
    }
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
});

// Helper: upload buffer to Cloudinary via stream
function streamUploadToCloudinary(buffer, folder, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadOptions = { folder, ...options };
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = router;