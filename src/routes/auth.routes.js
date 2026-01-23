const router = require("express").Router();
const { signup, login } = require("../controllers/auth.controller");

router.post("/signup", (req, res, next) => {
  console.log("Signup route hit");
  next();
}, signup);
router.post("/login", login);

module.exports = router;
