const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// =============================================
// Resend uses HTTPS API — works even when SMTP is blocked
// Set RESEND_API_KEY in .env to use Resend
// Falls back to nodemailer if not set
// =============================================

const getResendClient = () => {
  if (process.env.RESEND_API_KEY) {
    return new Resend(process.env.RESEND_API_KEY);
  }
  return null;
};

const createTransporter = async () => {
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
    });
  }
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
    try {
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email', port: 587, secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
    } catch (err) { return null; }
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || 587, secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
};

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// =============================================
// SEND VERIFICATION EMAIL
// =============================================
const sendVerificationEmail = async (email, code, fullName) => {
  const subject = 'Verify Your TutorLink Account';
  const html = buildVerificationHtml(fullName, code);
  const text = 'Hi ' + fullName + ',\n\nYour verification code is: ' + code + '\nThis code will expire in 15 minutes.\n\nBest regards,\nThe TutorLink Team';
  return sendEmail(email, subject, html, text, 'VERIFICATION', fullName, { code: code });
};

// =============================================
// SEND PASSWORD RESET EMAIL
// =============================================
const sendPasswordResetEmail = async (email, fullName, resetLink) => {
  // Always log the link first — visible in dev regardless of delivery outcome
  console.log('\n========================================');
  console.log('PASSWORD RESET for:', email);
  console.log('RESET LINK:', resetLink);
  console.log('========================================\n');

  const resend = getResendClient();
  if (resend) {
    try {
      const fromAddr = process.env.RESEND_FROM || 'TutorLink <onboarding@resend.dev>';
      const ownerEmail = process.env.EMAIL_USER; // your verified Resend account email
      const isDev = process.env.NODE_ENV !== 'production';
      const isTestSender = fromAddr.includes('onboarding@resend.dev');

      // Resend free-tier: onboarding@resend.dev can only deliver to the account owner.
      // In dev, redirect all recipients to the owner's inbox so the email actually arrives.
      // The reset link inside is always correct for the real user.
      let deliverTo = email;
      let subject = 'Reset Your TutorLink Password';
      if (isDev && isTestSender && ownerEmail && email.toLowerCase() !== ownerEmail.toLowerCase()) {
        deliverTo = ownerEmail;
        subject = '[DEV → ' + email + '] Reset Your TutorLink Password';
        console.log('ℹ️  Resend dev redirect: reset email for ' + email + ' → delivered to ' + ownerEmail);
      }

      const html = buildResetHtml(fullName, resetLink);
      const text = 'Hi ' + fullName + ',\n\nReset your password here:\n' + resetLink + '\n\nThis link expires in 1 hour.\n\nBest regards,\nThe TutorLink Team';

      const result = await resend.emails.send({ from: fromAddr, to: [deliverTo], subject, html, text });
      if (result.error) throw new Error(result.error.message);
      console.log('PASSWORD RESET email sent via Resend:', result.data.id);
      return { success: true, messageId: result.data.id };
    } catch (err) {
      console.error('Resend password reset error:', err.message);
    }
  }

  // SMTP fallback
  try {
    const transporter = await createTransporter();
    if (!transporter) return { success: true, messageId: 'fallback-mode', devMode: true };
    const from = process.env.EMAIL_SERVICE === 'gmail'
      ? '"TutorLink" <' + process.env.EMAIL_USER + '>'
      : (process.env.EMAIL_FROM || '"TutorLink" <noreply@tutorlink.com>');
    const html = buildResetHtml(fullName, resetLink);
    const text = 'Hi ' + fullName + ',\n\nReset your password here:\n' + resetLink + '\n\nThis link expires in 1 hour.\n\nBest regards,\nThe TutorLink Team';
    const info = await transporter.sendMail({ from, to: email, subject: 'Reset Your TutorLink Password', html, text });
    console.log('PASSWORD RESET email sent via SMTP:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('PASSWORD RESET SMTP error:', err.message);
    console.warn('Reset link already printed above.');
    return { success: true, messageId: 'fallback-mode', devMode: true };
  }
};

// =============================================
// UNIFIED SEND — Resend first, SMTP second, fallback third
// =============================================
async function sendEmail(to, subject, html, text, type, fullName, extra) {
  // 1) Try Resend (HTTPS)
  const resend = getResendClient();
  if (resend) {
    try {
      const fromAddr = process.env.RESEND_FROM || 'TutorLink <onboarding@resend.dev>';
      const result = await resend.emails.send({ from: fromAddr, to: [to], subject: subject, html: html, text: text });
      if (result.error) throw new Error(result.error.message);
      console.log(type + ' email sent via Resend:', result.data.id);
      logForDev(type, extra);
      return { success: true, messageId: result.data.id };
    } catch (err) {
      console.error('Resend error:', err.message);
    }
  }

  // 2) Try SMTP
  try {
    const transporter = await createTransporter();
    if (!transporter) return devFallback(type, to, fullName, extra);
    const from = process.env.EMAIL_SERVICE === 'gmail'
      ? '"TutorLink" <' + process.env.EMAIL_USER + '>'
      : (process.env.EMAIL_FROM || '"TutorLink" <noreply@tutorlink.com>');
    const info = await transporter.sendMail({ from: from, to: to, subject: subject, html: html, text: text });
    console.log(type + ' email sent via SMTP:', info.messageId);
    logForDev(type, extra);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP ' + type + ' error:', error.message);
    return devFallback(type, to, fullName, extra);
  }
}

function logForDev(type, extra) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n========================================');
    if (extra.code) console.log('VERIFICATION CODE:', extra.code);
    if (extra.resetLink) console.log('RESET LINK:', extra.resetLink);
    console.log('========================================\n');
  }
}

