import express from 'express';

const router = express.Router();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy – OurCityvibe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d1a;
      color: #e5e7eb;
      padding: 24px;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #9ca3af;
      font-size: 14px;
      margin-bottom: 12px;
    }
    .intro {
      color: #9ca3af;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .section {
      background: #1f1f2e;
      border: 1px solid #374151;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 12px;
    }
    .section h2 {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 10px;
    }
    .section p {
      font-size: 14px;
      color: #9ca3af;
      line-height: 1.6;
      white-space: pre-line;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <p class="subtitle">Last updated March 2026</p>
    <p class="intro">At OurCityvibe, we take your privacy seriously. This policy explains what data we collect, how we use it, and your rights.</p>

    <div class="section">
      <h2>Information We Collect</h2>
      <p>We collect information you provide when creating an account, such as your name, email address, and profile photo. We also collect data about events you create, attend, or interact with on the platform.</p>
    </div>

    <div class="section">
      <h2>How We Use Your Information</h2>
      <p>Your information is used to provide and improve OurCityvibe's services, personalise your experience, send you relevant notifications about events and ticket sales, and process payments securely through Stripe.</p>
    </div>

    <div class="section">
      <h2>Sharing Your Information</h2>
      <p>We do not sell your personal data. Event details you make public are visible to other users. Vendor profiles and service listings are visible to all users browsing the platform.</p>
    </div>

    <div class="section">
      <h2>Payments &amp; Financial Data</h2>
      <p>All payment processing is handled by Stripe. OurCityvibe does not store your card details. For payout setup, Stripe collects and verifies your banking information in accordance with their privacy policy.</p>
    </div>

    <div class="section">
      <h2>Push Notifications</h2>
      <p>With your permission, we send push notifications for ticket sales, event updates, and invites. You can manage notification preferences in your device settings at any time.</p>
    </div>

    <div class="section">
      <h2>Data Retention</h2>
      <p>We retain your account data for as long as your account is active. You may request deletion of your account and associated data at https://www.ourcityvibe.com/delete-account or by contacting Support@nvibez.com.</p>
    </div>

    <div class="section">
      <h2>Your Rights</h2>
      <p>You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at Support@nvibez.com.</p>
    </div>

    <div class="section">
      <h2>Contact Us</h2>
      <p>For any privacy-related questions or concerns, reach out to:\n\nSupport@nvibez.com</p>
    </div>
  </div>
</body>
</html>`;

router.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
