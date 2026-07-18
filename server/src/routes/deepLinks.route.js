import express from 'express';
import mongoose from 'mongoose';
import Event from '../models/event.model.js';
import Guide from '../models/guide.model.js';
import User from '../models/user.model.js';

const router = express.Router();

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.ourcityvibe.app';
// Flip to true (and set APP_STORE / APP_STORE_ID) once the new App Store
// listing is live. Until then we hide the App Store button + smart-app-banner
// so users don't get sent to a "no longer available" page from the takedown.
const HAS_APP_STORE_LISTING = false;
const APP_STORE = '';
const APP_STORE_ID = '';
const SITE_BASE = 'https://api.ourcityvibe.com';
const BRAND_TAGLINE = 'OurCityvibe — every night out, in one app.';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Cloudinary URLs (e.g. https://res.cloudinary.com/xyz/image/upload/v123/abc.jpg)
// can be rewritten with transformation params to produce a tightly-cropped
// 1200x630 preview — the canonical aspect for WhatsApp, iMessage, Facebook,
// LinkedIn and X large-image cards.
function toSocialPreviewImage(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (url.includes('/upload/w_1200,')) return url;
  // Tuned for WhatsApp: 1200×630 (standard social card aspect), eco-quality
  // JPG to keep the file under ~300 KB which WhatsApp prefers, and no
  // `g_auto` so we don't depend on the Content-Aware Cropping add-on which
  // can 404 on accounts that don't have it enabled.
  return url.replace('/upload/', '/upload/w_1200,h_630,c_fill,q_auto:eco,f_jpg/');
}

// Display symbols for the currencies we support — mirrors the mobile app's
// constants/payments.ts so a naira event never previews with a "$". Unknown
// codes fall back to "CODE amount" (e.g. "GHS 50").
const CURRENCY_SYMBOLS = {
  USD: '$',
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh ',
  ZAR: 'R',
  UGX: 'USh ',
  TZS: 'TSh ',
  RWF: 'FRw ',
  ZMW: 'ZK ',
};

function formatPrice(amount, currency) {
  const code = String(currency || 'USD').toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] || `${code} `;
  const n = Number(amount);
  return `${sym}${Number.isFinite(n) ? n.toLocaleString('en-US') : amount}`;
}

function formatEventWhen(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

function truncate(value, max = 180) {
  if (!value) return '';
  const s = String(value).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

// ─── App-link verification files ─────────────────────────────────────────────

// Android App Links verification
router.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([
    {
      relation: [
        'delegate_permission/common.handle_all_urls', // App Links — open https links in-app
        'delegate_permission/common.get_login_creds', // credential sharing (Play Console prompt)
      ],
      target: {
        namespace: 'android_app',
        package_name: 'com.ourcityvibe.app',
        sha256_cert_fingerprints: [
          // EAS-generated upload key (signs APKs/AABs before Play). Required
          // for internal-distribution APKs and pre-Play-Signing installs.
          'D5:F1:BD:BE:91:6D:53:14:0C:74:52:97:E3:A0:8E:2C:FE:36:8A:10:B4:F0:DD:41:09:55:5E:FD:18:B9:E0:79',
          // TODO: add the Play app-signing key SHA-256 here once the app is
          // uploaded to Play Console under com.ourcityvibe.app — Play will
          // show it under Setup → App integrity → App signing. Without this
          // line, Play-installed users won't get App Link verification.
        ],
      },
    },
  ]);
});

// iOS Universal Links verification
router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          // TODO: replace REPLACE_WITH_NEW_TEAM_ID with the new Apple Developer
          // account's Team ID (Membership page). Format: <TeamID>.<bundleId>.
          appID: '43ZU3Q3SD7.com.ourcityvibe.app',
          paths: ['/event/*', '/guide/*', '/user/*'],
        },
      ],
    },
  });
});

