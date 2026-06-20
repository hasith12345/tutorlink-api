const { prisma } = require('../models');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../config/jwt');
const {
  generateVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('../utils/email');
const crypto = require('crypto');

function appError(message, statusCode = 500, extras = {}) {
  return Object.assign(new Error(message), { statusCode, ...extras });
}

function validatePasswordStrength(password) {
  if (password.length < 8 || password.length > 12) {
    throw appError('Password must be 8-12 characters long', 400);
  }
  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[!@#$%^&*]/.test(password)
  ) {
    throw appError(
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*)',
      400
    );
  }
}

async function createStudentProfile(userId, data) {
  const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = data;
  const fieldLabels = {
    dob: 'Date of birth',
    phone: 'Phone number',
    address: 'Address',
    schoolGrade: 'School grade',
    schoolName: 'School name',
    parentName: 'Parent name',
    parentPhone: 'Parent phone number',
  };
  for (const [field, label] of Object.entries(fieldLabels)) {
    if (!data[field]) throw appError(`${label} is required`, 400);
  }
  await prisma.student.create({
    data: { userId, dob, phone, address, schoolGrade, schoolName, parentName, parentPhone },
  });
}

async function createTutorProfile(userId, data) {
  const { dob, phone, address, idNumber, idCopyFront, idCopyBack, idCopyPdf, qualifications, subjects, experience, cvUrl } = data;
  if (!dob) throw appError('Date of birth is required', 400);
  if (!phone) throw appError('Phone number is required', 400);
  if (!address) throw appError('Address is required', 400);
  if (!idNumber) throw appError('ID number is required', 400);
  await prisma.tutor.create({
    data: {
      userId,
      dob,
      phone,
      address,
      idNumber,
      idCopyFront: idCopyFront || null,
      idCopyBack: idCopyBack || null,
      idCopyPdf: idCopyPdf || null,
      qualifications: qualifications || null,
      subjects: subjects || [],
      experience: experience || null,
      cvUrl: cvUrl || null,
      applicationStatus: qualifications && subjects && subjects.length > 0 ? 'PENDING' : 'NOT_SUBMITTED',
    },
  });
}

async function signup(body) {
  const { fullName, email, password, role, ...roleData } = body;

  if (!email || !password) throw appError('Email and password are required', 400);
  if (!fullName || fullName.trim().length < 2) throw appError('Full name is required (minimum 2 characters)', 400);
  if (!role || !['student', 'tutor'].includes(role)) throw appError('Valid role (student or tutor) is required', 400);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw appError('Invalid email format', 400);
  validatePasswordStrength(password);

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) {
    throw appError('An account with this email already exists. Please login or use a different email.', 400);
  }

  const hashedPassword = await hashPassword(password);
  const verificationCode = generateVerificationCode();
  const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      emailVerificationCode: verificationCode,
      verificationCodeExpiry: verificationExpiry,
      isEmailVerified: false,
    },
  });

  try {
    if (role === 'student') await createStudentProfile(user.id, roleData);
    else if (role === 'tutor') await createTutorProfile(user.id, roleData);
  } catch (err) {
    await prisma.user.delete({ where: { id: user.id } });
    throw err;
  }

  const emailResult = await sendVerificationEmail(user.email, verificationCode, user.fullName);
  if (!emailResult.success) {
    console.error('Failed to send verification email:', emailResult.error);
  }

  const token = generateToken(user);
  return { token, role, email: user.email, isEmailVerified: false };
}

