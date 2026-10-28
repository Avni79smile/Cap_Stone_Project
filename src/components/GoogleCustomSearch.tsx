import { useEffect, useState } from "react";

const GOOGLE_CSE_ID = import.meta.env["VITE_GOOGLE_SEARCH_ENGINE_ID"] || "c2d34e6f2b6a44099";

export function GoogleCustomSearch() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existingScript = document.querySelector('script[data-google-cse="true"]');
    if (existingScript) {
      setReady(true);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://cse.google.com/cse.js?cx=${GOOGLE_CSE_ID}`;
    script.dataset.googleCse = "true";
    script.onload = () => setReady(true);
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return (
    <div className="mt-8 rounded-3xl border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Web research
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-foreground">Search the web for sources</h3>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {ready ? "Ready" : "Loading"}
        </span>
      </div>
      <div className="gcse-search" aria-label="Custom search" />
    </div>
  );
}
