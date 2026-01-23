const { User, Student, Tutor } = require("../models");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../config/jwt");

exports.signup = async (req, res, next) => {
  try {
    console.log("Signup controller reached");
    console.log("Request body:", req.body);
    const { fullName, email, password, role } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!fullName) {
      return res.status(400).json({ message: "Full name is required" });
    }

    if (!role || !["student", "tutor"].includes(role)) {
      return res.status(400).json({ message: "Valid role (student or tutor) is required" });
    }

    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      role
    });

    if (role === "student") {
      await Student.create({
        userId: user.id,
        educationLevel: req.body.educationLevel,
        grade: req.body.grade,
        subjects: req.body.subjects,
        learningMode: req.body.learningMode
      });
    }

    if (role === "tutor") {
      await Tutor.create({
        userId: user.id,
        subjects: req.body.subjects,
        educationLevels: req.body.educationLevels,
        experience: req.body.experience
      });
    }

    const token = generateToken(user);
    res.status(201).json({ token, role });

  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    console.log("Login attempt:", req.body);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ where: { email } });
    console.log("User found:", user ? "Yes" : "No");
    
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const valid = await comparePassword(password, user.password);
    console.log("Password valid:", valid);
    
    if (!valid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ token, role: user.role });

  } catch (err) {
    console.error("Login error:", err);
    next(err);
  }
};
