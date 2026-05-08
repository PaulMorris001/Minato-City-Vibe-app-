import express from 'express';

const router = express.Router();

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.nightvibe.mobile';
const APP_STORE = 'https://apps.apple.com/app/nightvibe/id0000000000'; // Replace with real App Store ID

// Android App Links verification
router.get('/.well-known/assetlinks.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.nightvibe.mobile',
        sha256_cert_fingerprints: [
          'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
        ],
      },
    },
  ]);
});

// iOS Universal Links verification
// Replace APPLE_TEAM_ID with your 10-character Apple Developer Team ID (found at developer.apple.com)
router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: '5C28S2GD6A.com.nightvibe.minato',
          paths: ['/event/*', '/guide/*'],
        },
      ],
    },
  });
});

const landingPage = ({ title, subtitle, description, link, image }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} – NightVibe</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  ${image ? `<meta property="og:image" content="${image}" />` : ''}
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
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      background: linear-gradient(135deg, #a855f7, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 24px;
    }
    .subtitle { color: #9ca3af; font-size: 13px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .desc { color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 32px; }
    .open-btn {
      display: block;
      background: linear-gradient(135deg, #a855f7, #7c3aed);
      color: #fff;
      text-decoration: none;
      border-radius: 12px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .store-row { display: flex; gap: 10px; margin-top: 4px; }
    .store-btn {
      flex: 1;
      display: block;
      background: #111827;
      border: 1px solid #374151;
      color: #e5e7eb;
      text-decoration: none;
      border-radius: 10px;
      padding: 12px 8px;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">NightVibe</div>
    <p class="subtitle">${subtitle}</p>
    <h1>${title}</h1>
    <p class="desc">${description}</p>
    <a class="open-btn" href="${link}">Open in NightVibe</a>
    <div class="store-row">
      <a class="store-btn" href="${APP_STORE}">App Store</a>
      <a class="store-btn" href="${PLAY_STORE}">Google Play</a>
    </div>
  </div>
  <script>
    // Try to open the app immediately; if it fails the user sees the buttons above
    window.location.href = "${link}";
  </script>
</body>
</html>`;

// Event landing page
router.get('/event/:token', async (req, res) => {
  const { token } = req.params;
  const deepLink = `mobile://share/${token}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(landingPage({
    title: 'Event Invite',
    subtitle: 'You\'ve been invited',
    description: 'Open NightVibe to view this event and RSVP.',
    link: deepLink,
    image: null,
  }));
});

// Guide landing page
router.get('/guide/:id', async (req, res) => {
  const { id } = req.params;
  const deepLink = `mobile://guide/${id}`;
  res.setHeader('Content-Type', 'text/html');
  res.send(landingPage({
    title: 'City Guide',
    subtitle: 'NightVibe Guide',
    description: 'Open NightVibe to view this city guide.',
    link: deepLink,
    image: null,
  }));
});

export default router;
