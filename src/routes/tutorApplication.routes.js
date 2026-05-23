const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const upload = require("../middleware/upload");
const {
  submitTutorApplication,
  getTutorApplicationStatus,
  uploadCV,
  createClass,
  getMyClasses,
  updateClass,
  cancelClass,
  deleteClass,
  getClassById,
  getPendingApplications,
  getAllApplications,
  approveApplication,
  rejectApplication,
  getAllClassesAdmin,
  forceDeleteClassAdmin,
  holdClassAdmin,
  unholdClassAdmin,
} = require("../controllers/tutorApplication.controller");

// ✅ Tutor Application Routes (authenticated)
router.post("/application/submit", authMiddleware, submitTutorApplication);
router.get("/application/status", authMiddleware, getTutorApplicationStatus);
router.post("/application/upload-cv", authMiddleware, upload.single("cv"), uploadCV);

// ✅ Class Management Routes (authenticated tutor)
router.post("/classes", authMiddleware, createClass);
router.get("/classes", authMiddleware, getMyClasses);
router.get("/classes/:id", authMiddleware, getClassById);
router.put("/classes/:id", authMiddleware, updateClass);
router.put("/classes/:id/cancel", authMiddleware, cancelClass);
router.delete("/classes/:id", authMiddleware, deleteClass);

// ✅ Admin Routes (authenticated - should add admin check in production)
router.get("/admin/applications", authMiddleware, getAllApplications);
router.get("/admin/applications/pending", authMiddleware, getPendingApplications);
router.put("/admin/applications/:id/approve", authMiddleware, approveApplication);
router.put("/admin/applications/:id/reject", authMiddleware, rejectApplication);

// ✅ Admin Class Management Routes
router.get("/admin/classes", authMiddleware, getAllClassesAdmin);
router.delete("/admin/classes/:id", authMiddleware, forceDeleteClassAdmin);
router.put("/admin/classes/:id/hold", authMiddleware, holdClassAdmin);
router.put("/admin/classes/:id/unhold", authMiddleware, unholdClassAdmin);

module.exports = router;
