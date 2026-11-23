import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const dur = (ms: number | null | undefined) => {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min ${s % 60} s`;
};
export const money = (x: number | null | undefined) => (x ? `$${x.toFixed(2)}` : "$0");
export const ago = (t: string | number | null | undefined) => {
  if (!t) return "—";
  const s = (Date.now() - (typeof t === "string" ? Date.parse(t) : t)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
export const mb = (b: number | null | undefined) => (b == null ? "—" : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
export const tok = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
export const basename = (p: string) => p.split("/").pop() ?? p;
export const shortId = (ws: string) => ws.replace(/^((?:VID|SH)\d+)_.*/, "$1");

export const STATUS_LABEL: Record<string, string> = {
  none: "Not started", done: "Done", stale: "Out of date", partial: "In progress", running: "Running", failed: "Failed",
};

/** Copy that also works over plain http on the LAN, where navigator.clipboard is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