async function login(email, password) {
  if (!email || !password) throw appError('Email and password are required', 400);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { student: true, tutor: true },
  });

  if (!user) throw appError('Invalid credentials', 400);

  if (user.isBanned) throw appError('Your account has been banned. Please contact admin.', 403, { isBanned: true });

  if (!user.isEmailVerified) {
    throw appError('Please verify your email before logging in', 403, {
      requiresVerification: true,
      email: user.email,
    });
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) throw appError('Invalid credentials', 400);

  const hasStudentProfile = !!user.student;
  const hasTutorProfile = !!user.tutor;

  if (
    hasTutorProfile &&
    !hasStudentProfile &&
    user.tutor.applicationStatus === 'APPROVED' &&
    user.tutor.isAvailable === false
  ) {
    throw appError(
      'Your tutor account is inactive due to prolonged absence. Please contact an admin to reactivate it.',
      403,
      { accountInactive: true }
    );
  }

  const token = generateToken(user);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      hasStudentProfile,
      hasTutorProfile,
      tutorStatus: user.tutor?.applicationStatus || null,
      avatar: user.student?.avatar || user.tutor?.avatar || null,
    },
  };
}

async function verifyEmail(email, code) {
  if (!email || !code) throw appError('Email and verification code are required', 400);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw appError('User not found', 404);
  if (user.isEmailVerified) throw appError('Email is already verified', 400);
  if (user.emailVerificationCode !== code) throw appError('Invalid verification code', 400);

  if (new Date() > new Date(user.verificationCodeExpiry)) {
    throw appError('Verification code has expired. Please request a new one.', 400, { expired: true });
  }

  const verifiedUser = await prisma.user.update({
    where: { id: user.id },
    data: { isEmailVerified: true, emailVerificationCode: null, verificationCodeExpiry: null },
    include: { student: true, tutor: true },
  });

  const token = generateToken(verifiedUser);
  return {
    token,
    user: {
      id: verifiedUser.id,
      email: verifiedUser.email,
      fullName: verifiedUser.fullName,
      hasStudentProfile: !!verifiedUser.student,
      hasTutorProfile: !!verifiedUser.tutor,
      tutorStatus: verifiedUser.tutor?.applicationStatus || null,
      avatar: verifiedUser.student?.avatar || verifiedUser.tutor?.avatar || null,
    },
  };
}

async function resendVerificationCode(email) {
  if (!email) throw appError('Email is required', 400);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw appError('User not found', 404);
  if (user.isEmailVerified) throw appError('Email is already verified', 400);

  const verificationCode = generateVerificationCode();
  const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationCode: verificationCode, verificationCodeExpiry: verificationExpiry },
  });

  const emailResult = await sendVerificationEmail(user.email, verificationCode, user.fullName);
  if (!emailResult.success) {
    throw appError('Failed to send verification email. Please try again.', 500);
  }
}

async function addRole(userId, role, roleData) {
  if (!role || !['student', 'tutor'].includes(role)) {
    throw appError('Valid role (student or tutor) is required', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { student: true, tutor: true } });
  if (!user) throw appError('User not found', 404);

  if (role === 'student' && user.student) throw appError('You already have a Student profile', 400);
  if (role === 'tutor' && user.tutor) throw appError('You already have a Tutor profile', 400);

  if (role === 'student') {
    await createStudentProfile(user.id, roleData);
    return { message: 'Student profile added successfully', hasStudentProfile: true, hasTutorProfile: !!user.tutor };
  }

  // Inherit contact info from existing student profile if available
  const tutorData = { ...roleData };
  if (user.student) {
    tutorData.dob = user.student.dob || tutorData.dob;
    tutorData.phone = user.student.phone || tutorData.phone;
    tutorData.address = user.student.address || tutorData.address;
  }
  await createTutorProfile(user.id, tutorData);
  return { message: 'Tutor profile added successfully', hasStudentProfile: !!user.student, hasTutorProfile: true };
}

