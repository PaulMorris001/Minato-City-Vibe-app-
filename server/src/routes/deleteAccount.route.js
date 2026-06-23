import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/user.model.js';
import Follow from '../models/follow.model.js';
import Notification from '../models/notification.model.js';

const router = express.Router();

const html = (message, isError) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Delete Account – CityVibe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d1a;
      color: #e5e7eb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1f1f2e;
      border: 1px solid #374151;
      border-radius: 16px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    label { display: block; font-size: 13px; color: #9ca3af; margin-bottom: 6px; }
    input {
      width: 100%;
      background: #111827;
      border: 1px solid #374151;
      border-radius: 10px;
      color: #e5e7eb;
      font-size: 15px;
      padding: 12px 14px;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #a855f7; }
    button {
      width: 100%;
      background: #dc2626;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      padding: 14px;
      cursor: pointer;
      margin-top: 4px;
    }
    button:hover { background: #b91c1c; }
    .message {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 20px;
      background: ${isError ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.15)'};
      border: 1px solid ${isError ? '#dc2626' : '#22c55e'};
      color: ${isError ? '#fca5a5' : '#86efac'};
    }
    .warning {
      background: rgba(245,158,11,0.1);
      border: 1px solid #f59e0b;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #fcd34d;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Delete Account</h1>
    <p>Permanently delete your CityVibe account and all associated data. This action cannot be undone.</p>
    ${message ? `<div class="message">${message}</div>` : ''}
    <div class="warning">
      ⚠️ This will permanently delete your profile, event history, messages, and all data linked to your account.
    </div>
    <form method="POST" action="/delete-account">
      <label>Email address</label>
      <input type="email" name="email" placeholder="you@example.com" required />
      <label>Password</label>
      <input type="password" name="password" placeholder="Your password" required />
      <button type="submit">Delete My Account</button>
    </form>
  </div>
</body>
</html>`;

const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Deleted – CityVibe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d1a;
      color: #e5e7eb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1f1f2e;
      border: 1px solid #374151;
      border-radius: 16px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Account Deleted</h1>
    <p>Your CityVibe account and all associated data have been permanently deleted. We're sorry to see you go.</p>
  </div>
</body>
</html>`;

// Verify credentials and delete the account + associated data.
// Returns { ok: true } on success, or { ok: false, message } on a known
// validation failure. Throws on unexpected errors.
async function deleteAccountByCredentials(email, password) {
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() });

  if (!user) {
    return { ok: false, message: 'No account found with that email address.' };
  }

  if (user.authProvider === 'google') {
    // Google OAuth users have no password — verify by email ownership only
    // Delete without password check (they authenticated via Google)
  } else {
    if (!password) {
      return { ok: false, message: 'Password is required.' };
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return { ok: false, message: 'Incorrect password. Please try again.' };
    }
  }

  const userId = user._id;

  // Delete all associated data
  await Promise.all([
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] }),
    User.findByIdAndDelete(userId),
  ]);

  return { ok: true };
}

// JSON endpoint used by the standalone web app (www.ourcityvibe.com).
router.post('/api/account/delete', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const result = await deleteAccountByCredentials(email, password);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Something went wrong. Please try again later.' });
  }
});

// ─── Legacy server-rendered page ─────────────────────────────────────────────
// Kept for backward compatibility with links pointing at the API host. The
// canonical page now lives at https://www.ourcityvibe.com/delete-account.

router.get('/delete-account', (req, res) => {
  res.send(html('', false));
});

router.post('/delete-account', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await deleteAccountByCredentials(email, password);
    if (!result.ok) {
      return res.send(html(result.message, true));
    }
    res.send(successHtml);
  } catch (err) {
    console.error('Delete account error:', err);
    res.send(html('Something went wrong. Please try again later.', true));
  }
});

export default router;
