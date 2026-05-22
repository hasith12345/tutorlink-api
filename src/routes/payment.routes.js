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
} = require("../controllers/payment.controller");

router.post("/create-intent", authenticate, createPaymentIntent);
router.post("/confirm", authenticate, confirmPayment);
router.get("/admin", authenticate, getAdminPayments);
router.get("/tutor/earnings", authenticate, getTutorEarnings);
router.get("/tutor/students", authenticate, getTutorStudents);
router.get("/student/enrollments", authenticate, getStudentEnrollments);

module.exports = router;
