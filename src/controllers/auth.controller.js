const { prisma } = require("../models");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../config/jwt");
const { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail } = require("../utils/email");
const crypto = require("crypto");
const { AuthenticationClient } = require("auth0");
const axios = require("axios");

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
      const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = req.body;
      
      if (!dob) {
        // Rollback user creation
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!phone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!address) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Address is required" });
      }

      if (!schoolGrade) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "School grade is required" });
      }

      if (!schoolName) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "School name is required" });
      }

      if (!parentName) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Parent name is required" });
      }

      if (!parentPhone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Parent phone number is required" });
      }

      await prisma.student.create({
        data: {
          userId: user.id,
          dob: dob,
          phone: phone,
          address: address,
          schoolGrade: schoolGrade,
          schoolName: schoolName,
          parentName: parentName,
          parentPhone: parentPhone
        }
      });
    }

    if (role === "tutor") {
      // Validate tutor-specific fields
      const { dob, phone, address, idNumber } = req.body;

      if (!dob) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!phone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!address) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Address is required" });
      }

      if (!idNumber) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "ID number is required" });
      }

      await prisma.tutor.create({
        data: {
          userId: user.id,
          dob: dob,
          phone: phone,
          address: address,
          idNumber: idNumber,
          idCopyFront: req.body.idCopyFront || null,
          idCopyBack: req.body.idCopyBack || null,
          idCopyPdf: req.body.idCopyPdf || null,
          qualifications: req.body.qualifications || null,
          subjects: req.body.subjects || [],
          experience: req.body.experience || null,
          cvUrl: req.body.cvUrl || null,
          applicationStatus: (req.body.qualifications && req.body.subjects && req.body.subjects.length > 0) ? "PENDING" : "NOT_SUBMITTED"
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

    // ✅ Check if account is banned
    if (user.isBanned) {
      return res.status(403).json({
        message: "Your account has been banned. Please contact admin.",
        isBanned: true
      });
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
        hasTutorProfile,     // true/false
        tutorStatus: user.tutor?.applicationStatus || null,
        avatar: user.student?.avatar || user.tutor?.avatar || null
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
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationCode: null,
        verificationCodeExpiry: null
      },
      include: {
        student: true,
        tutor: true
      }
    });

    // Generate JWT so the frontend can auto-login immediately
    const token = generateToken(verifiedUser);
    const hasStudentProfile = !!verifiedUser.student;
    const hasTutorProfile   = !!verifiedUser.tutor;

    console.log("Email verified successfully for:", verifiedUser.email);
    res.json({
      message: "Email verified successfully!",
      verified: true,
      token,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        fullName: verifiedUser.fullName,
        hasStudentProfile,
        hasTutorProfile,
        tutorStatus: verifiedUser.tutor?.applicationStatus || null,
        avatar: verifiedUser.student?.avatar || verifiedUser.tutor?.avatar || null
      }
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
      const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = roleData;

      // Validate required fields
      if (!dob) {
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!address) {
        return res.status(400).json({ message: "Address is required" });
      }

      if (!schoolGrade) {
        return res.status(400).json({ message: "School grade is required" });
      }

      if (!schoolName) {
        return res.status(400).json({ message: "School name is required" });
      }

      if (!parentName) {
        return res.status(400).json({ message: "Parent name is required" });
      }

      if (!parentPhone) {
        return res.status(400).json({ message: "Parent phone number is required" });
      }

      await prisma.student.create({
        data: {
          userId: user.id,
          dob: dob,
          phone: phone,
          address: address,
          schoolGrade: schoolGrade,
          schoolName: schoolName,
          parentName: parentName,
          parentPhone: parentPhone
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
      const { dob, phone, address, idNumber } = roleData;

      // ✅ If user has student profile, use their existing DOB, Phone, Address
      let tutorDob = dob;
      let tutorPhone = phone;
      let tutorAddress = address;

      if (user.student) {
        tutorDob = user.student.dob || dob;
        tutorPhone = user.student.phone || phone;
        tutorAddress = user.student.address || address;
      }

      // Validate required fields
      if (!tutorDob) {
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!tutorPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!tutorAddress) {
        return res.status(400).json({ message: "Address is required" });
      }

      if (!idNumber) {
        return res.status(400).json({ message: "ID number is required" });
      }

      await prisma.tutor.create({
        data: {
          userId: user.id,
          dob: tutorDob,
          phone: tutorPhone,
          address: tutorAddress,
          idNumber: idNumber,
          idCopyFront: req.body.idCopyFront || null,
          idCopyBack: req.body.idCopyBack || null,
          idCopyPdf: req.body.idCopyPdf || null,
          qualifications: req.body.qualifications || null,
          subjects: req.body.subjects || [],
          experience: req.body.experience || null,
          cvUrl: req.body.cvUrl || null,
          applicationStatus: (req.body.qualifications && req.body.subjects && req.body.subjects.length > 0) ? "PENDING" : "NOT_SUBMITTED"
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

// ✅ OAUTH ROUTES FOR AUTH0 GOOGLE LOGIN

/**
 * GET /auth/oauth/login
 * Redirects user to Auth0 for Google OAuth login
 * Accepts ?mode=login or ?mode=signup to determine flow behavior
 */
exports.oauthLogin = async (req, res, next) => {
  try {
    // Get mode from query parameter (login or signup)
    const mode = req.query.mode || 'login';
    
    // Store mode in state parameter to pass through OAuth flow
    const stateData = JSON.stringify({ mode });
    const state = Buffer.from(stateData).toString('base64');
    
    // Build Auth0 authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.AUTH0_CLIENT_ID,
      redirect_uri: process.env.AUTH0_CALLBACK_URL,
      scope: 'openid profile email',
      connection: 'google-oauth2',
      prompt: 'select_account',  // Forces account selection
      state: state  // Pass mode through OAuth flow
    });
    
    const authUrl = `https://${process.env.AUTH0_DOMAIN}/authorize?${params.toString()}`;
    
    console.log("=== OAuth Login Debug ===");
    console.log("Mode:", mode);
    console.log("AUTH0_DOMAIN:", process.env.AUTH0_DOMAIN);
    console.log("AUTH0_CLIENT_ID:", process.env.AUTH0_CLIENT_ID);
    console.log("AUTH0_CALLBACK_URL:", process.env.AUTH0_CALLBACK_URL);
    console.log("Full Auth URL:", authUrl);
    console.log("=========================");
    
    res.redirect(authUrl);
  } catch (err) {
    console.error("OAuth login error:", err);
    next(err);
  }
};

/**
 * GET /auth/oauth/callback
 * Handles Auth0 callback - behavior depends on mode (login vs signup)
 * - login mode: Only works if user exists, otherwise returns error
 * - signup mode: Returns OAuth data for new user registration flow
 */
exports.oauthCallback = async (req, res, next) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ message: "Authorization code is required" });
    }

    // ✅ Extract mode from state parameter
    let mode = 'login'; // default to login
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        mode = stateData.mode || 'login';
      } catch (e) {
        console.log("Could not parse state, defaulting to login mode");
      }
    }

    console.log("=== OAuth Callback Debug ===");
    console.log("Mode:", mode);
    console.log("Authorization code received:", code.substring(0, 20) + "...");

    // ✅ Step 1: Exchange authorization code for tokens using Auth0 token endpoint
    const tokenUrl = `https://${process.env.AUTH0_DOMAIN}/oauth/token`;
    
    const tokenResponse = await axios.post(tokenUrl, {
      grant_type: 'authorization_code',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.AUTH0_CALLBACK_URL
    });

    console.log("Token response received");
    const { access_token, id_token } = tokenResponse.data;

    // ✅ Step 2: Get user profile from Auth0 /userinfo endpoint
    const userInfoUrl = `https://${process.env.AUTH0_DOMAIN}/userinfo`;
    const userInfoResponse = await axios.get(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const userProfile = userInfoResponse.data;
    console.log("Auth0 user profile:", userProfile);

    if (!userProfile.email) {
      return res.status(400).json({ 
        message: "Email not provided by Google. Please try again." 
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // ✅ Step 3: Check if user already exists in our database
    let user = await prisma.user.findUnique({
      where: { email: userProfile.email.toLowerCase() },
      include: {
        student: true,
        tutor: true
      }
    });

    let responseData;

    if (user) {
      // ✅ User EXISTS
      
      if (mode === 'signup') {
        // SIGNUP MODE but user already exists - log them in instead
        console.log("Signup attempt for existing user, logging in:", user.email);
      } else {
        console.log("Found existing OAuth user:", user.email);
      }
      
      // Ensure they're verified
      if (!user.isEmailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true }
        });
      }

      // Generate JWT token
      const token = generateToken(user);
      const hasStudentProfile = !!user.student;
      const hasTutorProfile = !!user.tutor;

      responseData = {
        isNewUser: false,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          hasStudentProfile,
          hasTutorProfile,
          isOAuthUser: user.isOAuthUser
        }
      };
    } else {
      // ✅ User does NOT exist
      
      if (mode === 'login') {
        // LOGIN MODE: User must exist - show error
        console.log("Login attempt for non-existent user:", userProfile.email);
        const errorUrl = `${frontendUrl}/auth/oauth/error?error=${encodeURIComponent("No account found with this Google account. Please sign up first.")}`;
        return res.redirect(errorUrl);
      }
      
      // SIGNUP MODE: Return OAuth data for registration flow
      console.log("New OAuth user (signup mode):", userProfile.email);
      
      responseData = {
        isNewUser: true,
        oauthData: {
          email: userProfile.email.toLowerCase(),
          fullName: userProfile.name || userProfile.email,
          picture: userProfile.picture || null
        }
      };
    }

    // ✅ Step 4: Redirect to frontend with response data
    const redirectUrl = `${frontendUrl}/auth/oauth/success?data=${encodeURIComponent(JSON.stringify(responseData))}`;
    
    console.log("OAuth callback successful, redirecting to frontend");
    
    res.redirect(redirectUrl);

  } catch (err) {
    console.error("OAuth callback error:", err);
    
    // Redirect to frontend error page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorUrl = `${frontendUrl}/auth/oauth/error?error=${encodeURIComponent(err.message)}`;
    res.redirect(errorUrl);
  }
};

// ✅ NEW: OAuth Signup - Creates user account with profile in one call
// Called when OAuth user completes their profile
exports.oauthSignup = async (req, res, next) => {
  try {
    const { email, fullName, role, ...roleData } = req.body;

    console.log("OAuth signup request:", { email, fullName, role });

    // Validate required fields
    if (!email || !fullName) {
      return res.status(400).json({ message: "Email and full name are required" });
    }

    if (!role || !["student", "tutor"].includes(role)) {
      return res.status(400).json({ message: "Valid role (student or tutor) is required" });
    }

    // Check if user already exists
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) {
      return res.status(400).json({ 
        message: "An account with this email already exists. Please login instead." 
      });
    }

    // Generate a random password (OAuth users won't use it)
    const randomPassword = await hashPassword(Math.random().toString(36) + Date.now());

    // Create user
    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: randomPassword,
        isOAuthUser: true,
        isEmailVerified: true, // OAuth users are auto-verified
        emailVerificationCode: null,
        verificationCodeExpiry: null
      }
    });

    // Create role-specific profile
    if (role === "student") {
      const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = roleData;

      if (!dob) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!phone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!address) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Address is required" });
      }

      if (!schoolGrade) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "School grade is required" });
      }

      if (!schoolName) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "School name is required" });
      }

      if (!parentName) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Parent name is required" });
      }

      if (!parentPhone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Parent phone number is required" });
      }

      await prisma.student.create({
        data: {
          userId: user.id,
          dob: dob,
          phone: phone,
          address: address,
          schoolGrade: schoolGrade,
          schoolName: schoolName,
          parentName: parentName,
          parentPhone: parentPhone
        }
      });
    }

    if (role === "tutor") {
      const { dob, phone, address, idNumber } = roleData;

      if (!dob) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Date of birth is required" });
      }

      if (!phone) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!address) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "Address is required" });
      }

      if (!idNumber) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(400).json({ message: "ID number is required" });
      }

      await prisma.tutor.create({
        data: {
          userId: user.id,
          dob: dob,
          phone: phone,
          address: address,
          idNumber: idNumber,
          idCopyFront: req.body.idCopyFront || null,
          idCopyBack: req.body.idCopyBack || null,
          idCopyPdf: req.body.idCopyPdf || null,
          qualifications: req.body.qualifications || null,
          subjects: req.body.subjects || [],
          experience: req.body.experience || null,
          cvUrl: req.body.cvUrl || null,
          applicationStatus: (req.body.qualifications && req.body.subjects && req.body.subjects.length > 0) ? "PENDING" : "NOT_SUBMITTED"
        }
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    console.log("OAuth signup successful for:", user.email);
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        hasStudentProfile: role === "student",
        hasTutorProfile: role === "tutor"
      }
    });

  } catch (err) {
    console.error("OAuth signup error:", err);
    next(err);
  }
};

// ✅ GET USER PROFILE - Returns complete user profile with student/tutor details
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch user with both profiles
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

    // Build response object
    const profile = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      isOAuthUser: user.isOAuthUser,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasStudentProfile: !!user.student,
      hasTutorProfile: !!user.tutor,
      student: user.student ? {
        id: user.student.id,
        dob: user.student.dob,
        phone: user.student.phone,
        address: user.student.address,
        schoolGrade: user.student.schoolGrade,
        schoolName: user.student.schoolName,
        parentName: user.student.parentName,
        parentPhone: user.student.parentPhone,
        avatar: user.student.avatar,
        createdAt: user.student.createdAt
      } : null,
      tutor: user.tutor ? {
        id: user.tutor.id,
        dob: user.tutor.dob,
        phone: user.tutor.phone,
        address: user.tutor.address,
        idNumber: user.tutor.idNumber,
        avatar: user.tutor.avatar,
        createdAt: user.tutor.createdAt
      } : null
    };

    res.json(profile);

  } catch (err) {
    console.error("Get profile error:", err);
    next(err);
  }
};

// ✅ UPDATE USER PROFILE - Updates user profile and student/tutor details
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName, student, tutor } = req.body;

    // Validate fullName if provided
    if (fullName !== undefined && (!fullName || fullName.trim().length < 2)) {
      return res.status(400).json({ message: "Full name must be at least 2 characters" });
    }

    // Fetch current user to check what profiles exist
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, tutor: true }
    });

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user's basic info
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName && { fullName: fullName.trim() })
      }
    });

    // Update student profile if it exists and data is provided
    if (currentUser.student && student) {
      const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = student;

      await prisma.student.update({
        where: { userId: userId },
        data: {
          ...(dob !== undefined && { dob }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(schoolGrade !== undefined && { schoolGrade }),
          ...(schoolName !== undefined && { schoolName }),
          ...(parentName !== undefined && { parentName }),
          ...(parentPhone !== undefined && { parentPhone })
        }
      });
    }

    // Update tutor profile if it exists and data is provided
    if (currentUser.tutor && tutor) {
      const { dob, phone, address, idNumber } = tutor;

      await prisma.tutor.update({
        where: { userId: userId },
        data: {
          ...(dob !== undefined && { dob }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(idNumber !== undefined && { idNumber })
        }
      });
    }

    // Fetch updated profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, tutor: true }
    });

    // Build response
    const profile = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      hasStudentProfile: !!user.student,
      hasTutorProfile: !!user.tutor,
      student: user.student ? {
        id: user.student.id,
        dob: user.student.dob,
        phone: user.student.phone,
        address: user.student.address,
        schoolGrade: user.student.schoolGrade,
        schoolName: user.student.schoolName,
        parentName: user.student.parentName,
        parentPhone: user.student.parentPhone,
        avatar: user.student.avatar,
        createdAt: user.student.createdAt
      } : null,
      tutor: user.tutor ? {
        id: user.tutor.id,
        dob: user.tutor.dob,
        phone: user.tutor.phone,
        address: user.tutor.address,
        idNumber: user.tutor.idNumber,
        createdAt: user.tutor.createdAt
      } : null
    };

    res.json({ message: "Profile updated successfully", profile });

  } catch (err) {
    console.error("Update profile error:", err);
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    // Validate new password strength
    if (newPassword.length < 8 || newPassword.length > 12) {
      return res.status(400).json({ message: "Password must be 8-12 characters long" });
    }
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        message: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*)"
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isOAuthUser) {
      return res.status(400).json({ message: "You signed up with Google. Please use 'Set Password' to create a password for email login." });
    }

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from the current password" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always return success to prevent email enumeration
    if (!user || !user.password) {
      return res.json({ message: "If an account exists with this email, a password reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry }
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail(user.email, user.fullName, resetLink);

    res.json({ message: "If an account exists with this email, a password reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 8 || newPassword.length > 12) {
      return res.status(400).json({ message: "Password must be 8-12 characters long" });
    }
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        message: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*)"
      });
    }

    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token. Please request a new password reset." });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null }
    });

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    next(err);
  }
};

