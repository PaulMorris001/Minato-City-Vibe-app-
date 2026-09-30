import { useEffect, useState } from "react";
import { api, getToken } from "../lib/api";
import { APP_STORE_URL, PLAY_STORE_URL } from "../lib/app";

/** How long the pitch stays quiet after it has been shown once. */
const REPEAT_DAYS = 3;
const SHOWN_AT_KEY = "raffle_promo_shown_at";

// Held to once per page load, so navigating between pages that mount this
// doesn't re-nag inside one visit.
let shownThisVisit = false;

/**
 * Announces an open Birthday Raffle campaign, mirroring
 * mobile/components/shared/RafflePromoPopup.tsx. The raffle itself lives in the
 * app (you enter by creating a birthday event there), so this pitches it and
 * sends people to the store rather than to a web screen.
 *
 * Same two gates as the app: quiet for REPEAT_DAYS after a showing, and never
 * shown to someone who already has a qualifying birthday event. The copy ties
 * the outcome to RSVP count and nothing else — winners are a merit ranking on
 * verified RSVPs, never a draw — so keep any rewrite consistent with
 * mobile/app/birthday-raffle/rules.tsx.
 */
export default function RafflePromoPopup() {
  const [visible, setVisible] = useState(false);
  const [campaignName, setCampaignName] = useState("");

  useEffect(() => {
    if (shownThisVisit) return;
    let cancelled = false;

    (async () => {
      try {
        let lastShown = 0;
        try {
          lastShown = Number(localStorage.getItem(SHOWN_AT_KEY)) || 0;
        } catch {
          // Storage blocked — treat as never shown.
        }
        if (Date.now() - lastShown < REPEAT_DAYS * 24 * 60 * 60 * 1000) return;

        const data = await api("/raffle/public", { auth: false });
        if (cancelled || !data?.active) return;

        // Already entered means already sold. A failed check still shows the
        // popup — silence would mute an open campaign over a dropped request.
        if (getToken()) {
          try {
            const status = await api("/raffle/status");
            if (status?.hasQualifyingEvent) return;
          } catch {
            // Falls through to showing it.
          }
        }

        if (cancelled) return;
        setCampaignName(data.campaignName || "");
        setVisible(true);
        shownThisVisit = true;
        try {
          localStorage.setItem(SHOWN_AT_KEY, String(Date.now()));
        } catch {
          // Worst case it shows again next visit.
        }
      } catch {
        // No raffle news is not worth an error state on a page load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setVisible(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <style>{css}</style>
      <div className="cv-raffle-overlay" onClick={() => setVisible(false)}>
        <div
          className="cv-raffle-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-raffle-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cv-raffle-icon" aria-hidden="true">🎁</div>
          <h2 id="cv-raffle-title">{campaignName || "Birthday Raffle"}</h2>
          <p>
            Create your birthday event in the CityVibe app, invite your friends and get them to
            RSVP. The higher your RSVPs, the better your chances!
          </p>
          <a className="cv-raffle-primary" href={APP_STORE_URL} target="_blank" rel="noreferrer">
            Download on iOS
          </a>
          <a className="cv-raffle-secondary" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
            Get it on Google Play
          </a>
          <button type="button" className="cv-raffle-dismiss" onClick={() => setVisible(false)}>
            Not now
          </button>
        </div>
      </div>
    </>
  );
}

// Literal colours rather than the Layout's CSS variables, so the popup doesn't
// depend on being rendered inside Layout.
const css = `
  .cv-raffle-overlay {
    position: fixed; inset: 0; z-index: 100; padding: 24px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.7);
  }
  .cv-raffle-card {
    width: 100%; max-width: 380px; text-align: center; color: #f4f1f8;
    background: #17102a; border: 1px solid rgba(168,85,247,0.4); border-radius: 22px;
    padding: 28px 24px 20px; box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  }
  .cv-raffle-icon {
    width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 999px; font-size: 30px;
    display: grid; place-items: center; background: rgba(168,85,247,0.2);
  }
  .cv-raffle-card h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; margin-bottom: 10px; }
  .cv-raffle-card p { color: #b6abc9; font-size: 14.5px; line-height: 1.6; margin-bottom: 20px; }
  .cv-raffle-primary, .cv-raffle-secondary {
    display: block; padding: 13px; border-radius: 12px; font-size: 15px; font-weight: 650;
    text-decoration: none; margin-bottom: 10px;
  }
  .cv-raffle-primary { background: linear-gradient(100deg, #7c3aed, #ec4899); color: #fff; }
  .cv-raffle-secondary { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.16); color: #f4f1f8; }
  .cv-raffle-dismiss {
    background: none; border: none; color: #7c7295; font-size: 14px; cursor: pointer; padding: 8px;
  }
  .cv-raffle-dismiss:hover { color: #f4f1f8; }
`;
