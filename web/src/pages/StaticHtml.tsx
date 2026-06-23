import { useEffect } from "react";

// Renders a self-contained block of trusted, static marketing/legal HTML
// (its own <style> + markup), ported verbatim from the backend so the pages
// stay pixel-identical after moving off the API server. Sets the document
// title per route since this is a client-rendered SPA with one shared <head>.
export default function StaticHtml({ title, html }: { title: string; html: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
