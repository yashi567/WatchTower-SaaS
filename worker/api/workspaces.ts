import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import { authenticated, scoped, permit, rateLimit } from "../middleware/access";
import { id, now, one, rows, run, audit } from "../db/queries";
import { workspaceSchema, invitationSchema } from "../../shared/schemas";
export async function hashToken(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export const workspaces = new Hono<AppEnv>();
workspaces.use("*", authenticated);
workspaces.get("/", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT o.id,o.name,o.synthetic,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=? AND o.synthetic=0 ORDER BY o.created_at",
      c.get("user").id,
    ),
  }),
);
workspaces.post("/", async (c) => {
  const data = workspaceSchema.parse(await c.req.json()),
    org = id(),
    user = c.get("user").id;
  await rateLimit(c.env.DB, `workspace:${user}`, 5, 86400);
  const count = await one<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) n FROM memberships WHERE user_id=?",
    user,
  );
  if ((count?.n ?? 0) >= 5)
    throw new HTTPException(409, {
      message: "Maximum five workspaces per user",
    });
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)",
    ).bind(org, data.name, now()),
    c.env.DB.prepare(
      "INSERT INTO memberships (organization_id,user_id,role,created_at) VALUES (?,?,'owner',?)",
    ).bind(org, user, now()),
  ]);
  return c.json(
    { data: { id: org, name: data.name, role: "owner", synthetic: 0 } },
    201,
  );
});
workspaces.post("/accept-invitation", async (c) => {
  const { token } = z
    .object({ token: z.string().min(32).max(200) })
    .parse(await c.req.json());
  await rateLimit(c.env.DB, `accept:${c.get("user").id}`, 10, 3600);
  const invitation = await one<{
    id: string;
    organization_id: string;
    email: string;
    role: string;
    expires_at: number;
    accepted_at: number | null;
  }>(
    c.env.DB,
    "SELECT * FROM invitations WHERE token_hash=?",
    await hashToken(token),
  );
  if (
    !invitation ||
    invitation.expires_at < now() ||
    invitation.accepted_at ||
    invitation.email.toLowerCase() !== c.get("user").email.toLowerCase()
  )
    throw new HTTPException(400, {
      message:
        "Invitation is expired, already used, or belongs to another email",
    });
  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO memberships (organization_id,user_id,role,created_at) SELECT organization_id,?,role,? FROM invitations WHERE id=? AND accepted_at IS NULL AND expires_at>?",
    ).bind(c.get("user").id, at, invitation.id, at),
    c.env.DB.prepare(
      "UPDATE invitations SET accepted_at=? WHERE id=? AND accepted_at IS NULL",
    ).bind(at, invitation.id),
  ]);
  return c.json({ data: { workspaceId: invitation.organization_id } });
});
workspaces.use(
  "/:id/*",
  async (c, next) => {
    if (c.req.header("X-Workspace-Id") !== c.req.param("id"))
      throw new HTTPException(400, {
        message: "Workspace does not match selection",
      });
    await next();
  },
  scoped,
);
workspaces.get("/:id/members", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT u.id,u.name,u.email,u.image,m.role,m.notifications,m.created_at FROM memberships m JOIN user u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.created_at",
      c.get("workspaceId"),
    ),
  }),
);
workspaces.get("/:id/invitations", permit("manage"), async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT id,email,role,expires_at,accepted_at FROM invitations WHERE organization_id=? ORDER BY created_at DESC LIMIT 50",
      c.get("workspaceId"),
    ),
  }),
);
workspaces.post("/:id/invitations", permit("manage"), async (c) => {
  const data = invitationSchema.parse(await c.req.json());
  if (c.get("role") === "admin" && data.role === "admin")
    throw new HTTPException(403, { message: "Only owners can invite admins" });
  await rateLimit(c.env.DB, `invite:${c.get("workspaceId")}`, 20, 86400);
  const count = await one<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) n FROM memberships WHERE organization_id=?",
    c.get("workspaceId"),
  );
  if ((count?.n ?? 0) >= 20)
    throw new HTTPException(409, {
      message: "Workspace member capacity reached",
    });
  const token = crypto.randomUUID() + crypto.randomUUID();
  await run(
    c.env.DB,
    "INSERT INTO invitations (id,organization_id,email,role,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?)",
    id(),
    c.get("workspaceId"),
    data.email,
    data.role,
    await hashToken(token),
    now() + 7 * 86400,
    now(),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "invitation.created",
  );
  return c.json(
    {
      data: {
        url: `${c.env.APP_URL}/invite/${token}`,
        expiresAt: now() + 7 * 86400,
      },
    },
    201,
  );
});
workspaces.delete(
  "/:id/invitations/:invitationId",
  permit("manage"),
  async (c) => {
    await run(
      c.env.DB,
      "DELETE FROM invitations WHERE id=? AND organization_id=?",
      c.req.param("invitationId"),
      c.get("workspaceId"),
    );
    return c.json({ data: { deleted: true } });
  },
);
workspaces.patch("/:id/members/:userId", permit("manage"), async (c) => {
  const { role } = z
    .object({ role: z.enum(["admin", "member", "viewer"]) })
    .parse(await c.req.json());
  const target = await one<{ role: string }>(
    c.env.DB,
    "SELECT role FROM memberships WHERE organization_id=? AND user_id=?",
    c.get("workspaceId"),
    c.req.param("userId"),
  );
  if (!target) throw new HTTPException(404);
  if (
    target.role === "owner" ||
    (c.get("role") === "admin" && (target.role === "admin" || role === "admin"))
  )
    throw new HTTPException(403, {
      message: "Only owners can manage admins; ownership requires a transfer",
    });
  await run(
    c.env.DB,
    "UPDATE memberships SET role=? WHERE organization_id=? AND user_id=?",
    role,
    c.get("workspaceId"),
    c.req.param("userId"),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "member.role_changed",
    c.req.param("userId"),
  );
  return c.json({ data: { updated: true } });
});
workspaces.delete("/:id/members/:userId", permit("manage"), async (c) => {
  const target = await one<{ role: string }>(
    c.env.DB,
    "SELECT role FROM memberships WHERE organization_id=? AND user_id=?",
    c.get("workspaceId"),
    c.req.param("userId"),
  );
  if (!target) throw new HTTPException(404);
  if (
    target.role === "owner" ||
    (c.get("role") === "admin" && target.role === "admin")
  )
    throw new HTTPException(403, {
      message: "This member cannot be removed by your role",
    });
  await run(
    c.env.DB,
    "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
    c.get("workspaceId"),
    c.req.param("userId"),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "member.removed",
    c.req.param("userId"),
  );
  return c.json({ data: { deleted: true } });
});
workspaces.patch("/:id/preferences", async (c) => {
  const { notifications } = z
    .object({ notifications: z.boolean() })
    .parse(await c.req.json());
  await run(
    c.env.DB,
    "UPDATE memberships SET notifications=? WHERE organization_id=? AND user_id=?",
    +notifications,
    c.get("workspaceId"),
    c.get("user").id,
  );
  if (!notifications)
    await run(
      c.env.DB,
      "INSERT OR IGNORE INTO notification_reads(notification_id,user_id) SELECT id,? FROM notifications WHERE organization_id=?",
      c.get("user").id,
      c.get("workspaceId"),
    );
  return c.json({ data: { notifications } });
});
workspaces.patch("/:id", scoped, permit("own"), async (c) => {
  if (c.req.param("id") !== c.get("workspaceId")) throw new HTTPException(400);
  const data = workspaceSchema.parse(await c.req.json());
  await run(
    c.env.DB,
    "UPDATE organizations SET name=? WHERE id=?",
    data.name,
    c.get("workspaceId"),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "workspace.updated",
  );
  return c.json({ data: { updated: true } });
});
workspaces.post("/:id/transfer", permit("own"), async (c) => {
  const { userId } = z.object({ userId: z.string() }).parse(await c.req.json());
  if (userId === c.get("user").id)
    throw new HTTPException(400, {
      message: "Select another workspace member",
    });
  const target = await one(
    c.env.DB,
    "SELECT user_id FROM memberships WHERE organization_id=? AND user_id=?",
    c.get("workspaceId"),
    userId,
  );
  if (!target) throw new HTTPException(404);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=? AND role='owner'",
    ).bind(c.get("workspaceId"), c.get("user").id),
    c.env.DB.prepare(
      "UPDATE memberships SET role='owner' WHERE organization_id=? AND user_id=?",
    ).bind(c.get("workspaceId"), userId),
  ]);
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "workspace.ownership_transferred",
    userId,
  );
  return c.json({ data: { updated: true } });
});
workspaces.delete("/:id", scoped, permit("own"), async (c) => {
  if (c.req.param("id") !== c.get("workspaceId")) throw new HTTPException(400);
  const { confirmation } = z
    .object({ confirmation: z.literal("DELETE") })
    .parse(await c.req.json());
  if (confirmation === "DELETE")
    await run(
      c.env.DB,
      "DELETE FROM organizations WHERE id=?",
      c.get("workspaceId"),
    );
  return c.json({ data: { deleted: true } });
});
