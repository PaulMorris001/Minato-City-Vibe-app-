import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import type { ManualTopic } from "../lib/types";

/** One manual topic, rendered from the API's structured sections. */
export default function HelpTopic() {
  const { slug } = useParams<{ slug: string }>();
  const [topic, setTopic] = useState<ManualTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError("");
    api<{ topic: ManualTopic }>(`/manual/${slug}`)
      .then((res) => setTopic(res.topic))
      .catch((err: any) =>
        setError(
          err?.status === 404
            ? "We don't have a guide by that name."
            : "Couldn't load this guide just now. Please try again."
        )
      )
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <Layout>
      <div className="cv-section" style={{ maxWidth: 720 }}>
        <Link to="/help" className="cv-link">
          ← All guides
        </Link>

        {loading && (
          <div style={{ marginTop: 24 }}>
            <div className="cv-skel" style={{ height: 40, marginBottom: 20 }} />
            <div className="cv-skel" style={{ height: 130, marginBottom: 12 }} />
            <div className="cv-skel" style={{ height: 130 }} />
          </div>
        )}

        {error && <div className="cv-error" style={{ marginTop: 24 }}>{error}</div>}

        {topic && (
          <>
            <h1 className="cv-h1" style={{ marginTop: 16 }}>
              {topic.title}
            </h1>
            <p className="cv-muted" style={{ marginTop: 8 }}>
              {topic.summary}
            </p>

            <div style={{ marginTop: 28, display: "grid", gap: 12 }}>
              {topic.sections.map((section) => (
                <section key={section.heading} className="cv-panel">
                  <h2 className="cv-h3" style={{ marginTop: 0 }}>
                    {section.heading}
                  </h2>
                  <p className="cv-body-text">{section.body}</p>
                  {section.bullets && section.bullets.length > 0 && (
                    <ul style={{ marginTop: 12, paddingLeft: 20 }}>
                      {section.bullets.map((b) => (
                        <li key={b} className="cv-muted" style={{ marginBottom: 6 }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
