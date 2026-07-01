import nodemailer from "nodemailer";
import { config } from "../config/env.js";

/**
 * Email service for sending OTP and other emails
 */

// Timeouts so a slow / unreachable SMTP server can't hang an HTTP request for
// minutes. ~25s ceiling end-to-end keeps us well under the mobile client's
// retry budget while still leaving room for handshake on flaky networks.
const SMTP_TIMEOUTS = {
  connectionTimeout: 10000, // ms to establish TCP
  greetingTimeout: 10000, // ms to wait for the server greeting
  socketTimeout: 15000, // ms between socket reads once connected
};

// Single source of truth for credentials. SMTP_USER / SMTP_PASS are kept as
// fallbacks so older deployments don't break, but the primary names are
// EMAIL_USER / EMAIL_PASSWORD across every provider branch below.
const getCreds = () => ({
  user: process.env.EMAIL_USER || process.env.SMTP_USER,
  pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS,
});

// Create transporter
const createTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE?.toLowerCase().trim();
  const auth = getCreds();

  console.log('📧 Email Service Configuration:', {
    service: emailService,
    user: auth.user,
    hasPassword: !!auth.pass,
    from: process.env.EMAIL_FROM,
  });

  if (emailService === 'gmail') {
    console.log('✅ Using Gmail service for emails');
    return nodemailer.createTransport({
      service: 'gmail',
      auth, // Use App Password for Gmail
      ...SMTP_TIMEOUTS,
    });
  }

  if (emailService === 'zoho') {
    // Zoho Mail SMTP (global region — use smtp.zoho.eu / smtp.zoho.in if your
    // mailbox is hosted in the EU or India region). Requires an Application-
    // Specific Password generated from Zoho's security settings — your normal
    // mailbox password will NOT work over SMTP.
    const host = process.env.SMTP_HOST || 'smtp.zoho.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = port === 465; // 465 = SSL, 587 = STARTTLS
    console.log(`✅ Using Zoho SMTP (${host}:${port}, secure=${secure})`);
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth,
      ...SMTP_TIMEOUTS,
    });
  }

  // Default: Generic SMTP from environment. Reads the same EMAIL_USER /
  // EMAIL_PASSWORD as the named-service branches above so a single set of
  // creds works no matter how the host is configured.
  const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = port === 465; // 465 = SMTPS, 587 = STARTTLS (secure=false + upgrade)
  console.log(`⚙️ Using SMTP configuration: ${host}:${port} (secure=${secure})`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    ...SMTP_TIMEOUTS,
  });
};

/**
 * Generate a 6-digit OTP.
 *
 * In dev (config.dev.fixedOtp) this always returns "000000" so you can sign up
 * with any email and verify without waiting for a real code. Production always
 * gets a random code.
 */