// =============================================
// SET PASSWORD  (OAuth users only — no current password needed)
// POST /auth/set-password   [protected]
// After setting, isOAuthUser becomes false so future changes use /change-password
// =============================================
exports.setPassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    if (newPassword.length < 8 || newPassword.length > 12) {
      return res.status(400).json({ message: "Password must be 8-12 characters long" });
    }
    if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least 1 uppercase letter" });
    if (!/[a-z]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least 1 lowercase letter" });
    if (!/[0-9]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least 1 number" });
    if (!/[!@#$%^&*]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least 1 special character (!@#$%^&*)" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.isOAuthUser) {
      return res.status(400).json({ message: "You already have a password. Please use 'Change Password' instead." });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, isOAuthUser: false }
    });

    res.json({ message: "Password set successfully. You can now log in with your email and this password." });
  } catch (err) {
    console.error("Set password error:", err);
    next(err);
  }
};

// ✅ Get current user with role flags (for dashboard sync)
exports.getCurrentUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, tutor: true }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        hasStudentProfile: !!user.student,
        hasTutorProfile: !!user.tutor,
        tutorStatus: user.tutor?.applicationStatus || null,
        avatar: user.student?.avatar || user.tutor?.avatar || null
      }
    });
  } catch (err) {
    console.error("Get current user error:", err);
    next(err);
  }
};

