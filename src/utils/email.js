const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'TutorLink <onboarding@resend.dev>';

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendVerificationEmail = async (email, code, fullName) => {
  const subject = 'Verify Your TutorLink Account';
  const html = buildVerificationHtml(fullName, code);
  const text = `Hi ${fullName},\n\nYour verification code is: ${code}\nThis code will expire in 15 minutes.\n\nBest regards,\nThe TutorLink Team`;

  const { data, error } = await resend.emails.send({ from: FROM, to: [email], subject, html, text });
  if (error) throw new Error(error.message);
  console.log('VERIFICATION email sent via Resend:', data.id);
  if (process.env.NODE_ENV !== 'production') console.log('VERIFICATION CODE:', code);
  return { success: true, messageId: data.id };
};

const sendPasswordResetEmail = async (email, fullName, resetLink) => {
  console.log('\n========================================');
  console.log('PASSWORD RESET for:', email);
  console.log('RESET LINK:', resetLink);
  console.log('========================================\n');

  const subject = 'Reset Your TutorLink Password';
  const html = buildResetHtml(fullName, resetLink);
  const text = `Hi ${fullName},\n\nReset your password here:\n${resetLink}\n\nThis link expires in 1 hour.\n\nBest regards,\nThe TutorLink Team`;

  const { data, error } = await resend.emails.send({ from: FROM, to: [email], subject, html, text });
  if (error) throw new Error(error.message);
  console.log('PASSWORD RESET email sent via Resend:', data.id);
  return { success: true, messageId: data.id };
};

const sendContactEmail = async (name, email, message) => {
  const subject = `New Contact Message from ${name}`;
  const html = buildContactHtml(name, email, message);
  const to = process.env.CONTACT_RECIPIENT || 'hasithgamlath327@gmail.com';
  const { data, error } = await resend.emails.send({ from: FROM, to: [to], replyTo: email, subject, html });
  if (error) throw new Error(error.message);
  console.log('CONTACT email sent via Resend:', data.id);
  return { success: true, messageId: data.id };
};

function buildContactHtml(name, email, message) {
  return '<!DOCTYPE html><html><head><style>'
    + 'body{font-family:Arial,sans-serif;line-height:1.6;color:#333}'
    + '.container{max-width:600px;margin:0 auto;padding:20px}'
    + '.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}'
    + '.content{background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px}'
    + '.label{font-weight:bold;color:#374151;width:100px;padding:8px 0;vertical-align:top}'
    + '.value{color:#6b7280;padding:8px 0}'
    + '.msg-box{background:white;border-left:4px solid #667eea;padding:16px;border-radius:0 8px 8px 0;white-space:pre-wrap;color:#6b7280}'
    + '.footer{text-align:center;margin-top:20px;color:#666;font-size:12px}'
    + '</style></head><body><div class="container">'
    + '<div class="header"><h1>New Contact Message</h1></div>'
    + '<div class="content">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<tr><td class="label">Name:</td><td class="value">' + name + '</td></tr>'
    + '<tr><td class="label">Email:</td><td class="value"><a href="mailto:' + email + '">' + email + '</a></td></tr>'
    + '</table>'
    + '<p style="font-weight:bold;color:#374151;margin:16px 0 8px">Message:</p>'
    + '<div class="msg-box">' + message + '</div>'
    + '</div>'
    + '<div class="footer"><p>&copy; 2026 TutorLink. All rights reserved.</p></div>'
    + '</div></body></html>';
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

module.exports = { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail, sendContactEmail };
