import { type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { initials } from "../lib/format";

/**
 * Shared shell for the account / events / profile pages.
 *
 * The palette and treatment deliberately mirror the marketing landing page
 * (src/pages/Landing.tsx): near-black #0b0613 base, fixed radial glows in
 * cyan/purple/pink, translucent "glass" surfaces and a gradient wordmark — so
 * moving from the landing page into the app feels like one site.
 */
export default function Layout({
  children,
  wide = false,
  bare = false,
}: {
  children: ReactNode;
  /** Opt into the wider container used by the events feed. */
  wide?: boolean;
  /** Drop the main padding — for pages that render their own full-bleed hero. */
  bare?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <style>{css}</style>
      <div className="cv-shell">
        <div className="cv-glow" aria-hidden="true" />
        <header className="cv-nav">
          <div className="cv-nav-inner">
            <Link to="/" className="cv-brand">
              OurCityvibe
            </Link>
            <nav className="cv-navlinks">
              <Link to="/events">Events</Link>
              {user ? (
                <>
                  <Link to="/profile" className="cv-avatar-link" title={user.username}>
                    <span className="cv-avatar cv-avatar-sm">{initials(user.username)}</span>
                    <span className="cv-hide-sm">{user.username}</span>
                  </Link>
                  <button
                    className="cv-linkbtn cv-hide-sm"
                    onClick={() => {
                      logout();
                      navigate("/events");
                    }}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login">Log in</Link>
                  <Link to="/signup" className="cv-navcta">
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className={`cv-main${wide ? " cv-main-wide" : ""}${bare ? " cv-main-bare" : ""}`}>
          {children}
        </main>
        <footer className="cv-footer">
          <div className="cv-footer-inner">
            <span className="cv-muted">© {new Date().getFullYear()} OurCityvibe</span>
            <div className="cv-footer-links">
              <Link to="/events">Events</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/csae-policy">Child safety</Link>
              <Link to="/delete-account">Delete account</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

const css = `
  :root {
    --bg: #0b0613;
    --surface: rgba(255,255,255,0.04);
    --surface-2: rgba(255,255,255,0.07);
    --stroke: rgba(255,255,255,0.09);
    --stroke-strong: rgba(255,255,255,0.16);
    --text: #f4f1f8;
    --dim: #b6abc9;
    --mute: #7c7295;
    --cyan: #22d3ee;
    --purple: #7c3aed;
    --pink: #ec4899;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  input, button, select, textarea { font-family: inherit; }

  .cv-shell { min-height: 100vh; display: flex; flex-direction: column; position: relative; }
  .cv-glow {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(60% 50% at 78% -8%, rgba(124,58,237,0.34), transparent 70%),
      radial-gradient(45% 40% at 8% 2%, rgba(34,211,238,0.16), transparent 70%),
      radial-gradient(55% 45% at 50% 108%, rgba(236,72,153,0.18), transparent 70%);
  }

  /* ── Nav ─────────────────────────────────────────────── */
  .cv-nav {
    position: sticky; top: 0; z-index: 20;
    background: rgba(11,6,19,0.72); backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--stroke);
  }
  .cv-nav-inner {
    max-width: 1120px; margin: 0 auto; padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .cv-brand {
    font-size: 19px; font-weight: 800; letter-spacing: -0.4px;
    background: linear-gradient(100deg, var(--cyan), var(--purple) 55%, var(--pink));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .cv-navlinks { display: flex; align-items: center; gap: 18px; font-size: 14px; }
  .cv-navlinks a { color: var(--dim); transition: color .15s; }
  .cv-navlinks a:hover { color: #fff; }
  .cv-avatar-link { display: flex; align-items: center; gap: 8px; color: var(--text) !important; }
  .cv-navcta {
    background: linear-gradient(100deg, var(--purple), var(--pink));
    color: #fff !important; padding: 9px 16px; border-radius: 999px; font-weight: 600;
  }
  .cv-navcta:hover { filter: brightness(1.1); }
  .cv-linkbtn { background: none; border: none; color: var(--dim); font-size: 14px; cursor: pointer; }
  .cv-linkbtn:hover { color: #fff; }

  .cv-main { position: relative; z-index: 1; flex: 1; max-width: 1120px; width: 100%; margin: 0 auto; padding: 36px 24px 72px; }
  .cv-main-wide { max-width: 1240px; }
  .cv-main-bare { padding: 0 0 72px; max-width: none; }

  .cv-footer { position: relative; z-index: 1; border-top: 1px solid var(--stroke); }
  .cv-footer-inner {
    max-width: 1120px; margin: 0 auto; padding: 22px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    font-size: 13px;
  }
  .cv-footer-links { display: flex; gap: 18px; flex-wrap: wrap; }
  .cv-footer-links a { color: var(--mute); }
  .cv-footer-links a:hover { color: var(--text); }

  /* ── Typography ──────────────────────────────────────── */
  .cv-h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.8px; margin-bottom: 6px; }
  .cv-h2 { font-size: 15px; color: var(--dim); margin-bottom: 26px; }
  .cv-h3 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 12px; }
  .cv-muted { color: var(--mute); font-size: 14px; }
  .cv-dim { color: var(--dim); }
  .cv-center { text-align: center; }
  .cv-link { color: #d8b4fe; cursor: pointer; }
  .cv-link:hover { text-decoration: underline; }
  .cv-gradient-text {
    background: linear-gradient(100deg, var(--cyan), var(--purple) 55%, var(--pink));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .cv-eyebrow {
    font-size: 12px; letter-spacing: 1.4px; text-transform: uppercase;
    color: var(--mute); font-weight: 700; margin-bottom: 10px;
  }

  /* ── Surfaces ────────────────────────────────────────── */
  .cv-card {
    background: var(--surface); border: 1px solid var(--stroke); border-radius: 18px;
    padding: 28px; max-width: 440px; width: 100%; margin: 0 auto;
    backdrop-filter: blur(10px);
  }
  .cv-card h1 { font-size: 23px; font-weight: 700; letter-spacing: -0.4px; margin-bottom: 8px; }
  .cv-card p.sub { color: var(--dim); font-size: 14px; line-height: 1.6; margin-bottom: 22px; }
  .cv-panel {
    background: var(--surface); border: 1px solid var(--stroke); border-radius: 18px;
    padding: 22px; backdrop-filter: blur(10px);
  }
  .cv-section { margin-bottom: 28px; }

  /* ── Forms ───────────────────────────────────────────── */
  .cv-label { display: block; font-size: 13px; color: var(--dim); margin-bottom: 6px; }
  .cv-input {
    width: 100%; background: rgba(0,0,0,0.35); border: 1px solid var(--stroke);
    border-radius: 12px; color: var(--text); font-size: 15px; padding: 13px 15px;
    margin-bottom: 16px; outline: none; transition: border-color .15s;
  }
  .cv-input::placeholder { color: var(--mute); }
  .cv-input:focus { border-color: var(--purple); }
  .cv-btn {
    width: 100%; background: linear-gradient(100deg, var(--purple), var(--pink));
    color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 650;
    padding: 14px; cursor: pointer; transition: filter .15s, opacity .15s;
  }
  .cv-btn:hover { filter: brightness(1.1); }
  .cv-btn:disabled { opacity: 0.55; cursor: default; filter: none; }
  .cv-btn-ghost {
    background: var(--surface-2); border: 1px solid var(--stroke-strong); color: var(--text);
  }
  .cv-btn-ghost:hover { background: rgba(255,255,255,0.11); filter: none; }
  .cv-btn-inline { width: auto; padding: 11px 20px; display: inline-block; text-align: center; }
  .cv-error {
    padding: 12px 16px; border-radius: 12px; font-size: 14px; margin-bottom: 18px;
    background: rgba(220,38,38,0.14); border: 1px solid rgba(248,113,113,0.4); color: #fca5a5;
  }
  .cv-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  /* ── Pills / chips / badges ──────────────────────────── */
  .cv-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 650; padding: 5px 11px; border-radius: 999px;
    background: rgba(255,255,255,0.08); border: 1px solid var(--stroke); color: var(--dim);
  }
  .cv-pill-accent { background: rgba(168,85,247,0.2); border-color: rgba(168,85,247,0.4); color: #e9d5ff; }
  .cv-pill-free { background: rgba(16,185,129,0.16); border-color: rgba(16,185,129,0.38); color: #6ee7b7; }
  .cv-pill-ext { background: rgba(34,211,238,0.14); border-color: rgba(34,211,238,0.35); color: #a5f3fc; }
  .cv-chips { display: flex; gap: 9px; flex-wrap: wrap; }
  .cv-chip {
    font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 999px; cursor: pointer;
    background: var(--surface); border: 1px solid var(--stroke); color: var(--dim); transition: all .15s;
  }
  .cv-chip:hover { border-color: var(--stroke-strong); color: var(--text); }
  .cv-chip-on {
    background: linear-gradient(100deg, rgba(124,58,237,0.85), rgba(236,72,153,0.85));
    border-color: transparent; color: #fff;
  }

  /* ── Avatars ─────────────────────────────────────────── */
  .cv-avatar {
    width: 44px; height: 44px; border-radius: 999px; flex: none;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff; object-fit: cover;
    background: linear-gradient(135deg, var(--purple), var(--pink));
    border: 1px solid var(--stroke-strong);
  }
  .cv-avatar-sm { width: 28px; height: 28px; font-size: 11px; }
  .cv-avatar-lg { width: 88px; height: 88px; font-size: 26px; }
  .cv-avatar-stack { display: flex; }
  .cv-avatar-stack .cv-avatar { margin-left: -10px; box-shadow: 0 0 0 2px var(--bg); }
  .cv-avatar-stack .cv-avatar:first-child { margin-left: 0; }

  /* ── Events grid + cards ─────────────────────────────── */
  .cv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(272px, 1fr)); gap: 22px; }
  .cv-event {
    display: block; position: relative; border-radius: 18px; overflow: hidden;
    background: var(--surface); border: 1px solid var(--stroke); cursor: pointer;
    transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
  }
  .cv-event:hover {
    transform: translateY(-4px); border-color: rgba(168,85,247,0.55);
    box-shadow: 0 18px 40px -18px rgba(124,58,237,0.7);
  }
  .cv-event-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
  .cv-event-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cv-event-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(11,6,19,0.92) 0%, rgba(11,6,19,0.15) 55%, transparent 100%);
  }
  .cv-event-date {
    position: absolute; top: 12px; left: 12px; text-align: center; min-width: 48px;
    padding: 6px 8px; border-radius: 12px; line-height: 1.1;
    background: rgba(11,6,19,0.72); backdrop-filter: blur(8px); border: 1px solid var(--stroke-strong);
  }
  .cv-event-date .m { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #f0abfc; }
  .cv-event-date .d { font-size: 18px; font-weight: 800; }
  .cv-event-badges { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; }
  .cv-event-bottom { position: absolute; left: 14px; right: 14px; bottom: 12px; }
  .cv-event-body { padding: 14px 16px 16px; }
  .cv-event-title {
    font-size: 16.5px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 6px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .cv-event-meta {
    font-size: 13px; color: var(--dim); display: flex; align-items: center; gap: 6px;
    margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cv-event-foot {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--stroke);
  }
  .cv-host-mini { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--dim); min-width: 0; }
  .cv-host-mini span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Detail page ─────────────────────────────────────── */
  .cv-hero { position: relative; border-radius: 22px; overflow: hidden; margin-bottom: 26px; min-height: 240px; }
  .cv-hero img { width: 100%; height: 100%; max-height: 420px; object-fit: cover; display: block; }
  .cv-hero-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(11,6,19,0.95), rgba(11,6,19,0.1) 70%);
  }
  .cv-hero-text { position: absolute; left: 24px; right: 24px; bottom: 22px; }
  .cv-detail { display: grid; grid-template-columns: minmax(0,1fr) 360px; gap: 26px; align-items: start; }
  .cv-sticky { position: sticky; top: 90px; }
  .cv-gallery { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
  .cv-gallery img { width: 150px; height: 100px; object-fit: cover; border-radius: 12px; flex: none; border: 1px solid var(--stroke); }
  .cv-facts { display: grid; gap: 14px; }
  .cv-fact { display: flex; gap: 12px; align-items: flex-start; }
  .cv-fact-icon {
    width: 38px; height: 38px; border-radius: 11px; flex: none; font-size: 17px;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-2); border: 1px solid var(--stroke);
  }
  .cv-fact-label { font-size: 12px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
  .cv-fact-value { font-size: 14.5px; color: var(--text); }
  .cv-stats { display: flex; gap: 26px; flex-wrap: wrap; }
  .cv-stat-n { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; }
  .cv-stat-l { font-size: 12px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.8px; }
  .cv-body-text { font-size: 15.5px; line-height: 1.75; color: var(--dim); white-space: pre-wrap; }
  .cv-list-row {
    display: flex; align-items: center; gap: 12px; padding: 11px 0;
    border-bottom: 1px solid var(--stroke);
  }
  .cv-list-row:last-child { border-bottom: none; }
  .cv-tier {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    border: 1px solid var(--stroke); border-radius: 13px; padding: 13px 15px;
    margin-bottom: 10px; cursor: pointer; transition: border-color .15s, background .15s;
  }
  .cv-tier:hover { border-color: var(--stroke-strong); }
  .cv-tier-on { border-color: rgba(168,85,247,0.75); background: rgba(124,58,237,0.14); }

  /* ── App promo ───────────────────────────────────────── */
  .cv-promo {
    position: relative; overflow: hidden; border-radius: 20px; padding: 26px;
    border: 1px solid rgba(168,85,247,0.35);
    background:
      radial-gradient(80% 120% at 100% 0%, rgba(236,72,153,0.24), transparent 65%),
      radial-gradient(70% 120% at 0% 100%, rgba(34,211,238,0.18), transparent 65%),
      var(--surface);
  }
  .cv-promo h3 { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; margin-bottom: 8px; }
  .cv-promo p { color: var(--dim); font-size: 14.5px; line-height: 1.6; margin-bottom: 18px; max-width: 520px; }
  .cv-promo ul { list-style: none; margin: 0 0 18px; display: grid; gap: 7px; }
  .cv-promo li { color: var(--dim); font-size: 14px; display: flex; gap: 9px; align-items: flex-start; }
  .cv-stores { display: flex; gap: 12px; flex-wrap: wrap; }
  .cv-store {
    display: inline-flex; align-items: center; gap: 9px; padding: 11px 18px; border-radius: 12px;
    font-size: 14px; font-weight: 650; background: #fff; color: #0b0613 !important;
    transition: transform .15s;
  }
  .cv-store:hover { transform: translateY(-2px); }
  .cv-store-alt { background: var(--surface-2); color: var(--text) !important; border: 1px solid var(--stroke-strong); }

  /* ── Skeletons ───────────────────────────────────────── */
  .cv-skel {
    border-radius: 18px; border: 1px solid var(--stroke);
    background: linear-gradient(100deg, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 70%);
    background-size: 220% 100%; animation: cv-shimmer 1.4s infinite linear;
  }
  @keyframes cv-shimmer { from { background-position: 140% 0; } to { background-position: -40% 0; } }

  .cv-empty { text-align: center; padding: 60px 20px; }
  .cv-empty-emoji { font-size: 40px; margin-bottom: 12px; }

  @media (max-width: 900px) {
    .cv-detail { grid-template-columns: 1fr; }
    .cv-sticky { position: static; }
    .cv-h1 { font-size: 27px; }
  }
  @media (max-width: 560px) {
    .cv-hide-sm { display: none; }
    .cv-main { padding: 24px 16px 56px; }
    .cv-nav-inner { padding: 12px 16px; }
    .cv-grid { grid-template-columns: 1fr; }
  }
`;
