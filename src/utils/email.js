const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = async () => {
  // For development, you can use ethereal.email (fake SMTP service)
  // For production, use real SMTP service (Gmail, SendGrid, AWS SES, etc.)
  
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  }
  
  // For development: Create a test account on ethereal.email
  // This creates a real test account that works!
  if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
    console.log('Creating ethereal test email account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log('Ethereal test account created:', testAccount.user);
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.log('Failed to create ethereal account, using console logging mode');
      return null; // Will use console logging instead
    }
  }
  
  // Custom SMTP configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification email
const sendVerificationEmail = async (email, code, fullName) => {
  try {
    const transporter = await createTransporter();
    
    // If transporter is null, use console logging mode (development fallback)
    if (!transporter) {
      console.log('\n========================================');
      console.log('📧 EMAIL VERIFICATION (DEV MODE)');
      console.log('========================================');
      console.log(`To: ${email}`);
      console.log(`Name: ${fullName}`);
      console.log(`Verification Code: ${code}`);
      console.log('========================================\n');
      return { success: true, messageId: 'dev-mode', devMode: true };
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"TutorLink" <noreply@tutorlink.com>',
      to: email,
      subject: 'Verify Your TutorLink Account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .code-box {
              background: white;
              border: 2px dashed #667eea;
              padding: 20px;
              text-align: center;
              border-radius: 8px;
              margin: 20px 0;
            }
            .code {
              font-size: 32px;
              font-weight: bold;
              letter-spacing: 5px;
              color: #667eea;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to TutorLink!</h1>
            </div>
            <div class="content">
              <p>Hi ${fullName},</p>
              <p>Thank you for signing up with TutorLink! To complete your registration, please verify your email address by entering the code below:</p>
              
              <div class="code-box">
                <div class="code">${code}</div>
              </div>
              
              <p><strong>This code will expire in 15 minutes.</strong></p>
              
              <p>If you didn't create an account with TutorLink, please ignore this email.</p>
              
              <p>Best regards,<br>The TutorLink Team</p>
            </div>
            <div class="footer">
              <p>© 2026 TutorLink. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${fullName},\n\nThank you for signing up with TutorLink! Your verification code is: ${code}\n\nThis code will expire in 15 minutes.\n\nIf you didn't create an account with TutorLink, please ignore this email.\n\nBest regards,\nThe TutorLink Team`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    
    // For development/testing with ethereal.email
    if (process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('Preview URL:', previewUrl);
      }
      // Also log the code to console for easy testing
      console.log('\n========================================');
      console.log('📧 VERIFICATION CODE (for testing):', code);
      console.log('========================================\n');
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    
    // In development, fall back to console logging
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n========================================');
      console.log('📧 EMAIL VERIFICATION (FALLBACK MODE)');
      console.log('========================================');
      console.log(`To: ${email}`);
      console.log(`Name: ${fullName}`);
      console.log(`Verification Code: ${code}`);
      console.log('========================================\n');
      return { success: true, messageId: 'fallback-mode', devMode: true };
    }
    
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail
};
