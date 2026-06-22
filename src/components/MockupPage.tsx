import { useEffect, useRef } from "react";

/**
 * Renders a chunk of the original HotspotPro HTML mockup inside the React shell.
 * The mockup CSS (src/styles/mockup.css) provides the styling. Backend wiring is
 * added per-page in follow-up turns; for now interactive controls are placeholders.
 */
export function MockupPage({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Title and scroll to top on mount
    if (typeof document !== "undefined") document.title = `${title} — HotspotPro`;
    ref.current?.scrollTo?.({ top: 0 });
  }, [title]);

  // The mockup uses class="page" which is display:none unless .active is present.
  return (
    <div
      ref={ref}
      className="page active"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
