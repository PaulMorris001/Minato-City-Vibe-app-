import EmailBroadcast from "../models/emailBroadcast.model.js";
import User from "../models/user.model.js";
import { sendBroadcastEmail } from "../services/email.service.js";
import { broadcastsSentToday } from "../jobs/emailBroadcast.job.js";
import config from "../config/env.js";

/**
 * Admin broadcast email — the admin "Email Users" page. Creating a broadcast
 * only snapshots the recipients; jobs/emailBroadcast.job.js does the sending,
 * paced and capped per day (see that file for why).
 */

const SUBJECT_MAX = 150;
const BODY_MAX = 10000;
const CTA_LABEL_MAX = 40;

const AUDIENCES = {
  all: { label: "Everyone", match: {} },
  vendors: { label: "Vendors / business accounts", match: { isVendor: true } },
};

/**
 * Who a broadcast can reach: real accounts with an email that haven't opted
 * out. Guest-checkout accounts never signed up, so they're never marketed to.
 */
function recipientQuery(audienceKey) {
  return {
    ...AUDIENCES[audienceKey].match,
    email: { $nin: [null, ""] },
    isBanned: { $ne: true },
    isGuest: { $ne: true },
    "notificationPrefs.announcementEmails": { $ne: false },
  };
}

const trimmed = (v) => String(v ?? "").trim();

/** Validate the compose form. Returns the clean fields or `{ error }`. */
function parseMessage(body) {
  const subject = trimmed(body?.subject);
  const text = String(body?.body ?? "").replace(/\r\n/g, "\n").trim();
  const ctaLabel = trimmed(body?.ctaLabel);
  const ctaUrl = trimmed(body?.ctaUrl);
  if (!subject) return { error: "subject is required" };
  if (!text) return { error: "body is required" };
  if (subject.length > SUBJECT_MAX) return { error: `subject must be ${SUBJECT_MAX} characters or fewer` };
  if (text.length > BODY_MAX) return { error: `body must be ${BODY_MAX} characters or fewer` };
  if (!!ctaLabel !== !!ctaUrl) return { error: "Give the button both a label and a link, or neither" };
  if (ctaLabel.length > CTA_LABEL_MAX) return { error: `button label must be ${CTA_LABEL_MAX} characters or fewer` };
  if (ctaUrl && !/^https:\/\/\S+$/i.test(ctaUrl)) return { error: "button link must start with https://" };
  return { subject, body: text, ctaLabel, ctaUrl };
}

function parseAudience(body) {
  const key = body?.audience ?? "all";
  return AUDIENCES[key] ? { key } : { error: `Unknown audience "${key}"` };
}

/**
 * POST /admin/email-broadcasts/preview
 * How many people a broadcast to this audience would reach right now.
 */
export async function previewEmailBroadcast(req, res) {
  try {
    const audience = parseAudience(req.body);
    if (audience.error) return res.status(400).json({ message: audience.error });
    const recipientCount = await User.countDocuments(recipientQuery(audience.key));
    return res.json({ recipientCount });
  } catch (err) {
    console.error("previewEmailBroadcast:", err);
    return res.status(500).json({ message: "Failed to count recipients" });
  }
}

/**
 * POST /admin/email-broadcasts/test
 * Send the draft once to one address, so the admin sees the real thing before
 * it goes to everyone. Doesn't count toward the daily broadcast cap.
 */
export async function sendTestEmailBroadcast(req, res) {
  try {
    const msg = parseMessage(req.body);
    if (msg.error) return res.status(400).json({ message: msg.error });
    const to = trimmed(req.body?.to);
    if (!/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({ message: "Enter a valid email address to send the test to" });

    const result = await sendBroadcastEmail(to, {
      username: "there",
      subject: `[Test] ${msg.subject}`,
      body: msg.body,
      ctaLabel: msg.ctaLabel,
      ctaUrl: msg.ctaUrl,
      // A test has no recipient account to unsubscribe; the link just shows
      // "link not recognised".
      unsubscribeUrl: "https://api.ourcityvibe.com/unsubscribe/test-email?list=announcements",
    });
    if (!result.success) return res.status(502).json({ message: `The email couldn't be sent: ${result.error || "unknown error"}` });
    return res.json({ message: `Test sent to ${to}` });
  } catch (err) {
    console.error("sendTestEmailBroadcast:", err);
    return res.status(500).json({ message: "Failed to send test email" });
  }
}

/**
 * POST /admin/email-broadcasts
 * body: { subject, body, ctaLabel?, ctaUrl?, audience: "all"|"vendors" }
 * Queues the broadcast; the job sends it.
 */
export async function createEmailBroadcast(req, res) {
  try {
    const msg = parseMessage(req.body);
    if (msg.error) return res.status(400).json({ message: msg.error });
    const audience = parseAudience(req.body);
    if (audience.error) return res.status(400).json({ message: audience.error });

    const ids = await User.find(recipientQuery(audience.key)).select("_id").lean();
    if (ids.length === 0) return res.status(400).json({ message: "Nobody in that audience can be emailed" });

    const broadcast = await EmailBroadcast.create({
      ...msg,
      audienceSummary: AUDIENCES[audience.key].label,
      sentBy: req.user?.username || "admin",
      recipients: ids.map((u) => u._id),
      total: ids.length,
    });

    const { recipients, ...rest } = broadcast.toObject();
    return res.status(201).json({
      message: `Queued for ${ids.length} ${ids.length === 1 ? "person" : "people"}.`,
      broadcast: rest,
    });
  } catch (err) {
    console.error("createEmailBroadcast:", err);
    return res.status(500).json({ message: "Failed to queue the email" });
  }
}

/**
 * GET /admin/email-broadcasts
 * Recent broadcasts with progress, plus today's usage of the daily cap.
 */
export async function getEmailBroadcasts(req, res) {
  try {
    const [broadcasts, sentToday] = await Promise.all([
      EmailBroadcast.find().select("-recipients").sort({ createdAt: -1 }).limit(30).lean(),
      broadcastsSentToday(),
    ]);
    return res.json({ broadcasts, sentToday, dailyCap: config.emailBroadcast.dailyCap });
  } catch (err) {
    console.error("getEmailBroadcasts:", err);
    return res.status(500).json({ message: "Failed to load emails" });
  }
}

/**
 * POST /admin/email-broadcasts/:id/cancel
 * Stops a broadcast that hasn't finished. Emails already sent stay sent.
 */
export async function cancelEmailBroadcast(req, res) {
  try {
    const updated = await EmailBroadcast.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["queued", "sending", "paused_daily_cap"] } },
      { $set: { status: "cancelled", finishedAt: new Date() } },
      { new: true }
    ).select("-recipients");
    if (!updated) return res.status(400).json({ message: "That email has already finished or was cancelled" });
    return res.json({ message: "Cancelled", broadcast: updated });
  } catch (err) {
    console.error("cancelEmailBroadcast:", err);
    return res.status(500).json({ message: "Failed to cancel" });
  }
}
