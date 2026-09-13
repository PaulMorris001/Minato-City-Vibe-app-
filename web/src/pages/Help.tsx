import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import type { ManualTopicSummary } from "../lib/types";

/**
 * The how-to manual index.
 *
 * Content comes from the API (server/src/content/manual.js) rather than living
 * here, so the same words back the mobile app's help screens and a copy edit
 * doesn't need a deploy of either client.
 */
export default function Help() {
  const [topics, setTopics] = useState<ManualTopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ topics: ManualTopicSummary[] }>("/manual")
      .then((res) => setTopics(res.topics))
      .catch(() => setError("Couldn't load the guides just now. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="cv-section">
        <p className="cv-eyebrow">Help</p>
        <h1 className="cv-h1">How CityVibe works</h1>
        <p className="cv-muted" style={{ maxWidth: 620, marginTop: 8 }}>
          Everything you need to run an event, publish a guide or set up your business — written
          out, start to finish.
        </p>

        {loading && (
          <div style={{ marginTop: 28 }}>
            <div className="cv-skel" style={{ height: 92, marginBottom: 12 }} />
            <div className="cv-skel" style={{ height: 92, marginBottom: 12 }} />
            <div className="cv-skel" style={{ height: 92 }} />
          </div>
        )}

        {error && <div className="cv-error" style={{ marginTop: 24 }}>{error}</div>}

        {!loading && !error && (
          <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
            {topics.map((t) => (
              <Link key={t.slug} to={`/help/${t.slug}`} className="cv-panel cv-list-row">
                <div>
                  <h3 className="cv-h3" style={{ margin: 0 }}>
                    {t.title}
                  </h3>
                  <p className="cv-muted" style={{ marginTop: 6 }}>
                    {t.summary}
                  </p>
                </div>
                <span className="cv-dim" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