export const generateOTP = () => {
  if (config.dev.fixedOtp) return "000000";
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP email for password reset
 */
export const sendPasswordResetOTP = async (email, otp, username) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CityVibe" <Support@nvibez.com>',
      to: email,
      subject: 'Password Reset - CityVibe',
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
              <h1>🌙 CityVibe</h1>
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
                This is an automated message from CityVibe.<br>
                Need help? Contact us at <a href="mailto:Support@nvibez.com">Support@nvibez.com</a>
              </p>
              <p style="margin-top: 10px;">
                © ${new Date().getFullYear()} CityVibe. All rights reserved.
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
The CityVibe Team
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
 * Send a 6-digit OTP for verifying an email address at signup.
 * Same look as the password-reset OTP for brand consistency.
 */
export const sendSignupVerificationOTP = async (email, otp, username) => {
  try {
    const transporter = createTransporter();
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CityVibe" <Support@nvibez.com>',
      to: email,
      subject: "Verify your email - CityVibe",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
            .content { padding: 40px 30px; }
            .otp-container { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 8px; padding: 25px; text-align: center; margin: 30px 0; }
            .otp-label { font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
            .otp-code { font-size: 36px; font-weight: 800; color: #a855f7; letter-spacing: 8px; }
            .hint { font-size: 13px; color: #6b7280; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🌙 CityVibe</h1></div>
            <div class="content">
              <p>Hi ${username || "there"},</p>
              <p>Welcome to CityVibe! Confirm your email to finish setting up your account.</p>
              <div class="otp-container">
                <div class="otp-label">Your verification code</div>
                <div class="otp-code">${otp}</div>
              </div>
              <p class="hint">This code expires in 10 minutes. If you didn't sign up, you can safely ignore this email.</p>
              <p>— The CityVibe Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${username || "there"},\n\nWelcome to CityVibe. Your verification code is ${otp}. It expires in 10 minutes.\n\n— The CityVibe Team`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending signup OTP email:", error);
    throw new Error("Failed to send verification email");
  }
};

/**
 * Send an event pass with an embedded CityVibe-styled QR code. Issued when a
 * user RSVPs to a free event or buys a ticket. The QR is attached inline (cid)
 * so it renders in the email body; the organizer scans it at the door to mark
 * the holder as attended.
 *
 * @param {string} email
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.eventTitle
 * @param {string} opts.eventDateText  human-readable date/time
 * @param {string} opts.eventLocation
 * @param {Buffer} opts.qrBuffer       PNG of the pass QR
 * @param {"rsvp"|"ticket"} opts.type
 */
export const sendEventPassEmail = async (
  email,
  { username, eventTitle, eventDateText, eventLocation, qrBuffer, type }
) => {
  try {
    const transporter = createTransporter();
    const passLabel = type === "ticket" ? "Your Ticket" : "Your RSVP Pass";
    const subject = `${passLabel} — ${eventTitle}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CityVibe" <Support@nvibez.com>',
      to: email,
      subject,
      attachments: [
        {
          filename: "cityvibe-pass.png",
          content: qrBuffer,
          cid: "passqr@cityvibe",
        },
      ],
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 800; }
            .content { padding: 36px 30px; text-align: center; }
            .event-title { font-size: 22px; font-weight: 700; color: #1f2937; margin: 0 0 6px; }
            .event-meta { font-size: 14px; color: #6b7280; margin: 2px 0; }
            .qr-wrap { background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border: 1px solid #e9d5ff; border-radius: 16px; padding: 24px; margin: 28px auto; display: inline-block; }
            .qr-wrap img { display: block; width: 240px; height: 240px; }
            .badge { display: inline-block; background: #7c3aed; color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 6px 14px; border-radius: 999px; margin-bottom: 18px; }
            .hint { font-size: 13px; color: #6b7280; margin-top: 18px; }
            .footer { background: #f9fafb; padding: 20px 30px; text-align: center; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
            .footer a { color: #a855f7; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🌙 CityVibe</h1></div>
            <div class="content">
              <div class="badge">${passLabel}</div>
              <p class="event-title">${eventTitle}</p>
              ${eventDateText ? `<p class="event-meta">📅 ${eventDateText}</p>` : ""}
              ${eventLocation ? `<p class="event-meta">📍 ${eventLocation}</p>` : ""}
              <div class="qr-wrap">
                <img src="cid:passqr@cityvibe" alt="Your CityVibe pass QR code" />
              </div>
              <p class="hint">
                Show this QR code at the entrance. The organizer will scan it to
                check you in. Keep it private — anyone with this code can use your pass.
              </p>
            </div>
            <div class="footer">
              <p>See you there, ${username || "friend"}! 🎉</p>
              <p>Need help? <a href="mailto:Support@nvibez.com">Support@nvibez.com</a></p>
              <p style="margin-top: 8px;">© ${new Date().getFullYear()} CityVibe. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `${passLabel} for ${eventTitle}\n${eventDateText || ""}${
        eventLocation ? `\n${eventLocation}` : ""
      }\n\nYour pass QR code is attached. Show it at the entrance to be checked in. Keep it private.\n\n— The CityVibe Team`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`🎟️ Event pass email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Error sending event pass email:", error);
    throw new Error("Failed to send event pass email");
  }
};

/**
 * Send password reset success notification
 */
export const sendPasswordResetSuccessEmail = async (email, username) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CityVibe" <Support@nvibez.com>',
      to: email,
      subject: 'Password Reset Successful - CityVibe',
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
              <h1>🌙 CityVibe</h1>
            </div>
            <div class="content">
              <h2 style="text-align: center; color: #10b981;">Password Reset Successful!</h2>
              <p>Hello ${username || 'there'},</p>
              <p>Your password has been successfully reset. You can now log in to your CityVibe account with your new password.</p>
              <p>If you did not perform this action, please contact our support team immediately.</p>
              <p>Best regards,<br>The CityVibe Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hello ${username || 'there'},

Your password has been successfully reset. You can now log in to your CityVibe account with your new password.

If you did not perform this action, please contact our support team immediately.

Best regards,
The CityVibe Team
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