async function handleOAuthCallback(code, state) {
  const axios = require('axios');

  let mode = 'login';
  if (state) {
    try {
      mode = JSON.parse(Buffer.from(state, 'base64').toString()).mode || 'login';
    } catch (_) {}
  }

  const tokenResponse = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET,
    code,
    redirect_uri: process.env.AUTH0_CALLBACK_URL,
  });

  const userInfoResponse = await axios.get(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
  });
  const userProfile = userInfoResponse.data;

  if (!userProfile.email) throw appError('Email not provided by Google. Please try again.', 400);

  const user = await prisma.user.findUnique({
    where: { email: userProfile.email.toLowerCase() },
    include: { student: true, tutor: true },
  });

  if (user) {
    if (!user.isEmailVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true } });
    }
    const token = generateToken(user);
    return {
      mode,
      isNewUser: false,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        hasStudentProfile: !!user.student,
        hasTutorProfile: !!user.tutor,
        isOAuthUser: user.isOAuthUser,
      },
    };
  }

  return {
    mode,
    isNewUser: true,
    oauthData: {
      email: userProfile.email.toLowerCase(),
      fullName: userProfile.name || userProfile.email,
      picture: userProfile.picture || null,
    },
  };
}

async function oauthSignup(email, fullName, role, roleData) {
  if (!email || !fullName) throw appError('Email and full name are required', 400);
  if (!role || !['student', 'tutor'].includes(role)) throw appError('Valid role (student or tutor) is required', 400);

  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw appError('An account with this email already exists. Please login instead.', 400);

  const randomPassword = await hashPassword(Math.random().toString(36) + Date.now());

  const user = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: randomPassword,
      isOAuthUser: true,
      isEmailVerified: true,
      emailVerificationCode: null,
      verificationCodeExpiry: null,
    },
  });

  try {
    if (role === 'student') await createStudentProfile(user.id, roleData);
    else if (role === 'tutor') await createTutorProfile(user.id, roleData);
  } catch (err) {
    await prisma.user.delete({ where: { id: user.id } });
    throw err;
  }

  const token = generateToken(user);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      hasStudentProfile: role === 'student',
      hasTutorProfile: role === 'tutor',
    },
  };
}

function buildProfileResponse(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    isOAuthUser: user.isOAuthUser,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasStudentProfile: !!user.student,
    hasTutorProfile: !!user.tutor,
    student: user.student
      ? {
          id: user.student.id,
          dob: user.student.dob,
          phone: user.student.phone,
          address: user.student.address,
          schoolGrade: user.student.schoolGrade,
          schoolName: user.student.schoolName,
          parentName: user.student.parentName,
          parentPhone: user.student.parentPhone,
          avatar: user.student.avatar,
          createdAt: user.student.createdAt,
        }
      : null,
    tutor: user.tutor
      ? {
          id: user.tutor.id,
          dob: user.tutor.dob,
          phone: user.tutor.phone,
          address: user.tutor.address,
          idNumber: user.tutor.idNumber,
          avatar: user.tutor.avatar,
          createdAt: user.tutor.createdAt,
        }
      : null,
  };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { student: true, tutor: true } });
  if (!user) throw appError('User not found', 404);
  return buildProfileResponse(user);
}

