import nodemailer from "nodemailer";

/**
 * Email service for sending OTP and other emails
 */

// Create transporter
const createTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE?.toLowerCase().trim();

  console.log('📧 Email Service Configuration:', {
    service: emailService,
    user: process.env.EMAIL_USER,
    hasPassword: !!process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM
  });

  if (emailService === 'gmail') {
    console.log('✅ Using Gmail service for emails');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
      },
    });
  }

  // Default: Use SMTP settings from environment
  console.log('⚙️ Using SMTP configuration:', {
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587
  });

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Generate a 6-digit OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP email for password reset
 */
export const sendPasswordResetOTP = async (email, otp, username) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"NightVibe" <noreply@nightvibe.com>',
      to: email,
      subject: 'Password Reset - NightVibe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: #ffffff;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
              color: white;
              padding: 30px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              margin-bottom: 20px;
              color: #333;
            }
            .message {
              font-size: 16px;
              color: #666;
              margin-bottom: 30px;
            }
            .otp-container {
              background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
              border-radius: 8px;
              padding: 25px;
              text-align: center;
              margin: 30px 0;
            }
            .otp-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .otp-code {
              font-size: 36px;
              font-weight: 700;
              color: #a855f7;
              letter-spacing: 8px;
              margin: 10px 0;
              font-family: 'Courier New', monospace;
            }
            .expiry-notice {
              font-size: 14px;
              color: #ef4444;
              margin-top: 15px;
              font-weight: 600;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 25px 0;
              border-radius: 4px;
            }
            .warning p {
              margin: 0;
              font-size: 14px;
              color: #92400e;
            }
            .footer {
              background: #f9fafb;
              padding: 20px 30px;
              text-align: center;
              font-size: 13px;
              color: #6b7280;
              border-top: 1px solid #e5e7eb;
            }
            .footer a {
              color: #a855f7;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌙 NightVibe</h1>
            </div>

            <div class="content">
              <p class="greeting">Hello ${username || 'there'},</p>

              <p class="message">
                We received a request to reset your password. Use the verification code below to proceed with resetting your password:
              </p>

              <div class="otp-container">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${otp}</div>
                <div class="expiry-notice">This code will expire in 10 minutes</div>
              </div>

              <div class="warning">
                <p>
                  <strong>⚠️ Security Notice:</strong> If you didn't request a password reset,
                  please ignore this email or contact support if you have concerns about your account security.
                </p>
              </div>

              <p class="message">
                For your security, do not share this code with anyone. Our team will never ask you for this code.
              </p>
            </div>

            <div class="footer">
              <p>
                This is an automated message from NightVibe.<br>
                Need help? Contact us at <a href="mailto:support@nightvibe.com">support@nightvibe.com</a>
              </p>
              <p style="margin-top: 10px;">
                © ${new Date().getFullYear()} NightVibe. All rights reserved.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${username || 'there'},

We received a request to reset your password.

Your verification code is: ${otp}

This code will expire in 10 minutes.

If you didn't request a password reset, please ignore this email.

For your security, do not share this code with anyone.

Best regards,
The NightVibe Team
      `,
    };

    console.log(`📨 Sending password reset OTP to ${email}...`);
    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Password reset OTP sent successfully:', info.messageId);

    // For development with ethereal.email, log the preview URL
    if (process.env.NODE_ENV === 'development' && process.env.SMTP_HOST === 'smtp.ethereal.email') {
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

/**
 * Send password reset success notification
 */
export const sendPasswordResetSuccessEmail = async (email, username) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"NightVibe" <noreply@nightvibe.com>',
      to: email,
      subject: 'Password Reset Successful - NightVibe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .success-icon { font-size: 48px; text-align: center; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌙 NightVibe</h1>
            </div>
            <div class="content">
              <h2 style="text-align: center; color: #10b981;">Password Reset Successful!</h2>
              <p>Hello ${username || 'there'},</p>
              <p>Your password has been successfully reset. You can now log in to your NightVibe account with your new password.</p>
              <p>If you did not perform this action, please contact our support team immediately.</p>
              <p>Best regards,<br>The NightVibe Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${username || 'there'},

Your password has been successfully reset. You can now log in to your NightVibe account with your new password.

If you did not perform this action, please contact our support team immediately.

Best regards,
The NightVibe Team
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Password reset success email sent');
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending success email:', error);
    // Don't throw error, as password is already reset
    return { success: false };
  }
};
