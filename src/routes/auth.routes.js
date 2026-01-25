const router = require("express").Router();
const { signup, login, verifyEmail, resendVerificationCode, addRole } = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/signup", (req, res, next) => {
  console.log("Signup route hit");
  next();
}, signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);

// ✅ Protected route - user must be authenticated
router.post("/add-role", authMiddleware, addRole);

module.exports = router;
