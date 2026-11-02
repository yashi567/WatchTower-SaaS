import type { Env } from "../env";
import { id, now, rows, run } from "../db/queries";
import { validateDiscord } from "../monitoring/security";
async function aesKey(secret: string) {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  if (bytes.length !== 32)
    throw new Error(
      "CHANNEL_ENCRYPTION_KEY must contain 32 base64-encoded bytes",
    );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(secret),
    new TextEncoder().encode(value),
  );
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}
export async function decrypt(value: string, secret: string) {
  const [a, b] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(atob(a), (c) => c.charCodeAt(0)) },
      await aesKey(secret),
      Uint8Array.from(atob(b), (c) => c.charCodeAt(0)),
    ),
  );
}
export async function notify(
  db: D1Database,
  org: string,
  eventKey: string,
  title: string,
  message: string,
  link: string,
  targetChannelId?: string,
) {
  const notificationId = id();
  const insert = db
    .prepare(
      "INSERT OR IGNORE INTO notifications (id,organization_id,event_key,title,message,link,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(notificationId, org, eventKey, title, message, link, now());
  if (targetChannelId)
    await db.batch([
      insert,
      db
        .prepare(
          "DELETE FROM notification_deliveries WHERE notification_id=? AND channel_id!=?",
        )
        .bind(notificationId, targetChannelId),
    ]);
  else await insert.run();
}
export async function deliverPending(
  env: Env,
  fetcher: typeof fetch = fetch,
  at = now(),
) {
  if (!env.CHANNEL_ENCRYPTION_KEY) return { sent: 0, failed: 0 };
  const lease = id();
  const claimed = await rows<{
    id: string;
    notification_id: string;
    channel_id: string;
    attempts: number;
  }>(
    env.DB,
    `UPDATE notification_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id IN (SELECT d.id FROM notification_deliveries d JOIN notification_channels c ON c.id=d.channel_id WHERE c.enabled=1 AND d.status='pending' AND d.attempts<4 AND d.next_attempt<=? AND (d.lease_until IS NULL OR d.lease_until<=?) LIMIT 1) RETURNING id,notification_id,channel_id,attempts`,
    lease,
    at + 60,
    at,
    at,
  );
  let sent = 0,
    failed = 0;
  for (const d of claimed) {
    const data = await env.DB.prepare(
      "SELECT c.kind,c.encrypted_destination,n.title,n.message,n.event_key FROM notification_channels c JOIN notifications n ON n.id=? WHERE c.id=?",
    )
      .bind(d.notification_id, d.channel_id)
      .first<{
        kind: string;
        encrypted_destination: string;
        title: string;
        message: string;
        event_key: string;
      }>();
    if (!data) continue;
    try {
      const destination = await decrypt(
        data.encrypted_destination,
        env.CHANNEL_ENCRYPTION_KEY,
      );
      let response: Response;
      if (data.kind === "discord")
        response = await fetcher(validateDiscord(destination), {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allowed_mentions: { parse: [] },
            embeds: [
              {
                title: data.title,
                description: data.message,
                color: 0x6366f1,
                footer: { text: `WatchTower · ${data.event_key}` },
              },
            ],
          }),
        });
      else {
        if (!env.RESEND_API_KEY || !env.RESEND_FROM)
          throw new Error("Email delivery is not configured");
        response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Idempotency-Key": d.id,
          },
          body: JSON.stringify({
            from: env.RESEND_FROM,
            to: destination,
            subject: data.title,
            text: data.message,
          }),
        });
      }
      const status = response.status;
      await response.body?.cancel();
      if (!response.ok) {
        const transient = status === 429 || status >= 500;
        throw new DeliveryError(`Provider returned HTTP ${status}`, transient);
      }
      await run(
        env.DB,
        "UPDATE notification_deliveries SET status='delivered',delivered_at=?,last_error=NULL,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?",
        at,
        d.id,
        lease,
      );
      sent++;
    } catch (error) {
      const retry =
        d.attempts < 4 && (!(error instanceof DeliveryError) || error.retry);
      await run(
        env.DB,
        "UPDATE notification_deliveries SET status=?,last_error=?,next_attempt=?,lease_until=NULL,lease_token=NULL WHERE id=? AND lease_token=?",
        retry ? "pending" : "failed",
        error instanceof DeliveryError
          ? error.message
          : "Delivery failed; check provider configuration",
        at + Math.min(3600, 60 * 2 ** d.attempts),
        d.id,
        lease,
      );
      failed++;
    }
  }
  return { sent, failed };
}
class DeliveryError extends Error {
  constructor(
    message: string,
    public retry: boolean,
  ) {
    super(message);
  }
}
