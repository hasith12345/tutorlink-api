const { prisma } = require("../models");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../config/jwt");
const { generateVerificationCode, sendVerificationEmail } = require("../utils/email");

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
    if (password.length < 8 || password.length > 12) {
      return res.status(400).json({ message: "Password must be 8-12 characters long" });
    }
    
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({ 
        message: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*)" 
      });
    }

    // ✅ CRITICAL: Check if user already exists
    // This prevents duplicate accounts with the same email
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (exists) {
      return res.status(400).json({ 
        message: "An account with this email already exists. Please login or use a different email." 
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // ✅ Create user WITHOUT role field (removed from schema)
    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        emailVerificationCode: verificationCode,
        verificationCodeExpiry: verificationExpiry,
        isEmailVerified: false
      }
    });

    // ✅ Create role-specific profile based on user selection
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

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, verificationCode, user.fullName);
    
    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.error);
      // Note: We don't fail the signup if email fails, but log it
    }

    // Generate JWT token (but user won't be able to access protected routes until verified)
    const token = generateToken(user);
    
    console.log("Signup successful for:", user.email);
    res.status(201).json({ 
      token, 
      role,  // Return the role they signed up as (for frontend use)
      email: user.email,
      isEmailVerified: false,
      message: "Account created successfully. Please check your email for verification code."
    });

  } catch (err) {
    console.error("Signup error:", err);
    next(err);
  }
};

// ✅ LOGIN WITH AUTOMATIC ROLE DETECTION
// This is the ONLY login endpoint - user logs in once with email + password
// System auto-detects which roles the user has based on profile tables
exports.login = async (req, res, next) => {
  try {
    console.log("Login attempt:", req.body);
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // ✅ Fetch user with BOTH Student and Tutor profiles
    // This allows us to check which roles exist for this user
    const user = await prisma.user.findUnique({ 
      where: { email: email.toLowerCase().trim() },
      include: {
        student: true,  // Include student profile if it exists
        tutor: true     // Include tutor profile if it exists
      }
    });
    console.log("User found:", user ? "Yes" : "No");
    
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Check if email is verified (MUST be verified before login)
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        message: "Please verify your email before logging in",
        requiresVerification: true,
        email: user.email
      });
    }

    // Verify password
    const valid = await comparePassword(password, user.password);
    console.log("Password valid:", valid);
    
    if (!valid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ ROLE DETECTION LOGIC
    // Check which profiles exist to determine available roles
    const hasStudentProfile = !!user.student;  // true if student profile exists
    const hasTutorProfile = !!user.tutor;      // true if tutor profile exists

    // Generate JWT token
    const token = generateToken(user);
    
    // ✅ Return user info with role flags
    // Frontend will use these flags to determine where to redirect
    res.json({ 
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        hasStudentProfile,   // true/false
        hasTutorProfile      // true/false
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    next(err);
  }
};

// Verify email with code
exports.verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and verification code are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Check if code matches
    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Check if code has expired
    if (new Date() > new Date(user.verificationCodeExpiry)) {
      return res.status(400).json({ 
        message: "Verification code has expired. Please request a new one.",
        expired: true
      });
    }

    // Update user as verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationCode: null,
        verificationCodeExpiry: null
      }
    });

    console.log("Email verified successfully for:", user.email);
    res.json({ 
      message: "Email verified successfully! You can now log in.",
      verified: true
    });

  } catch (err) {
    console.error("Email verification error:", err);
    next(err);
  }
};

// Resend verification code
exports.resendVerificationCode = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Update user with new code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCode: verificationCode,
        verificationCodeExpiry: verificationExpiry
      }
    });

    // Send verification email
    const emailResult = await sendVerificationEmail(user.email, verificationCode, user.fullName);
    
    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.error);
      return res.status(500).json({ message: "Failed to send verification email. Please try again." });
    }

    console.log("Verification code resent to:", user.email);
    res.json({ 
      message: "Verification code sent successfully. Please check your email.",
      sent: true
    });

  } catch (err) {
    console.error("Resend verification code error:", err);
    next(err);
  }
};

// ✅ ADD ROLE API - Allows user to add a second role
// Example: A logged-in Student can become a Tutor (or vice versa)
// IMPORTANT: This does NOT create a new User - only adds a profile
exports.addRole = async (req, res, next) => {
  try {
    // Get user ID from JWT token (set by auth middleware)
    const userId = req.user.id;
    const { role, ...roleData } = req.body;

    // Validate role
    if (!role || !["student", "tutor"].includes(role)) {
      return res.status(400).json({ message: "Valid role (student or tutor) is required" });
    }

    // ✅ Fetch user with existing profiles
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: true,
        tutor: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Check if user already has this role
    if (role === "student" && user.student) {
      return res.status(400).json({ message: "You already have a Student profile" });
    }

    if (role === "tutor" && user.tutor) {
      return res.status(400).json({ message: "You already have a Tutor profile" });
    }

    // ✅ Create the new profile
    if (role === "student") {
      const { educationLevel, grade, subjects, learningMode } = roleData;

      // Validate required fields
      if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({ message: "At least one subject is required" });
      }

      if (!learningMode || !["online", "physical", "both"].includes(learningMode)) {
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

      console.log(`Student profile added for user: ${user.email}`);
      return res.status(201).json({ 
        message: "Student profile added successfully",
        hasStudentProfile: true,
        hasTutorProfile: !!user.tutor
      });
    }

    if (role === "tutor") {
      const { subjects, educationLevels, experience } = roleData;

      // Validate required fields
      if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        return res.status(400).json({ message: "At least one subject is required" });
      }

      if (!educationLevels || !Array.isArray(educationLevels) || educationLevels.length === 0) {
        return res.status(400).json({ message: "At least one education level is required" });
      }

      if (!experience) {
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

      console.log(`Tutor profile added for user: ${user.email}`);
      return res.status(201).json({ 
        message: "Tutor profile added successfully",
        hasStudentProfile: !!user.student,
        hasTutorProfile: true
      });
    }

  } catch (err) {
    console.error("Add role error:", err);
    next(err);
  }
};
