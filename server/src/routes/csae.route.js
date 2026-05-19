import express from 'express';

const router = express.Router();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Child Safety Policy – NightVibe</title>
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
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Child Safety Policy</h1>
    <p class="subtitle">Last updated April 2026</p>
    <p class="intro">NightVibe is committed to the safety and protection of children. This policy outlines our zero-tolerance stance against child sexual abuse and exploitation (CSAE) on our platform.</p>

    <div class="section">
      <h2>Zero Tolerance</h2>
      <p>NightVibe has a strict zero-tolerance policy against any content, behavior, or material that sexually exploits or abuses minors. This includes child sexual abuse material (CSAM) and any content that sexualizes, grooms, exploits, or endangers children in any way.</p>
    </div>

    <div class="section">
      <h2>Platform Age Requirement</h2>
      <p>NightVibe is intended for users aged 18 and older. Our platform is designed for adults to discover nightlife events and venues. Users who are found to be under 18 will have their accounts terminated immediately.</p>
    </div>

    <div class="section">
      <h2>Prohibited Content and Behavior</h2>
      <p>The following are strictly prohibited on NightVibe and will result in immediate account termination and reporting to relevant authorities:</p>
      <ul style="margin-top: 10px; padding-left: 20px; color: #9ca3af; font-size: 14px; line-height: 2;">
        <li>Any content that sexually depicts, exploits, or abuses minors</li>
        <li>Grooming behaviors targeting minors</li>
        <li>Solicitation of minors for sexual purposes</li>
        <li>Sharing or distributing child sexual abuse material (CSAM)</li>
      </ul>
    </div>

    <div class="section">
      <h2>Reporting</h2>
      <p>If you encounter any content or behavior that you believe violates this policy, please report it immediately to Support@nvibez.com. We review all reports promptly and will report confirmed CSAE content to the National Center for Missing and Exploited Children (NCMEC) and relevant law enforcement authorities.</p>
    </div>

    <div class="section">
      <h2>Enforcement</h2>
      <p>Violations of this policy will result in immediate account suspension or permanent termination, removal of all associated content, and reporting to law enforcement and the appropriate authorities. NightVibe cooperates fully with law enforcement investigations related to child safety.</p>
    </div>

    <div class="section">
      <h2>Contact</h2>
      <p>For questions or concerns related to child safety on our platform, contact us at Support@nvibez.com.</p>
    </div>
  </div>
</body>
</html>`;

router.get('/csae-policy', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
