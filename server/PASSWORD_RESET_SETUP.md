# Password Reset Setup Guide

This guide explains how to set up the email service for the password reset functionality in NightVibe.

## Overview

The password reset flow works as follows:

1. User enters their email address
2. Backend sends a 6-digit OTP to the email
3. User enters the OTP to verify
4. User creates a new password
5. Password is updated in the database

## Email Service Configuration

You need to configure an email service to send OTP codes. There are three options:

### Option 1: Gmail (Recommended for Development)

**Pros:** Free, easy to set up, reliable for development
**Cons:** Daily sending limits, requires app password

**Setup Steps:**

1. **Enable 2-Step Verification**

   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification

2. **Generate an App Password**

   - Visit [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and your device
   - Copy the generated 16-character password

3. **Update `.env` file**
   ```env
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # The 16-char app password
   EMAIL_FROM="NightVibe <noreply@nightvibe.com>"
   ```

**Important:** Use the App Password, NOT your regular Gmail password!

### Option 2: Professional Email Service (Recommended for Production)

For production, use a dedicated email service:

#### SendGrid (Recommended)

- **Free Tier:** 100 emails/day
- **Setup:** [SendGrid Signup](https://signup.sendgrid.com/)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM="NightVibe <noreply@yourdomain.com>"
```

#### AWS SES

- **Cost:** $0.10 per 1,000 emails
- **Setup:** [AWS SES Console](https://console.aws.amazon.com/ses/)

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-aws-smtp-username
SMTP_PASS=your-aws-smtp-password
EMAIL_FROM="NightVibe <noreply@yourdomain.com>"
```

#### Mailgun

- **Free Tier:** 5,000 emails/month
- **Setup:** [Mailgun Signup](https://signup.mailgun.com/)

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-smtp-password
EMAIL_FROM="NightVibe <noreply@yourdomain.com>"
```

### Option 3: Ethereal Email (For Testing Only)

**Pros:** No configuration needed, captures all emails
**Cons:** Emails are not actually sent, only for testing

1. Visit [Ethereal Email](https://ethereal.email/)
2. Click "Create Ethereal Account"
3. Copy the credentials

```env
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-username
SMTP_PASS=your-ethereal-password
EMAIL_FROM="NightVibe <noreply@nightvibe.com>"
```

When using Ethereal, check the console output for the preview URL to see the emails.

## Testing the Setup

### 1. Start the Server

```bash
cd server
npm run dev
```

### 2. Test Forgot Password Endpoint

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

Expected response:

```json
{
  "success": true,
  "message": "Verification code sent to your email"
}
```

### 3. Check the Console

The OTP will be printed in the console for development:

```
Password reset OTP sent to user@example.com: 123456
```

### 4. Test OTP Verification

```bash
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","otp":"123456"}'
```

Expected response:

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "resetToken": "abc123def456..."
}
```

### 5. Test Password Reset

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email":"user@example.com",
    "resetToken":"abc123def456...",
    "newPassword":"newPassword123"
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

## API Endpoints

### POST `/auth/forgot-password`

Sends OTP to user's email.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Verification code sent to your email"
}
```

**Error Responses:**

- `404`: Email not found
- `400`: Google OAuth account (can't reset password)

### POST `/auth/verify-otp`

Verifies the OTP code.

**Request:**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "resetToken": "abc123def456..."
}
```

**Error Responses:**

- `400`: Invalid OTP
- `410`: OTP expired (valid for 10 minutes)

### POST `/auth/reset-password`

Resets the user's password.

**Request:**

```json
{
  "email": "user@example.com",
  "resetToken": "abc123def456...",
  "newPassword": "newSecurePassword"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in with your new password."
}
```

**Error Responses:**

- `400`: Invalid or expired token (valid for 30 minutes)
- `400`: Password too short (min 6 characters)

## Security Features

- **OTP Expiry:** 10 minutes
- **Reset Token Expiry:** 30 minutes after OTP verification
- **One-Time Use:** Tokens are cleared after use
- **Google OAuth Protection:** Users who signed up with Google cannot reset password
- **Secure Password Hashing:** bcrypt with 10 salt rounds
- **Email Verification:** Only registered emails can request reset

## Troubleshooting

### Gmail "Less secure app" Error

- Make sure you're using an App Password, not your regular password
- Ensure 2-Step Verification is enabled

### Emails Not Sending

1. Check console for errors
2. Verify environment variables are set correctly
3. Test with Ethereal Email to isolate email service issues

### OTP Not Received

1. Check spam folder
2. Verify email service configuration
3. Check server logs for sending errors
4. Try with Ethereal Email to see if emails are being generated

### "Invalid email" Error

- The email must be registered in the database
- Email comparison is case-insensitive

## Production Considerations

1. **Use a professional email service** (SendGrid, AWS SES, Mailgun)
2. **Set up a custom domain** for better deliverability
3. **Configure SPF, DKIM, and DMARC** records
4. **Monitor email delivery** rates
5. **Implement rate limiting** to prevent abuse
6. **Remove console.log** statements that print OTPs
7. **Set up email templates** with your branding

## Support

If you encounter any issues, check:

- Server logs for detailed error messages
- Environment variables are correctly set
- Email service credentials are valid
- Network connectivity to SMTP server
