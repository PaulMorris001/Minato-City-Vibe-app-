import { useEffect } from "react";
import { Link } from "react-router-dom";

// Renders a self-contained block of trusted, static marketing/legal HTML
// (its own <style> + markup), ported verbatim from the backend so the pages
// stay pixel-identical after moving off the API server. Sets the document
// title per route since this is a client-rendered SPA with one shared <head>.
//
// `back` adds a floating "Back to OurCityvibe" link to the landing page — handy
// on the legal pages, which are otherwise dead-ends when reached directly.
export default function StaticHtml({
  title,
  html,
  back,
}: {
  title: string;
  html: string;
  back?: boolean;
}) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <>
      {back ? (
        <Link
          to="/"
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            color: "#e5e7eb",
            background: "rgba(31,31,46,0.9)",
            border: "1px solid #374151",
            textDecoration: "none",
            backdropFilter: "blur(6px)",
          }}
        >
          ← Back to OurCityvibe
        </Link>
      ) : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
