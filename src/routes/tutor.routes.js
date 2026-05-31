const express = require("express");
const router = express.Router();
const tutorController = require("../controllers/tutor.controller");

// Public routes
router.get("/search", tutorController.searchTutors);
router.get("/suggestions", tutorController.getTutorSuggestions);
router.get("/:id", tutorController.getTutorById);


module.exports = router;
