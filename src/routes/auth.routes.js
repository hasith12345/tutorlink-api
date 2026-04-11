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
  changePassword,
  setPassword,
  forgotPassword,
  resetPassword
} = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/signup", (req, res, next) => {
  console.log("Signup route hit");
  next();
}, signup);
router.post("/login", login);
router.post("/check-email", async (req, res) => {
  const { prisma } = require("../models");
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "Email is required" });
  }
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true }
  });
  return res.json({ exists: !!existing });
});
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerificationCode);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ✅ OAuth Routes
router.get("/oauth/login", oauthLogin);
router.get("/oauth/callback", oauthCallback);
router.post("/oauth/signup", oauthSignup);  // New: Create account for OAuth users

// ✅ Protected routes - user must be authenticated
router.post("/add-role", authMiddleware, addRole);
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.put("/change-password", authMiddleware, changePassword);
router.put("/set-password", authMiddleware, setPassword);

module.exports = router;
