const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  createFolder,
  getFolders,
  updateFolder,
  deleteFolder,
  updateMaterial,
  deleteMaterial,
} = require("../controllers/classFolder.controller");

router.post("/classes/:classId/folders", authMiddleware, createFolder);
router.get("/classes/:classId/folders", authMiddleware, getFolders);
router.put("/classes/:classId/folders/:id", authMiddleware, updateFolder);
router.delete("/classes/:classId/folders/:id", authMiddleware, deleteFolder);
router.patch("/classes/:classId/materials/:id", authMiddleware, updateMaterial);
router.delete("/classes/:classId/materials/:id", authMiddleware, deleteMaterial);

module.exports = router;
