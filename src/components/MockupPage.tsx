import { useEffect, useRef } from "react";

/**
 * Renders mockup HTML and runs a hydrate callback after mount/data change.
 * Also auto-wires the common tab/segment patterns used across the mockup
 * pages (settings stabs, credit/withdraw method pickers, portal pickers).
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
    if (!ref.current) return;
    wireMockupTabs(ref.current);
    if (!hydrate) return;
    const cleanup = hydrate(ref.current);
    return typeof cleanup === "function" ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <div
      ref={ref}
      className="page active"
      data-mockup-page=""
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Strips inline onclick="sel*(this)" handlers from the mockup HTML and wires
 * a delegated click for the common tab patterns:
 *   data-s   → settings stabs (panel ID == value, class "stab")
 *   data-cm  → credit method (panel ID == "credit-{value}-fields")
 *   data-wm  / data-fwm → withdrawal method (visual select only)
 *   data-portal → portal template selector (visual select only)
 * Tabs already handled inline by a route's hydrate (data-st, data-f, etc.)
 * are skipped — but we still kill their stray inline onclick so the page
 * doesn't throw "selX is not defined" before hydrate runs.
 */
function wireMockupTabs(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[onclick]").forEach(el => {
    const v = el.getAttribute("onclick") || "";
    if (/^(sel\w+|pfilter|vfilter)\(/.test(v.trim())) el.removeAttribute("onclick");
  });

  // Settings page tabs
  const stabs = Array.from(root.querySelectorAll<HTMLElement>("[data-s]"));
  if (stabs.length) {
    const panels = Array.from(root.querySelectorAll<HTMLElement>(".stab"));
    const show = (id: string) => {
      stabs.forEach(t => t.classList.toggle("act", t.dataset.s === id));
      panels.forEach(p => { p.style.display = p.id === id ? "" : "none"; });
    };
    stabs.forEach(t => t.addEventListener("click", () => show(t.dataset.s!)));
    const initial = stabs.find(t => t.classList.contains("act"))?.dataset.s ?? stabs[0]?.dataset.s;
    if (initial) show(initial);
  }

  // Credit method (Mobile Money / Main Wallet)
  const cmOpts = Array.from(root.querySelectorAll<HTMLElement>("[data-cm]"));
  if (cmOpts.length) {
    const showCm = (key: string) => {
      cmOpts.forEach(o => o.classList.toggle("sel", o.dataset.cm === key));
      const momo = root.querySelector<HTMLElement>("#credit-momo-fields");
      const wal = root.querySelector<HTMLElement>("#credit-wallet-fields");
      if (momo) momo.style.display = key === "momo" ? "" : "none";
      if (wal) wal.style.display = key === "wallet" ? "" : "none";
    };
    cmOpts.forEach(o => o.addEventListener("click", () => showCm(o.dataset.cm!)));
  }

  // Visual-only pickers (no separate panels — just toggle .sel)
  for (const attr of ["wm", "fwm", "portal"] as const) {
    const opts = Array.from(root.querySelectorAll<HTMLElement>(`[data-${attr}]`));
    if (!opts.length) continue;
    opts.forEach(o => o.addEventListener("click", () => {
      opts.forEach(x => x.classList.toggle("sel", x === o));
    }));
  }
}
