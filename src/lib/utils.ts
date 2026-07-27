import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn class merge: conditional classes + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "3 hours ago" / "2 days ago" — the relative stamps on project + stage cards. */
export function relativeTime(value: string | Date): string {
  const then = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2592000],
    ["year", 31536000],
  ];
  let chosen: Intl.RelativeTimeFormatUnit = "minute";
  let divisor = 60;
  for (const [unit, secs] of units) {
    if (seconds >= secs) {
      chosen = unit;
      divisor = secs;
    }
  }
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return fmt.format(-Math.floor(seconds / divisor), chosen);
}
