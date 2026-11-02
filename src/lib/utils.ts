import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const percent = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(2)}%`;
export const ms = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString()} ms`;
export function relative(at: number | null | undefined) {
  if (!at) return "Not checked yet";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - at);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
export const date = (at: number) =>
  new Date(at * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const duration = (s: number | null | undefined) =>
  s == null
    ? "—"
    : s < 60
      ? `${Math.round(s)}s`
      : s < 3600
        ? `${Math.round(s / 60)}m`
        : `${(s / 3600).toFixed(1)}h`;
