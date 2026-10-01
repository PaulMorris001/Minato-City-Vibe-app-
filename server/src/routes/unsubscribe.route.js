/**
 * One-click unsubscribe for event reminder emails and admin announcement
 * emails. `?list=announcements` picks the announcement list; no list means
 * reminders, which is what every reminder email already sent links to.
 *
 * Reached from the footer (and the List-Unsubscribe header) of those emails,
 * so it must work with no session — the token on the user document is the
 * only credential. Lives outside /api because it's opened in a browser.
 */
import express from 'express';
import User from '../models/user.model.js';

const router = express.Router();

const LISTS = {
  reminders: {
    pref: 'notificationPrefs.eventReminderEmails',
    name: 'event reminder emails',
    unaffected: 'Push notifications and your event passes are unaffected.',
  },
  announcements: {
    pref: 'notificationPrefs.announcementEmails',
    name: 'OurCityvibe announcement emails',
    unaffected: 'Your tickets, passes, event reminders and account emails are unaffected.',
  },
};

function page(title, message, actionHref, actionLabel) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} – OurCityvibe</title>
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
      max-width: 480px;
      width: 100%;
      background: #16111f;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 18px;
      padding: 40px 32px;
      text-align: center;
    }
    .brand {
      font-size: 15px;
      font-weight: 700;
      color: #c39cff;
      margin-bottom: 24px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; }
    p { color: #a79fb8; font-size: 15px; line-height: 1.6; }
    a.action {
      display: inline-block;
      margin-top: 24px;
      background: linear-gradient(100deg, #a855f7, #e0219f);
      color: #fff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      padding: 12px 22px;
      border-radius: 12px;
    }
    .foot { margin-top: 28px; font-size: 13px; color: #6f6885; }
    .foot a { color: #a855f7; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">🌙 OurCityvibe</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${actionHref ? `<a class="action" href="${actionHref}">${actionLabel}</a>` : ''}
    <p class="foot">Questions? <a href="mailto:support@ourcityvibe.com">support@ourcityvibe.com</a></p>
  </div>
</body>
</html>`;
}

async function handle(req, res) {
  const { token } = req.params;
  const resubscribe = req.query.resubscribe === '1';
  const listKey = req.query.list === 'announcements' ? 'announcements' : 'reminders';
  const list = LISTS[listKey];
  const listParam = listKey === 'reminders' ? '' : `list=${listKey}`;
  const selfHref = (extra) => {
    const q = [listParam, extra].filter(Boolean).join('&');
    return `/unsubscribe/${token}${q ? `?${q}` : ''}`;
  };

  try {
    const user = await User.findOneAndUpdate(
      { unsubscribeToken: token },
      { $set: { [list.pref]: resubscribe } },
      { new: true }
    ).select('email');

    res.setHeader('Content-Type', 'text/html');

    if (!user) {
      return res.status(404).send(
        page(
          'Link not recognised',
          'This unsubscribe link is no longer valid. You can manage emails in the app under Settings → Notifications.',
          null,
          null
        )
      );
    }

    if (resubscribe) {
      return res.send(
        page(
          "You're subscribed again",
          `${list.name[0].toUpperCase()}${list.name.slice(1)} will be sent to ${user.email}.`,
          selfHref(''),
          'Unsubscribe again'
        )
      );
    }

    return res.send(
      page(
        'Unsubscribed',
        `${user.email} will no longer receive ${list.name}. ${list.unaffected}`,
        selfHref('resubscribe=1'),
        'Undo — resubscribe me'
      )
    );
  } catch (error) {
    console.error('unsubscribe error:', error);
    res.setHeader('Content-Type', 'text/html');
    res
      .status(500)
      .send(page('Something went wrong', 'Please try again later, or email support@ourcityvibe.com.', null, null));
  }
}

router.get('/unsubscribe/:token', handle);
// RFC 8058 one-click: mail clients POST to the List-Unsubscribe URL.
router.post('/unsubscribe/:token', handle);

export default router;
