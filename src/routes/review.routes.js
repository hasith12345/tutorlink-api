const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
  createReview,
  getTutorReviews,
  deleteReview,
  getMyReview,
} = require("../controllers/review.controller");

router.post("/", auth, createReview);
router.get("/tutor/:tutorId", getTutorReviews);           // public
router.get("/my-review/:enrollmentId", auth, getMyReview);
router.delete("/:id", auth, deleteReview);

module.exports = router;
