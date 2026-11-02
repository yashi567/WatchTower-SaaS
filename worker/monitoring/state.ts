import type { MonitorStatus } from "../../shared/types";
export function transition(
  status: MonitorStatus,
  success: boolean,
  failures: number,
  successes: number,
  failureThreshold: number,
  recoveryThreshold: number,
): { status: MonitorStatus; failures: number; successes: number } {
  if (status === "paused") return { status, failures, successes };
  const f = success ? 0 : failures + 1,
    s = success ? successes + 1 : 0;
  return {
    status: success
      ? status === "down" && s < recoveryThreshold
        ? "down"
        : "operational"
      : f >= failureThreshold
        ? "down"
        : "degraded",
    failures: f,
    successes: s,
  };
}
export function uptime(successful: number, total: number) {
  return total > 0 ? (successful / total) * 100 : null;
}
export function percentile(sorted: number[], p: number) {
  return sorted.length
    ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
    : null;
}
export function nextCheck(at: number, interval: number) {
  return at + Math.max(300, interval);
}
export const incidentTransitions: Record<string, string[]> = {
  investigating: ["identified", "monitoring", "resolved"],
  identified: ["monitoring", "resolved"],
  monitoring: ["identified", "resolved"],
  resolved: [],
};
export function canTransition(from: string, to: string) {
  return incidentTransitions[from]?.includes(to) ?? false;
}
