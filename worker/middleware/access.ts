import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import type { Role } from "../../shared/schemas";
import { authConfigured, createAuth } from "../auth/auth";
import { now, one } from "../db/queries";
export type Permission = "read" | "operate" | "manage" | "own";
export function allowed(role: Role, permission: Permission) {
  return (
    permission === "read" ||
    (permission === "operate" && ["owner", "admin", "member"].includes(role)) ||
    (permission === "manage" && ["owner", "admin"].includes(role)) ||
    (permission === "own" && role === "owner")
  );
}
export const authenticated = createMiddleware<AppEnv>(async (c, next) => {
  if (!authConfigured(c.env))
    throw new HTTPException(503, {
      message: "GitHub sign-in is not configured. Explore the read-only demo.",
    });
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session)
    throw new HTTPException(401, { message: "Sign in to continue" });
  c.set("user", session.user);
  await next();
});
export const scoped = createMiddleware<AppEnv>(async (c, next) => {
  const org = c.req.header("X-Workspace-Id");
  if (!org) throw new HTTPException(400, { message: "Select a workspace" });
  const member = await one<{ role: Role; synthetic: number }>(
    c.env.DB,
    "SELECT m.role,o.synthetic FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?",
    org,
    c.get("user").id,
  );
  if (!member || member.synthetic)
    throw new HTTPException(404, { message: "Workspace not found" });
  c.set("workspaceId", org);
  c.set("role", member.role);
  await next();
});
export const permit = (permission: Permission) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!allowed(c.get("role"), permission))
      throw new HTTPException(403, {
        message: "Your role does not permit this action",
      });
    await next();
  });
export async function rateLimit(
  db: D1Database,
  key: string,
  limit: number,
  seconds: number,
) {
  const at = now();
  const result = await db
    .prepare(
      "INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count",
    )
    .bind(key, at + seconds, at, at)
    .first<{ count: number }>();
  if (!result || result.count > limit)
    throw new HTTPException(429, {
      message: "Too many requests. Please try again shortly.",
    });
}