// ✅ Admin: Get all users
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        student: { select: { id: true, avatar: true, phone: true, schoolGrade: true, schoolName: true } },
        tutor: { select: { id: true, avatar: true, phone: true, applicationStatus: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const formatted = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      isEmailVerified: u.isEmailVerified,
      isBanned: u.isBanned,
      createdAt: u.createdAt,
      hasStudentProfile: !!u.student,
      hasTutorProfile: !!u.tutor,
      tutorStatus: u.tutor?.applicationStatus || null,
      avatar: u.student?.avatar || u.tutor?.avatar || null,
      student: u.student,
      tutor: u.tutor,
    }));

    res.json({ users: formatted, total: formatted.length });
  } catch (err) {
    console.error("Get all users error:", err);
    next(err);
  }
};

// ✅ Admin: Ban a user
exports.banUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true },
      select: { id: true, fullName: true, email: true, isBanned: true }
    });
    res.json({ message: "User banned successfully", user });
  } catch (err) {
    console.error("Ban user error:", err);
    next(err);
  }
};

// ✅ Admin: Unban a user
exports.unbanUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
      select: { id: true, fullName: true, email: true, isBanned: true }
    });
    res.json({ message: "User unbanned successfully", user });
  } catch (err) {
    console.error("Unban user error:", err);
    next(err);
  }
};

// ✅ Admin login — issues a special admin JWT
exports.adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (username !== "admin" || password !== "admin") {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }
    const token = require("jsonwebtoken").sign(
      { id: "admin", role: "admin", isAdmin: true },
      process.env.JWT_SECRET || "tutorlink_jwt_secret_key_2024",
      { expiresIn: "24h" }
    );
    res.json({ token });
  } catch (err) {
    next(err);
  }
};