function devFallback(type, email, fullName, extra) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n========================================');
    console.log(type + ' (FALLBACK - email not delivered)');
    console.log('========================================');
    console.log('To: ' + email + ' | Name: ' + fullName);
    if (extra.code) console.log('Verification Code: ' + extra.code);
    if (extra.resetLink) console.log('Reset Link: ' + extra.resetLink);
    console.log('========================================\n');
    return { success: true, messageId: 'fallback-mode', devMode: true };
  }
  return { success: false, error: 'Email sending failed' };
}

function buildVerificationHtml(fullName, code) {
  return '<!DOCTYPE html><html><head><style>'
    + 'body{font-family:Arial,sans-serif;line-height:1.6;color:#333}'
    + '.container{max-width:600px;margin:0 auto;padding:20px}'
    + '.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}'
    + '.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}'
    + '.code-box{background:white;border:2px dashed #667eea;padding:20px;text-align:center;border-radius:8px;margin:20px 0}'
    + '.code{font-size:32px;font-weight:bold;letter-spacing:5px;color:#667eea}'
    + '.footer{text-align:center;margin-top:20px;color:#666;font-size:12px}'
    + '</style></head><body><div class="container">'
    + '<div class="header"><h1>Welcome to TutorLink!</h1></div>'
    + '<div class="content">'
    + '<p>Hi ' + fullName + ',</p>'
    + '<p>Thank you for signing up! Please verify your email with the code below:</p>'
    + '<div class="code-box"><div class="code">' + code + '</div></div>'
    + '<p><strong>This code will expire in 15 minutes.</strong></p>'
    + '<p>If you didn\'t create an account, please ignore this email.</p>'
    + '<p>Best regards,<br>The TutorLink Team</p>'
    + '</div>'
    + '<div class="footer"><p>&copy; 2026 TutorLink. All rights reserved.</p></div>'
    + '</div></body></html>';
}

function buildResetHtml(fullName, resetLink) {
  return '<!DOCTYPE html><html><head><style>'
    + 'body{font-family:Arial,sans-serif;line-height:1.6;color:#333}'
    + '.container{max-width:600px;margin:0 auto;padding:20px}'
    + '.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}'
    + '.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}'
    + '.button{display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;margin:20px 0}'
    + '.note{background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:6px;font-size:13px;margin-top:16px}'
    + '.footer{text-align:center;margin-top:20px;color:#666;font-size:12px}'
    + '</style></head><body><div class="container">'
    + '<div class="header"><h1>Reset Your Password</h1></div>'
    + '<div class="content">'
    + '<p>Hi ' + fullName + ',</p>'
    + '<p>We received a request to reset your TutorLink password. Click below:</p>'
    + '<div style="text-align:center"><a href="' + resetLink + '" class="button">Reset Password</a></div>'
    + '<div class="note"><strong>This link will expire in 1 hour.</strong> If you didn\'t request this, ignore this email.</div>'
    + '<p style="margin-top:20px;font-size:13px;color:#666">Or copy this URL:<br><a href="' + resetLink + '">' + resetLink + '</a></p>'
    + '<p>Best regards,<br>The TutorLink Team</p>'
    + '</div>'
    + '<div class="footer"><p>&copy; 2026 TutorLink. All rights reserved.</p></div>'
    + '</div></body></html>';
}

module.exports = { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail };
