const router = require("express").Router();
const { signup, login, verifyEmail, resendVerificationCode } = require("../controllers/auth.controller");

router.post("/signup", (req, res, next) => {
  console.log("Signup route hit");
  next();
}, signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);

module.exports = router;
