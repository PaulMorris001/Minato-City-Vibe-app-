import StaticHtml from "./StaticHtml";

const html = `
<style>
  :root {
    --bg: #0b0613;
    --surface: rgba(255, 255, 255, 0.04);
    --stroke: rgba(255, 255, 255, 0.09);
    --text: #f4f1f8;
    --dim: #b6abc9;
    --mute: #7c7295;
    --cyan: #22d3ee;
    --purple: #7c3aed;
    --pink: #ec4899;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    background:
      radial-gradient(60% 50% at 75% -5%, rgba(124, 58, 237, 0.35), transparent 70%),
      radial-gradient(45% 40% at 10% 5%, rgba(34, 211, 238, 0.18), transparent 70%),
      radial-gradient(50% 45% at 50% 110%, rgba(236, 72, 153, 0.22), transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .wrap {
    position: relative;
    z-index: 1;
    max-width: 1040px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .gradient-text {
    background: linear-gradient(100deg, var(--cyan), var(--purple) 55%, var(--pink));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 26px 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.5px;
  }
  .brand .dot {
    width: 34px; height: 34px;
    border-radius: 10px;
    object-fit: cover;
    box-shadow: 0 6px 18px rgba(124, 58, 237, 0.45);
  }
  .brand small {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--mute);
    letter-spacing: 0.2px;
  }
  .nav-cta {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    padding: 10px 18px;
    border: 1px solid var(--stroke);
    border-radius: 999px;
    transition: border-color 0.2s, background 0.2s;
  }
  .nav-cta:hover { border-color: rgba(255,255,255,0.3); background: var(--surface); }

  .hero { padding: 70px 0 64px; max-width: 760px; }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--dim);
    background: var(--surface);
    border: 1px solid var(--stroke);
    padding: 7px 14px;
    border-radius: 999px;
    margin-bottom: 26px;
  }
  .eyebrow .pulse {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--cyan);
    box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.7);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.6); }
    70% { box-shadow: 0 0 0 9px rgba(34, 211, 238, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); }
  }
  h1 {
    font-size: clamp(40px, 7vw, 68px);
    line-height: 1.02;
    letter-spacing: -2px;
    font-weight: 800;
    margin-bottom: 22px;
  }
  .hero p {
    font-size: clamp(17px, 2.2vw, 20px);
    color: var(--dim);
    max-width: 580px;
  }
  .hero p.support {
    font-size: 16px;
    color: var(--mute);
    margin-top: 16px;
  }
  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 36px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    padding: 15px 26px;
    border-radius: 14px;
    transition: transform 0.15s, box-shadow 0.2s;
  }
  .btn-primary {
    color: #fff;
    background: linear-gradient(100deg, var(--purple), var(--pink));
    box-shadow: 0 10px 30px rgba(168, 85, 247, 0.35);
  }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 14px 38px rgba(168, 85, 247, 0.5); }
  .btn-ghost {
    color: var(--text);
    border: 1px solid var(--stroke);
    background: var(--surface);
  }
  .btn-ghost:hover { border-color: rgba(255,255,255,0.3); }

  .vibes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 40px;
  }
  .vibe {
    font-size: 13px;
    font-weight: 600;
    color: var(--dim);
    border: 1px solid var(--stroke);
    border-radius: 999px;
    padding: 7px 14px;
  }

  section { padding: 56px 0; }
  .section-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--mute);
    margin-bottom: 14px;
  }
  h2 {
    font-size: clamp(26px, 4vw, 38px);
    letter-spacing: -1px;
    font-weight: 800;
    margin-bottom: 16px;
    max-width: 640px;
  }
  .lead { color: var(--dim); max-width: 600px; font-size: 17px; }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin-top: 40px;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--stroke);
    border-radius: 20px;
    padding: 26px;
    transition: transform 0.2s, border-color 0.2s;
  }
  .card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.18); }
  .card .ico {
    width: 46px; height: 46px;
    display: grid; place-items: center;
    font-size: 24px;
    border-radius: 13px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--stroke);
    margin-bottom: 18px;
  }
  .card h3 { font-size: 19px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.4px; }
  .card p { color: var(--dim); font-size: 15px; }

  .panel {
    background: linear-gradient(135deg, rgba(124,58,237,0.14), rgba(236,72,153,0.1));
    border: 1px solid rgba(168,85,247,0.28);
    border-radius: 24px;
    padding: 44px;
  }
  .panel h2 { margin-bottom: 14px; }
  .panel .lead { max-width: 680px; }
  .flow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 28px;
  }
  .flow-step {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(0,0,0,0.25);
    border: 1px solid var(--stroke);
    border-radius: 14px;
    padding: 13px 18px;
    font-weight: 600;
    font-size: 14px;
  }
  .flow-step .n {
    width: 22px; height: 22px;
    display: grid; place-items: center;
    border-radius: 7px;
    font-size: 12px; font-weight: 800;
    background: linear-gradient(135deg, var(--purple), var(--pink));
    color: #fff;
  }
  .flow .arrow { color: var(--mute); font-size: 18px; }
  .note {
    margin-top: 26px;
    font-size: 14px;
    color: var(--mute);
    max-width: 680px;
  }

  footer {
    border-top: 1px solid var(--stroke);
    padding: 40px 0 56px;
    margin-top: 40px;
  }
  .foot-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .foot-links { display: flex; gap: 22px; flex-wrap: wrap; }
  .foot-links a {
    color: var(--dim);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s;
  }
  .foot-links a:hover { color: var(--text); }
  .copyright { color: var(--mute); font-size: 13px; }

  @media (max-width: 760px) {
    .grid { grid-template-columns: 1fr; }
    .panel { padding: 30px 24px; }
    .hero { padding: 48px 0 40px; }
    .nav-cta { display: none; }
  }
</style>

<div class="wrap">
  <header>
    <div class="brand">
      <img class="dot" src="/logo.png" alt="OurCityvibe" />
      <span>
        OurCityvibe
        <small>by Obito Ventures</small>
      </span>
    </div>
    <a class="nav-cta" href="#tickets">How tickets work</a>
  </header>

  <div class="hero">
    <span class="eyebrow"><span class="pulse"></span> AI-powered event discovery &amp; planning</span>
    <h1>Plan together.<br /><span class="gradient-text">Experience more.</span></h1>
    <p>
      OurCityvibe is your AI-powered guide to the best events, venues, and experiences in
      your city — designed to help you discover, coordinate, and book everything in one place.
    </p>
    <p class="support">
      Stop jumping between apps and group chats just to make plans. OurCityvibe brings your
      friends, your city, and your next experience together — with personalized
      recommendations that get smarter every time you use it.
    </p>
    <div class="cta-row">
      <a class="btn btn-primary" href="#" aria-label="Download on the App Store">
        Download on the App Store
      </a>
      <a
        class="btn btn-ghost"
        href="https://play.google.com/store/apps/details?id=com.ourcityvibe.app"
        target="_blank"
        rel="noopener"
      >
        Get it on Google Play
      </a>
    </div>
    <div class="vibes">
      <span class="vibe">🎤 Concerts</span>
      <span class="vibe">🎶 Club nights</span>
      <span class="vibe">🎭 Live shows</span>
      <span class="vibe">🍸 Bars &amp; lounges</span>
      <span class="vibe">🎉 Festivals</span>
    </div>
  </div>

  <section id="what">
    <div class="section-label">What OurCityvibe does</div>
    <h2>Everything you need to plan a night out — in one place.</h2>
    <p class="lead">
      A single feed for what's happening tonight and this weekend, tuned to your
      city, your location and your taste.
    </p>
    <div class="grid">
      <div class="card">
        <div class="ico">🔭</div>
        <h3>Discover</h3>
        <p>
          Browse live events, concerts, club nights and venues near you. Filter by
          location, date and vibe to find something worth leaving the house for.
        </p>
      </div>
      <div class="card">
        <div class="ico">👯</div>
        <h3>Plan together</h3>
        <p>
          Save events, RSVP, and rally the group with built-in chats so everyone
          knows the where, the when and the move for the night.
        </p>
      </div>
      <div class="card">
        <div class="ico">🎟️</div>
        <h3>Get tickets</h3>
        <p>
          Buy tickets to OurCityvibe events with secure in-app checkout — and for events
          from partners like Ticketmaster, we link you straight to their official page.
        </p>
      </div>
    </div>
  </section>

  <section id="tickets">
    <div class="panel">
      <div class="section-label">Tickets &amp; discovery</div>
      <h2>Buy tickets in OurCityvibe — and discover everything else, too.</h2>
      <p class="lead">
        For events on OurCityvibe, you buy your ticket right in the app with secure
        checkout — fast, simple, all in one place. We also bring in live events from
        trusted partners like <strong>Ticketmaster</strong>, so your feed shows
        everything happening around you; for those, we link you straight to the partner
        to finish the purchase on their official page.
      </p>
      <div class="flow">
        <div class="flow-step"><span class="n">1</span> Discover an event in OurCityvibe</div>
        <span class="arrow">→</span>
        <div class="flow-step"><span class="n">2</span> Tap “Get Tickets”</div>
        <span class="arrow">→</span>
        <div class="flow-step"><span class="n">3</span> Pay in-app, or finish on the partner's site</div>
      </div>
      <p class="note">
        Tickets for OurCityvibe events are sold and processed securely in the app. External
        events appear right alongside them in your feed, and their “Get Tickets” action
        opens the partner's official event page to complete the purchase there.
      </p>
    </div>
  </section>

  <footer>
    <div class="foot-row">
      <div class="brand">
        <img class="dot" src="/logo.png" alt="OurCityvibe" />
        <span>OurCityvibe<small>by Obito Ventures Inc.</small></span>
      </div>
      <div class="foot-links">
        <a href="#what">What's inside</a>
        <a href="#tickets">How tickets work</a>
        <a href="/privacy">Privacy</a>
        <a href="/csae-policy">Child Safety</a>
        <a href="mailto:Support@nvibez.com">Contact</a>
      </div>
    </div>
    <p class="copyright" style="margin-top: 24px;">
      © 2026 Obito Ventures Inc. OurCityvibe is an independent event-discovery platform.
      All brand names are the property of their respective owners.
    </p>
  </footer>
</div>
`;

export default function Landing() {
  return <StaticHtml title="OurCityvibe — Plan together. Experience more." html={html} />;
}
