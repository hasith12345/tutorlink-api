const { prisma } = require("../models");
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

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({ message: "Full name is required (minimum 2 characters)" });
    }

    if (!role || !["student", "tutor"].includes(role)) {
      return res.status(400).json({ message: "Valid role (student or tutor) is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    // Check if user already exists
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role
      }
    });

    // Create role-specific profile
    if (role === "student") {
      // Validate student-specific fields
      const { educationLevel, grade, subjects, learningMode } = req.body;
      
      if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        // Rollback user creation
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "At least one subject is required" });
      }

      if (!learningMode || !["online", "physical", "both"].includes(learningMode)) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Valid learning mode is required (online, physical, or both)" });
      }

      await prisma.student.create({
        data: {
          userId: user.id,
          educationLevel: educationLevel || null,
          grade: grade || null,
          subjects: subjects,
          learningMode: learningMode
        }
      });
    }

    if (role === "tutor") {
      // Validate tutor-specific fields
      const { subjects, educationLevels, experience } = req.body;

      if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "At least one subject is required" });
      }

      if (!educationLevels || !Array.isArray(educationLevels) || educationLevels.length === 0) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "At least one education level is required" });
      }

      if (!experience) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Years of experience is required" });
      }

      await prisma.tutor.create({
        data: {
          userId: user.id,
          subjects: subjects,
          educationLevels: educationLevels,
          experience: experience
        }
      });
    }

    // Generate JWT token
    const token = generateToken(user);
    
    console.log("Signup successful for:", user.email);
    res.status(201).json({ 
      token, 
      role,
      message: "Account created successfully"
    });

  } catch (err) {
    console.error("Signup error:", err);
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

    const user = await prisma.user.findUnique({ where: { email } });
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
