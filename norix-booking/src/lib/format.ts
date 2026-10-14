import type { Business, Theme } from "./types";

export const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
};
export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
export const longDate = (k: string) =>
  fromKey(k).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
export const dayName = (k: string) => fromKey(k).toLocaleDateString("en-GB", { weekday: "long" });
export const fmtSlot = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "pm" : "am"}`;
};
export const cedi = (n: number) => `GH₵ ${Number(n).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;
export const timeIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(/\s/g, "");
export const dateKeyIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

/** Ghana number to the 9 digits after +233, or null */
export function normalisePhone(raw: string) {
  let p = raw.replace(/\D/g, "");
  if (p.startsWith("233")) p = p.slice(3);
  if (p.startsWith("0")) p = p.slice(1);
  return p.length === 9 ? p : null;
}

function luminance(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Turns a business theme into CSS variables for the booking pages */
export function themeVars(t: Theme): Record<string, string> {
  const dark = (t.mode ?? "dark") === "dark";
  const acc = t.accent ?? "#C9A45C";
  const surf = t.surface ?? (dark ? "#141210" : "#ffffff");
  return {
    "--b-accent": acc,
    "--b-accent-fg": luminance(acc) > 0.45 ? "#111111" : "#ffffff",
    "--b-surface": surf,
    "--b-fg": t.text ?? (dark ? "#F2EEE8" : "#16181b"),
    "--b-muted": dark ? "#A39B90" : "#686c73",
    "--b-line": dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)",
    "--b-radius": `${t.radius ?? 8}px`,
    "--b-subtle": `color-mix(in srgb, ${acc} ${dark ? 12 : 8}%, ${surf})`,
    "--b-soft": `color-mix(in srgb, ${acc} 25%, transparent)`,
    "--b-head": t.head ? `'${t.head}', Georgia, serif` : "Georgia, serif",
    "--b-body": t.body ? `'${t.body}', system-ui, -apple-system, 'Segoe UI', sans-serif` : "system-ui, -apple-system, sans-serif",
    colorScheme: dark ? "dark" : "light",
  };
}

export function fontHref(t: Theme) {
  const fams = [...new Set([t.head, t.body].filter(Boolean) as string[])];
  if (!fams.length) return null;
  return (
    "https://fonts.googleapis.com/css2?" +
    fams.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&") +
    "&display=swap"
  );
}

export function isDayOpen(b: Business, k: string, today: string, closedDates: string[] = []) {
  const s = b.settings;
  if (k < today) return false;
  if (k > addDays(today, s.book_ahead_days ?? 60)) return false;
  if (closedDates.includes(k)) return false;
  const dow = fromKey(k).getDay();
  if (s.weekly) return (s.weekly[String(dow)] ?? []).length > 0;
  return !(s.closed_days ?? []).includes(dow);
}

/** Seatings for a weekday, from weekly hours or the default list */
export function sittingsFor(b: Business, k: string) {
  const s = b.settings;
  const dow = fromKey(k).getDay();
  if (s.weekly) return s.weekly[String(dow)] ?? [];
  return (s.closed_days ?? []).includes(dow) ? [] : s.sittings ?? [];
}
