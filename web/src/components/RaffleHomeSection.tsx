import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { APP_STORE_URL, PLAY_STORE_URL } from "../lib/app";

interface PublicRaffle {
  active: boolean;
  campaignName?: string;
  campaignDeadline?: string;
  daysLeft?: number;
  minReferrals?: number;
  prizes?: { rank: number }[];
}

/**
 * The Birthday Raffle pitch on the marketing home page (pages/Landing.tsx),
 * rendered between its hero and "What OurCityvibe does". Reads the live
 * campaign from GET /raffle/public; with no campaign open it still shows, as a
 * "next round" teaser, since a birthday can be registered months ahead.
 *
 * Styled with Landing's own classes (section/panel/flow/btn), so it must stay
 * inside that page. The raffle itself only exists in the app, so every CTA is
 * a store link. Copy ties winning to verified RSVPs and nothing else — the
 * merit ranking in mobile/app/birthday-raffle/rules.tsx — so keep any rewrite
 * consistent with those rules.
 */
export default function RaffleHomeSection() {
  const [raffle, setRaffle] = useState<PublicRaffle | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PublicRaffle>("/raffle/public", { auth: false })
      .then((data) => {
        if (!cancelled) setRaffle(data);
      })
      .catch(() => {
        if (!cancelled) setRaffle({ active: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const live = !!raffle?.active;
  const minRsvps = raffle?.minReferrals;
  const prizeCount = raffle?.prizes?.length ?? 0;
  // Campaigns end at 23:59:59 UTC; formatting in the visitor's own zone
  // showed the next day east of UTC.
  const ends = raffle?.campaignDeadline
    ? new Date(raffle.campaignDeadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const daysLeft = raffle?.daysLeft;

  return (
    <div className="wrap">
      <style>{css}</style>
      <section id="raffle">
        <div className="panel cv-rh-panel">
          <div className="cv-rh-head">
            <div className="section-label" style={{ marginBottom: 0 }}>🎂 Birthday Raffle</div>
            {live && (
              <span className="cv-rh-live">
                <span className="cv-rh-dot" /> Live now
                {typeof daysLeft === "number" && ` · ${daysLeft <= 0 ? "ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}`}
              </span>
            )}
          </div>

          <h2>
            {live ? raffle?.campaignName || "Win big for your birthday" : "Win big for your birthday"}
          </h2>
          <p className="lead">
            {live
              ? "Celebrating your birthday? Host it on OurCityvibe, invite your friends and get them to RSVP. The hosts with the most verified RSVPs win"
              : "Every month, the OurCityvibe birthday hosts with the most verified RSVPs win. The next round opens soon — you can register your birthday in the app up to 6 months ahead"}
            {live && prizeCount > 1 ? ` — ${prizeCount} prizes up for grabs.` : "."}
          </p>

          <div className="flow">
            <div className="flow-step"><span className="n">1</span> Download the app</div>
            <span className="arrow">→</span>
            <div className="flow-step"><span className="n">2</span> Create your birthday event</div>
            <span className="arrow">→</span>
            <div className="flow-step">
              <span className="n">3</span>
              {minRsvps ? `Get ${minRsvps}+ friends to RSVP` : "Get your friends to RSVP"}
            </div>
          </div>

          <div className="cta-row">
            <a className="btn btn-primary" href={APP_STORE_URL} target="_blank" rel="noreferrer">
              Download on the App Store
            </a>
            <a className="btn btn-ghost" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
              Get it on Google Play
            </a>
          </div>

          <p className="note">
            {live && ends ? `Entries close ${ends}. ` : ""}
            Open to OurCityvibe users with a birthday event in the app; winners are the hosts with the
            most verified RSVPs. Full official rules are in the app. Apple and Google are not sponsors of
            this promotion.
          </p>
        </div>
      </section>
    </div>
  );
}

const css = `
  .cv-rh-panel { position: relative; overflow: hidden; }
  .cv-rh-panel::after {
    content: "🎁"; position: absolute; right: -10px; top: -18px;
    font-size: 150px; opacity: 0.08; transform: rotate(12deg); pointer-events: none;
  }
  .cv-rh-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .cv-rh-live {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12.5px; font-weight: 700; color: #fff;
    background: rgba(236, 72, 153, 0.18); border: 1px solid rgba(236, 72, 153, 0.45);
    padding: 5px 12px; border-radius: 999px;
  }
  .cv-rh-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #ec4899;
    animation: cv-rh-pulse 2s infinite;
  }
  /* Steps stack on narrow screens, where the arrows would dangle at line ends. */
  @media (max-width: 760px) { .cv-rh-panel .arrow { display: none; } }
  @keyframes cv-rh-pulse {
    0% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.6); }
    70% { box-shadow: 0 0 0 8px rgba(236, 72, 153, 0); }
    100% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
  }
`;
