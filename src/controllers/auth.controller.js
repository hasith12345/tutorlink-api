const authService = require('../services/auth.service');

function handleServiceError(err, res, next) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message, ...pickExtras(err) });
  next(err);
}

function pickExtras(err) {
  const extras = {};
  if (err.isBanned !== undefined) extras.isBanned = err.isBanned;
  if (err.requiresVerification !== undefined) { extras.requiresVerification = err.requiresVerification; extras.email = err.email; }
  if (err.accountInactive !== undefined) extras.accountInactive = err.accountInactive;
  if (err.expired !== undefined) extras.expired = err.expired;
  return extras;
}

exports.signup = async (req, res, next) => {
  try {
    console.log('Signup controller reached');
    const result = await authService.signup(req.body);
    res.status(201).json({
      ...result,
      message: 'Account created successfully. Please check your email for verification code.',
    });
  } catch (err) {
    console.error('Signup error:', err);
    handleServiceError(err, res, next);
  }
};

exports.login = async (req, res, next) => {
  try {
    console.log('Login attempt:', req.body);
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    console.error('Login error:', err);
    handleServiceError(err, res, next);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const result = await authService.verifyEmail(req.body.email, req.body.code);
    res.json({ message: 'Email verified successfully!', verified: true, ...result });
  } catch (err) {
    console.error('Email verification error:', err);
    handleServiceError(err, res, next);
  }
};

exports.resendVerificationCode = async (req, res, next) => {
  try {
    await authService.resendVerificationCode(req.body.email);
    res.json({ message: 'Verification code sent successfully. Please check your email.', sent: true });
  } catch (err) {
    console.error('Resend verification code error:', err);
    handleServiceError(err, res, next);
  }
};

exports.addRole = async (req, res, next) => {
  try {
    const { role, ...roleData } = req.body;
    const result = await authService.addRole(req.user.id, role, roleData);
    res.status(201).json(result);
  } catch (err) {
    console.error('Add role error:', err);
    handleServiceError(err, res, next);
  }
};

exports.oauthLogin = async (req, res, next) => {
  try {
    const mode = req.query.mode || 'login';
    const stateData = JSON.stringify({ mode });
    const state = Buffer.from(stateData).toString('base64');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.AUTH0_CLIENT_ID,
      redirect_uri: process.env.AUTH0_CALLBACK_URL,
      scope: 'openid profile email',
      connection: 'google-oauth2',
      prompt: 'select_account',
      state,
    });

    console.log('=== OAuth Login Debug ===');
    console.log('Mode:', mode);
    console.log('AUTH0_DOMAIN:', process.env.AUTH0_DOMAIN);

    res.redirect(`https://${process.env.AUTH0_DOMAIN}/authorize?${params.toString()}`);
  } catch (err) {
    console.error('OAuth login error:', err);
    next(err);
  }
};

exports.oauthCallback = async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ message: 'Authorization code is required' });

    console.log('=== OAuth Callback Debug ===');
    console.log('Authorization code received:', code.substring(0, 20) + '...');

    const result = await authService.handleOAuthCallback(code, state);

    if (result.isNewUser && result.mode === 'login') {
      return res.redirect(
        `${frontendUrl}/auth/oauth/error?error=${encodeURIComponent('No account found with this Google account. Please sign up first.')}`
      );
    }

    const responseData = result.isNewUser
      ? { isNewUser: true, oauthData: result.oauthData }
      : { isNewUser: false, token: result.token, user: result.user };

    console.log('OAuth callback successful, redirecting to frontend');
    res.redirect(`${frontendUrl}/auth/oauth/success?data=${encodeURIComponent(JSON.stringify(responseData))}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${frontendUrl}/auth/oauth/error?error=${encodeURIComponent(err.message)}`);
  }
};

exports.oauthSignup = async (req, res, next) => {
  try {
    const { email, fullName, role, ...roleData } = req.body;
    console.log('OAuth signup request:', { email, fullName, role });
    const result = await authService.oauthSignup(email, fullName, role, roleData);
    res.status(201).json(result);
  } catch (err) {
    console.error('OAuth signup error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    console.error('Get profile error:', err);
    handleServiceError(err, res, next);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const profile = await authService.updateProfile(req.user.id, req.body);
    res.json({ message: 'Profile updated successfully', profile });
  } catch (err) {
    console.error('Update profile error:', err);
    handleServiceError(err, res, next);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    handleServiceError(err, res, next);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    handleServiceError(err, res, next);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.newPassword);
    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    handleServiceError(err, res, next);
  }
};

exports.setPassword = async (req, res, next) => {
  try {
    await authService.setPassword(req.user.id, req.body.newPassword);
    res.json({ message: 'Password set successfully. You can now log in with your email and this password.' });
  } catch (err) {
    console.error('Set password error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getCurrentUser = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    res.json({ user });
  } catch (err) {
    console.error('Get current user error:', err);
    handleServiceError(err, res, next);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await authService.getAllUsers();
    res.json({ users, total: users.length });
  } catch (err) {
    console.error('Get all users error:', err);
    next(err);
  }
};

exports.banUser = async (req, res, next) => {
  try {
    const user = await authService.banUser(req.params.userId);
    res.json({ message: 'User banned successfully', user });
  } catch (err) {
    console.error('Ban user error:', err);
    next(err);
  }
};

exports.unbanUser = async (req, res, next) => {
  try {
    const user = await authService.unbanUser(req.params.userId);
    res.json({ message: 'User unbanned successfully', user });
  } catch (err) {
    console.error('Unban user error:', err);
    next(err);
  }
};

exports.reactivateTutor = async (req, res, next) => {
  try {
    const tutor = await authService.reactivateTutor(req.params.userId);
    res.json({ message: 'Tutor reactivated successfully', tutor });
  } catch (err) {
    console.error('Reactivate tutor error:', err);
    handleServiceError(err, res, next);
  }
};

exports.adminLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (username !== 'admin' || password !== 'admin') {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }
    const token = require('jsonwebtoken').sign(
      { id: 'admin', role: 'admin', isAdmin: true },
      process.env.JWT_SECRET || 'tutorlink_jwt_secret_key_2024',
      { expiresIn: '24h' }
    );
    res.json({ token });
  } catch (err) {
    next(err);
  }
};