async function updateProfile(userId, { fullName, student, tutor }) {
  if (fullName !== undefined && (!fullName || fullName.trim().length < 2)) {
    throw appError('Full name must be at least 2 characters', 400);
  }

  const currentUser = await prisma.user.findUnique({ where: { id: userId }, include: { student: true, tutor: true } });
  if (!currentUser) throw appError('User not found', 404);

  await prisma.user.update({ where: { id: userId }, data: { ...(fullName && { fullName: fullName.trim() }) } });

  if (currentUser.student && student) {
    const { dob, phone, address, schoolGrade, schoolName, parentName, parentPhone } = student;
    await prisma.student.update({
      where: { userId },
      data: {
        ...(dob !== undefined && { dob }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(schoolGrade !== undefined && { schoolGrade }),
        ...(schoolName !== undefined && { schoolName }),
        ...(parentName !== undefined && { parentName }),
        ...(parentPhone !== undefined && { parentPhone }),
      },
    });
  }

  if (currentUser.tutor && tutor) {
    const { dob, phone, address, idNumber, qualifications, subjects, experience } = tutor;
    await prisma.tutor.update({
      where: { userId },
      data: {
        ...(dob !== undefined && { dob }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(idNumber !== undefined && { idNumber }),
        ...(qualifications !== undefined && { qualifications }),
        ...(subjects !== undefined && { subjects: Array.isArray(subjects) ? subjects : [subjects] }),
        ...(experience !== undefined && { experience }),
      },
    });
  }

  const updatedUser = await prisma.user.findUnique({ where: { id: userId }, include: { student: true, tutor: true } });
  return buildProfileResponse(updatedUser);
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw appError('Current password and new password are required', 400);
  validatePasswordStrength(newPassword);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw appError('User not found', 404);
  if (user.isOAuthUser) {
    throw appError("You signed up with Google. Please use 'Set Password' to create a password for email login.", 400);
  }

  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) throw appError('Current password is incorrect', 400);
  if (currentPassword === newPassword) throw appError('New password must be different from the current password', 400);

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}

async function forgotPassword(email) {
  if (!email) throw appError('Email is required', 400);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.password) return; // Silent success to prevent email enumeration

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: resetToken, passwordResetExpiry: resetExpiry },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  await sendPasswordResetEmail(user.email, user.fullName, `${frontendUrl}/reset-password?token=${resetToken}`);
}

async function resetPassword(token, newPassword) {
  if (!token || !newPassword) throw appError('Token and new password are required', 400);
  validatePasswordStrength(newPassword);

  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
  });
  if (!user) throw appError('Invalid or expired reset token. Please request a new password reset.', 400);

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, passwordResetToken: null, passwordResetExpiry: null },
  });
}

async function setPassword(userId, newPassword) {
  if (!newPassword) throw appError('New password is required', 400);
  validatePasswordStrength(newPassword);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw appError('User not found', 404);
  if (!user.isOAuthUser) throw appError("You already have a password. Please use 'Change Password' instead.", 400);

  const hashed = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed, isOAuthUser: false } });
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { student: true, tutor: true } });
  if (!user) throw appError('User not found', 404);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    hasStudentProfile: !!user.student,
    hasTutorProfile: !!user.tutor,
    tutorStatus: user.tutor?.applicationStatus || null,
    avatar: user.student?.avatar || user.tutor?.avatar || null,
  };
}

async function getAllUsers() {
  const users = await prisma.user.findMany({
    include: {
      student: { select: { id: true, avatar: true, phone: true, schoolGrade: true, schoolName: true } },
      tutor: { select: { id: true, avatar: true, phone: true, applicationStatus: true, isAvailable: true, lastOnlineAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    isEmailVerified: u.isEmailVerified,
    isBanned: u.isBanned,
    createdAt: u.createdAt,
    hasStudentProfile: !!u.student,
    hasTutorProfile: !!u.tutor,
    tutorStatus: u.tutor?.applicationStatus || null,
    tutorIsAvailable: u.tutor?.isAvailable ?? null,
    tutorLastOnlineAt: u.tutor?.lastOnlineAt ?? null,
    avatar: u.student?.avatar || u.tutor?.avatar || null,
    student: u.student,
    tutor: u.tutor,
  }));
}

async function banUser(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { isBanned: true },
    select: { id: true, fullName: true, email: true, isBanned: true },
  });
}

async function unbanUser(userId) {
  return prisma.user.update({
    where: { id: userId },
    data: { isBanned: false },
    select: { id: true, fullName: true, email: true, isBanned: true },
  });
}

async function reactivateTutor(userId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);
  return prisma.tutor.update({
    where: { id: tutor.id },
    data: { isAvailable: true, lastOnlineAt: new Date() },
    select: { id: true, isAvailable: true, lastOnlineAt: true },
  });
}

module.exports = {
  signup,
  login,
  verifyEmail,
  resendVerificationCode,
  addRole,
  handleOAuthCallback,
  oauthSignup,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  setPassword,
  getCurrentUser,
  getAllUsers,
  banUser,
  unbanUser,
  reactivateTutor,
};
