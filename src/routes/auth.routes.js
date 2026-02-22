const router = require("express").Router();
const { 
  signup, 
  login, 
  verifyEmail, 
  resendVerificationCode, 
  addRole,
  oauthLogin,
  oauthCallback,
  oauthSignup,
  getProfile,
  updateProfile,
  changePassword
} = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/signup", (req, res, next) => {
  console.log("Signup route hit");
  next();
}, signup);
router.post("/login", login);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);

// ✅ OAuth Routes
router.get("/oauth/login", oauthLogin);
router.get("/oauth/callback", oauthCallback);
router.post("/oauth/signup", oauthSignup);  // New: Create account for OAuth users

// ✅ Protected routes - user must be authenticated
router.post("/add-role", authMiddleware, addRole);
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.put("/change-password", authMiddleware, changePassword);

module.exports = router;
