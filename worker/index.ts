import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import type { AppEnv, Env } from "./env";
import { authConfigured, createAuth } from "./auth/auth";
import { authenticated, scoped, rateLimit } from "./middleware/access";
import { workspaces } from "./api/workspaces";
import { read } from "./api/read";
import { write } from "./api/write";
import { publicApi } from "./api/public";
import { runMonitoring, cleanup } from "./monitoring/engine";
import { deliverPending } from "./notifications/delivery";
export const app = new Hono<AppEnv>();
app.use(
  "/api/*",
  secureHeaders(),
  bodyLimit({
    maxSize: 32768,
    onError: (c) =>
      c.json(
        {
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request is too large" },
        },
        413,
      ),
  }),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (!origin || origin !== new URL(c.env.APP_URL).origin)
      throw new HTTPException(403, {
        message: "Request origin is not permitted",
      });
    if (!c.req.header("Content-Type")?.startsWith("application/json"))
      throw new HTTPException(415, { message: "Use application/json" });
  }
  await next();
});
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({
    data: {
      status: "ok",
      authConfigured: authConfigured(c.env),
      version: "1.0.0",
    },
  });
});
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!authConfigured(c.env))
    return c.json(
      {
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message:
            "GitHub OAuth is not configured. The demo is available without sign-in.",
        },
      },
      503,
    );
  return createAuth(c.env).handler(c.req.raw);
});
app.route("/api/public", publicApi);
const demo = new Hono<AppEnv>();
demo.use("*", async (c, next) => {
  if (c.req.method !== "GET")
    throw new HTTPException(403, {
      message: "The synthetic demo is read-only",
    });
  c.set("workspaceId", "demo");
  c.set("role", "viewer");
  c.set("user", { id: "demo-visitor", name: "Demo visitor", email: "" });
  await next();
});
demo.route("/", read);
app.route("/api/demo", demo);
app.route("/api/workspaces", workspaces);
const privateApi = new Hono<AppEnv>();
privateApi.use("*", authenticated, scoped);
privateApi.use("*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method))
    await rateLimit(
      c.env.DB,
      `write:${c.get("workspaceId")}:${c.get("user").id}`,
      60,
      60,
    );
  await next();
});
privateApi.route("/", read);
privateApi.route("/", write);
app.route("/api", privateApi);
app.notFound((c) =>
  c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found",
      },
    },
    404,
  ),
);
app.onError((error, c) => {
  if (error instanceof SyntaxError)
    return c.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Provide a valid JSON request body",
        },
      },
      400,
    );
  if (error instanceof ZodError)
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(";"),
          issues: error.issues,
        },
      },
      422,
    );
  if (error instanceof HTTPException)
    return c.json(
      {
        error: {
          code: `HTTP_${error.status}`,
          message: error.message || "Request failed",
        },
      },
      error.status,
    );
  const reference = crypto.randomUUID();
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Member capacity reached"))
    return c.json(
      {
        error: {
          code: "CAPACITY_REACHED",
          message: "Workspace member capacity reached",
        },
      },
      409,
    );
  if (/(?:D1|SQLITE).*(?:limit|quota|exceeded)/i.test(message))
    return c.json(
      {
        error: {
          code: "CAPACITY_REACHED",
          message:
            "Service capacity is temporarily exhausted. Try again later.",
        },
      },
      503,
    );
  if (message.includes("UNIQUE constraint failed"))
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "This record already exists. Try another value.",
        },
      },
      409,
    );
  console.error(
    JSON.stringify({
      event: "api_error",
      reference,
      path: c.req.path,
      message: message.replace(/https?:\/\/\S+/g, "[redacted]"),
    }),
  );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please retry.",
        reference,
      },
    },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const at = Math.floor(Date.now() / 1000);
    const checks = await runMonitoring(env, at);
    const delivery = await deliverPending(env, fetch, at);
    await cleanup(env.DB, at);
    console.log(
      JSON.stringify({ event: "scheduled_complete", ...checks, ...delivery }),
    );
  },
} satisfies ExportedHandler<Env>;
