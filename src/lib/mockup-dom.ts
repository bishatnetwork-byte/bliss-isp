/** DOM helpers for hydrating mockup HTML with live data. */
export const $ = <T extends HTMLElement = HTMLElement>(root: HTMLElement, id: string) =>
  root.querySelector<T>(`#${id}`);

export const setText = (root: HTMLElement, id: string, v: string | number) => {
  const el = $(root, id);
  if (el) el.textContent = String(v);
};

export const setHTML = (root: HTMLElement, id: string, v: string) => {
  const el = $(root, id);
  if (el) el.innerHTML = v;
};

export const setVal = (root: HTMLElement, id: string, v: string) => {
  const el = $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(root, id);
  if (el) el.value = v;
};

export const getVal = (root: HTMLElement, id: string): string => {
  const el = $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(root, id);
  return el?.value?.trim() ?? "";
};

export const on = <K extends keyof HTMLElementEventMap>(
  root: HTMLElement, id: string, ev: K, fn: (e: HTMLElementEventMap[K]) => void,
) => {
  const el = $(root, id);
  if (el) el.addEventListener(ev, fn as EventListener);
};

export const fmt = (n: number, cur = "KES") => `${cur} ` + Math.round(n).toLocaleString();

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const notify = (msg: string, kind: "info" | "error" | "warning" | "success" = "info") => {
  // Lightweight toast — uses existing .toast class if available, else alert.
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  el.style.cssText = "position:fixed;top:20px;right:20px;padding:10px 16px;border-radius:6px;z-index:9999;color:#fff;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);" +
    (kind === "error" ? "background:#dc2626" : kind === "warning" ? "background:#f59e0b" : kind === "success" ? "background:#10b981" : "background:#2563eb");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};
