const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const {
  createPaymentIntent,
  confirmPayment,
  getAdminPayments,
  getTutorEarnings,
  getTutorStudents,
  getStudentEnrollments,
  unenrollFromClass,
} = require("../controllers/payment.controller");

router.post("/create-intent", authenticate, createPaymentIntent);
router.post("/confirm", authenticate, confirmPayment);
router.get("/admin", authenticate, getAdminPayments);
router.get("/tutor/earnings", authenticate, getTutorEarnings);
router.get("/tutor/students", authenticate, getTutorStudents);
router.get("/student/enrollments", authenticate, getStudentEnrollments);
router.post("/student/enrollments/:id/unenroll", authenticate, unenrollFromClass);

module.exports = router;
