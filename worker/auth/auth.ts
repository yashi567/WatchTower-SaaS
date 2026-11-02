import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../env";
export function authConfigured(env: Env) {
  return !!(
    env.BETTER_AUTH_SECRET &&
    env.BETTER_AUTH_SECRET.length >= 32 &&
    env.GITHUB_CLIENT_ID &&
    env.GITHUB_CLIENT_SECRET
  );
}
export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Authentication is not configured");
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema,
    }),
    trustedOrigins: [env.APP_URL],
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
              scope: ["user:email"],
            },
          }
        : {},
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { encryptOAuthTokens: true },
    advanced: { useSecureCookies: env.APP_URL.startsWith("https://") },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
    },
  });
}