// ─── Landing page template ──────────────────────────────────────────────────
//
// The landing page exists for two audiences:
//   1. Link-preview scrapers (WhatsApp, iMessage, Facebook, X, Slack, etc.) —
//      they fetch raw HTML, never run JS. They read the OG / Twitter meta tags
//      in <head> and render the preview card from those.
//   2. Humans who land here in a browser because Universal Links / App Links
//      didn't fire (long-pressed in WhatsApp, opened on desktop, app not
//      installed). They see a polished card with the event details and a
//      one-tap deep link into the app.
//
// JS-based auto-redirect to the `mobile://` scheme runs after a tiny delay so
// link previewers (which often follow redirects to confirm the canonical URL)
// don't end up at an `app store` page when they expected an HTML page.
function buildLandingPage({
  title,
  description,
  imageUrl,
  canonicalUrl,
  appDeepLink,
  body,
}) {
  const t = escapeHtml(title || 'OurCityvibe');
  const d = escapeHtml(description || BRAND_TAGLINE);
  const ogImage = escapeHtml(imageUrl || `${SITE_BASE}/og-default.png`);
  const url = escapeHtml(canonicalUrl);
  const deepLinkEsc = escapeHtml(appDeepLink);

  // The body block is already escaped/composed by the caller.
  const bodyHtml = body || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t} – OurCityvibe</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${url}" />

  <!-- Open Graph (WhatsApp, iMessage, Facebook, LinkedIn, Slack, Discord) -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="OurCityvibe" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${t}" />

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${ogImage}" />

  ${HAS_APP_STORE_LISTING ? `<!-- Smart App Banner (iOS Safari) -->
  <meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${deepLinkEsc}" />` : ''}

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: radial-gradient(circle at top, #1a1030 0%, #0b0613 60%);
      color: #f4eeff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(26,16,48,0.85);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 28px 26px 26px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 24px 60px -20px rgba(124,58,237,0.5);
      overflow: hidden;
    }
    .logo {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #a855f7, #ec4899);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 18px;
    }
    .cover {
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 18px;
      background: linear-gradient(135deg, #a855f7, #7c3aed, #ec4899);
      background-size: cover;
      background-position: center;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .kicker {
      font-size: 11px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #c084fc;
      font-weight: 700;
      margin-bottom: 6px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    .meta {
      font-size: 14px;
      color: rgba(244,238,255,0.7);
      line-height: 1.5;
      margin-bottom: 22px;
    }
    .meta-row { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
    .meta-row svg { flex-shrink: 0; opacity: 0.8; }
    .open-btn {
      display: block;
      background: linear-gradient(135deg, #a855f7, #7c3aed, #ec4899);
      color: #fff;
      text-decoration: none;
      border-radius: 14px;
      padding: 15px;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 12px;
      box-shadow: 0 10px 24px rgba(168,85,247,0.4);
    }
    .store-row { display: flex; gap: 10px; }
    .store-btn {
      flex: 1;
      display: block;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #f4eeff;
      text-decoration: none;
      border-radius: 12px;
      padding: 12px 8px;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
    }
    .store-btn:hover { background: rgba(255,255,255,0.10); }
    .footer-note {
      font-size: 11px;
      color: rgba(244,238,255,0.42);
      text-align: center;
      margin-top: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">OurCityvibe</div>
    ${bodyHtml}
    <a class="open-btn" href="${deepLinkEsc}">Open in the app</a>
    <div class="store-row">
      ${HAS_APP_STORE_LISTING ? `<a class="store-btn" href="${APP_STORE}">App Store</a>` : ''}
      <a class="store-btn" href="${PLAY_STORE}">Google Play</a>
    </div>
    <div class="footer-note">Tap the button above to open in OurCityvibe.</div>
  </div>
  <!--
    Intentionally no JS auto-redirect. iMessage / Apple Link Presentation
    executes JS in its preview-generation WebView; a window.location call to
    a custom-scheme URL (mobile://) fails inside that sandbox and tanks the
    preview card entirely. Universal Links / App Links handle the auto-open
    path on real devices; the button covers everyone else.
  -->
</body>
</html>`;
}

// ─── Event landing page ──────────────────────────────────────────────────────

router.get('/event/:token', async (req, res) => {
  const { token } = req.params;
  const appDeepLink = `mobile://share/${token}`;
  const canonicalUrl = `${SITE_BASE}/event/${token}`;

  // Look the event up so link previews can render with title, date, venue,
  // and the event's cover image. Fall back to a generic invite card on miss.
  let event = null;
  try {
    event = await Event.findOne({ shareToken: token })
      .populate('createdBy', 'username')
      .lean();
    if (!event && mongoose.isValidObjectId(token)) {
      event = await Event.findOne({ _id: token })
        .populate('createdBy', 'username')
        .lean();
    }
  } catch (err) {
    console.error('Event lookup for share landing failed:', err);
  }

  // Filter out events that shouldn't be publicly previewed — soft-deleted ones,
  // and pending/rejected paid events. Private events can still be previewed
  // because the share link itself is the access-grant mechanism.
  const isPreviewable =
    event &&
    event.isActive !== false &&
    (!event.isPaid || event.approvalStatus === 'approved');

  if (!isPreviewable) {
    const body = `
      <div class="kicker">Event Invite</div>
      <h1>You've been invited.</h1>
      <p class="meta">Open OurCityvibe to view this event and RSVP.</p>
    `;
    return res
      .setHeader('Content-Type', 'text/html')
      .send(buildLandingPage({
        title: 'Event Invite — OurCityvibe',
        description: BRAND_TAGLINE,
        imageUrl: null,
        canonicalUrl,
        appDeepLink,
        body,
      }));
  }

  const when = formatEventWhen(event.date);
  const venue = event.location || '';
  const host = event.createdBy?.username ? `Hosted by ${event.createdBy.username}` : '';
  const priceLine = event.isPaid && event.ticketPrice
    ? `From ${formatPrice(event.ticketPrice, event.currency)}`
    : (!event.isPaid && event.isPublic ? 'Free entry' : '');

  // Description used for previewers — kept tight so WhatsApp / iMessage show
  // the most useful info first within their truncation window.
  const descBits = [when, venue, host, priceLine].filter(Boolean);
  const description = truncate(
    descBits.join(' · ') ||
      event.description ||
      'Tap to view this event and RSVP on OurCityvibe.',
    180
  );

  const previewImage = toSocialPreviewImage(event.image);

  const body = `
    ${event.image
      ? `<div class="cover" style="background-image: url('${escapeHtml(event.image)}');"></div>`
      : `<div class="cover"></div>`}
    <div class="kicker">${event.isPaid ? 'Get tickets' : 'You\'re invited'}</div>
    <h1>${escapeHtml(event.title || 'OurCityvibe Event')}</h1>
    <div class="meta">
      ${when ? `<div class="meta-row">📅 ${escapeHtml(when)}</div>` : ''}
      ${venue ? `<div class="meta-row">📍 ${escapeHtml(venue)}</div>` : ''}
      ${host ? `<div class="meta-row">🎤 ${escapeHtml(host)}</div>` : ''}
      ${priceLine ? `<div class="meta-row">🎟️ ${escapeHtml(priceLine)}</div>` : ''}
    </div>
  `;

  res
    .setHeader('Content-Type', 'text/html')
    .setHeader('Cache-Control', 'public, max-age=300')
    .send(buildLandingPage({
      title: event.title || 'OurCityvibe Event',
      description,
      imageUrl: previewImage,
      canonicalUrl,
      appDeepLink,
      body,
    }));
});

// ─── Guide landing page ──────────────────────────────────────────────────────

router.get('/guide/:id', async (req, res) => {
  const { id } = req.params;
  const appDeepLink = `mobile://guide/${id}`;
  const canonicalUrl = `${SITE_BASE}/guide/${id}`;

  let guide = null;
  try {
    if (mongoose.isValidObjectId(id)) {
      guide = await Guide.findById(id).lean();
    }
  } catch (err) {
    console.error('Guide lookup for share landing failed:', err);
  }

  if (!guide || guide.isActive === false || guide.isDraft) {
    return res
      .setHeader('Content-Type', 'text/html')
      .send(buildLandingPage({
        title: 'City Guide — OurCityvibe',
        description: BRAND_TAGLINE,
        imageUrl: null,
        canonicalUrl,
        appDeepLink,
        body: `
          <div class="kicker">City Guide</div>
          <h1>Discover the city.</h1>
          <p class="meta">Open OurCityvibe to read this guide.</p>
        `,
      }));
  }

  const cityLine = guide.city
    ? `${guide.city}${guide.cityState ? ', ' + guide.cityState : ''}`
    : '';
  const author = guide.authorName ? `By ${guide.authorName}` : '';
  const priceLine = guide.price > 0 ? formatPrice(guide.price, guide.currency) : 'Free';

  const descBits = [cityLine, guide.topic, author, priceLine].filter(Boolean);
  const description = truncate(
    descBits.join(' · ') || guide.description || 'A city guide on OurCityvibe.',
    180
  );

  const body = `
    <div class="cover"></div>
    <div class="kicker">City Guide${guide.topic ? ` · ${escapeHtml(guide.topic)}` : ''}</div>
    <h1>${escapeHtml(guide.title || 'OurCityvibe Guide')}</h1>
    <div class="meta">
      ${cityLine ? `<div class="meta-row">📍 ${escapeHtml(cityLine)}</div>` : ''}
      ${author ? `<div class="meta-row">✍️ ${escapeHtml(author)}</div>` : ''}
      <div class="meta-row">🎟️ ${escapeHtml(priceLine)}</div>
    </div>
  `;

  res
    .setHeader('Content-Type', 'text/html')
    .setHeader('Cache-Control', 'public, max-age=300')
    .send(buildLandingPage({
      title: guide.title || 'OurCityvibe Guide',
      description,
      imageUrl: null,
      canonicalUrl,
      appDeepLink,
      body,
    }));
});

// ─── Profile landing page ─────────────────────────────────────────────────────

router.get('/user/:id', async (req, res) => {
  const { id } = req.params;
  const appDeepLink = `mobile://user/${id}`;
  const canonicalUrl = `${SITE_BASE}/user/${id}`;

  let user = null;
  try {
    if (mongoose.isValidObjectId(id)) {
      user = await User.findById(id)
        .select('username profilePicture bio isVendor businessName verified')
        .lean();
    }
  } catch (err) {
    console.error('User lookup for share landing failed:', err);
  }

  if (!user) {
    return res
      .setHeader('Content-Type', 'text/html')
      .send(buildLandingPage({
        title: 'OurCityvibe Profile',
        description: BRAND_TAGLINE,
        imageUrl: null,
        canonicalUrl,
        appDeepLink,
        body: `
          <div class="kicker">Profile</div>
          <h1>Join them on OurCityvibe.</h1>
          <p class="meta">Open OurCityvibe to view this profile.</p>
        `,
      }));
  }

  const displayName = user.isVendor && user.businessName ? user.businessName : user.username;
  const kicker = user.isVendor ? 'Vendor' : 'Profile';
  const description = truncate(
    user.bio || `${displayName} is on OurCityvibe. Follow them for events and city guides.`,
    180
  );
  const previewImage = toSocialPreviewImage(user.profilePicture);

  const body = `
    ${user.profilePicture
      ? `<div class="cover" style="background-image: url('${escapeHtml(user.profilePicture)}');"></div>`
      : `<div class="cover"></div>`}
    <div class="kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(displayName || 'OurCityvibe Member')}</h1>
    <div class="meta">
      ${user.bio ? `<div class="meta-row">${escapeHtml(truncate(user.bio, 140))}</div>` : ''}
    </div>
  `;

  res
    .setHeader('Content-Type', 'text/html')
    .setHeader('Cache-Control', 'public, max-age=300')
    .send(buildLandingPage({
      title: `${displayName || 'OurCityvibe Member'} — OurCityvibe`,
      description,
      imageUrl: previewImage,
      canonicalUrl,
      appDeepLink,
      body,
    }));
});

export default router;
