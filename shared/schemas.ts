import { z } from "zod";
export const roles = ["owner", "admin", "member", "viewer"] as const;
export type Role = (typeof roles)[number];
export const incidentStates = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
] as const;
export const monitorSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    url: z.url().max(2048),
    method: z.enum(["GET", "HEAD"]).default("GET"),
    interval: z
      .union([
        z.literal(300),
        z.literal(600),
        z.literal(900),
        z.literal(1800),
        z.literal(3600),
      ])
      .default(300),
    timeout: z.number().int().min(1000).max(10000).default(8000),
    expectedMin: z.number().int().min(100).max(599).default(200),
    expectedMax: z.number().int().min(100).max(599).default(299),
    failureThreshold: z.number().int().min(1).max(5).default(3),
    recoveryThreshold: z.number().int().min(1).max(5).default(2),
    tags: z.array(z.string().trim().min(1).max(24)).max(5).default([]),
    alerts: z.boolean().default(true),
  })
  .refine((v) => v.expectedMax >= v.expectedMin, {
    message: "Maximum status must be at least the minimum",
    path: ["expectedMax"],
  });
export type MonitorInput = z.infer<typeof monitorSchema>;
export const incidentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(""),
  monitorId: z.string().nullable().optional(),
  severity: z.enum(["critical", "major", "minor"]).default("major"),
});
export const incidentUpdateSchema = z.object({
  status: z.enum(incidentStates),
  message: z.string().trim().min(3).max(2000),
});
export const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(60),
});
export const invitationSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  role: z.enum(["admin", "member", "viewer"]),
});
export const pageSchema = z.object({
  title: z.string().trim().min(3).max(80),
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).default(""),
  published: z.boolean().default(false),
  accent: z.enum(["indigo", "emerald", "blue"]).default("indigo"),
  monitorIds: z
    .array(z.string())
    .max(5)
    .refine((a) => new Set(a).size === a.length, "Duplicate monitors"),
});
export const channelSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["discord", "email"]),
  destination: z.string().max(500),
  enabled: z.boolean().default(true),
});
