import type { Role } from "../shared/schemas";
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  ENVIRONMENT: string;
  BETTER_AUTH_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  CHANNEL_ENCRYPTION_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  APPROVED_MONITOR_HOSTS: string;
  MAX_WORKSPACE_MONITORS: string;
  MAX_GLOBAL_MONITORS: string;
  CHECK_BATCH_SIZE: string;
}
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: { id: string; name: string; email: string };
    workspaceId: string;
    role: Role;
  };
};
