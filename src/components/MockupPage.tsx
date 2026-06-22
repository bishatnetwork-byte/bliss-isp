import { useEffect, useRef } from "react";

/**
 * Renders mockup HTML and runs a hydrate callback after mount/data change.
 * The hydrate fn receives the container element so it can wire IDs.
 */
export function MockupPage({
  html, title, hydrate, deps = [],
}: {
  html: string;
  title: string;
  hydrate?: (root: HTMLElement) => void | (() => void);
  deps?: unknown[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = `${title} — HotspotPro`;
  }, [title]);

  useEffect(() => {
    if (!ref.current || !hydrate) return;
    const cleanup = hydrate(ref.current);
    return typeof cleanup === "function" ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <div
      ref={ref}
      className="page active"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
