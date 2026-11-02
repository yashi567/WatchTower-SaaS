import type { Role } from "./schemas";
export type MonitorStatus =
  "pending" | "operational" | "degraded" | "down" | "paused" | "unknown";
export interface Monitor {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  interval: number;
  timeout: number;
  expected_min: number;
  expected_max: number;
  failure_threshold: number;
  recovery_threshold: number;
  tags: string;
  alerts: number;
  status: MonitorStatus;
  successes: number;
  failures: number;
  last_checked: number | null;
  latency: number | null;
  last_error: string | null;
  next_check: number;
  claim_token: string | null;
  claim_until: number | null;
  created_at: number;
  updated_at: number;
  uptime?: number | null;
}
export interface Check {
  id: string;
  monitor_id: string;
  checked_at: number;
  success: number;
  status_code: number | null;
  latency: number;
  error: string | null;
  synthetic: number;
}
export interface Incident {
  id: string;
  organization_id: string;
  monitor_id: string | null;
  title: string;
  description: string;
  severity: "critical" | "major" | "minor";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  source: "system" | "manual";
  started_at: number;
  resolved_at: number | null;
  created_by: string | null;
  updated_by: string | null;
  monitor_name?: string;
}
export interface IncidentEvent {
  id: string;
  incident_id: string;
  status: string;
  message: string;
  created_at: number;
  actor_id: string | null;
}
export interface Workspace {
  id: string;
  name: string;
  role: Role;
  synthetic: number;
}
export interface Notification {
  id: string;
  organization_id: string;
  title: string;
  message: string;
  created_at: number;
  read: number;
  event_key: string;
  link: string;
}
export interface StatusPage {
  id: string;
  organization_id: string;
  title: string;
  slug: string;
  description: string;
  published: number;
  accent: string;
  monitorIds: string[];
}
export interface Analytics {
  summary: {
    total: number;
    successful: number;
    uptime: number | null;
    average: number | null;
    p50: number | null;
    p95: number | null;
    incidents: number;
    mttr: number | null;
  };
  series: {
    time: number;
    total: number;
    successful: number;
    average: number;
    uptime: number;
  }[];
  services: {
    id: string;
    name: string;
    total: number;
    successful: number;
    average: number | null;
    uptime: number | null;
  }[];
  range: string;
  since: number;
  synthetic: boolean;
}
