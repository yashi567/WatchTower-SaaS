import { z } from "zod";
export function validateTarget(raw: string, approved: string): URL {
  const url = new URL(raw);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Use HTTP/HTTPS on standard ports without credentials or fragments",
    );
  const host = url.hostname.toLowerCase();
  if (
    host.endsWith(".") ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(localhost|local|internal|test|invalid|onion|arpa)$/.test(host)
  )
    throw new Error(
      "Use a public DNS hostname; IP literals and internal names are not allowed",
    );
  if (
    !approved
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(host)
  )
    throw new Error(
      "This hostname needs deployment operator approval before it can be monitored",
    );
  return url;
}
export function publicIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b, c] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 &&
      (b === 168 || b === 0 || b === 2 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function publicIPv6(ip: string) {
  // Conservative: only globally routable 2000::/3; reject documentation and special ranges.
  const [first, second] = ip.split(":").map((part) => parseInt(part, 16));
  return (
    /^[23][0-9a-f]{3}:/i.test(ip) &&
    first !== 0x2002 &&
    first !== 0x3fff &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
  );
}
const dnsSchema = z.object({
  Status: z.number(),
  Answer: z.array(z.object({ type: z.number(), data: z.string() })).optional(),
});
export async function validateDNS(host: string, fetcher: typeof fetch = fetch) {
  const results = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const r = await fetcher(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        },
      );
      if (!r.ok) throw new Error("DNS validation unavailable");
      return dnsSchema.parse(await r.json());
    }),
  );
  let addresses = 0;
  for (const result of results) {
    if (result.Status !== 0) throw new Error("Hostname did not resolve safely");
    for (const record of result.Answer ?? []) {
      if (record.type === 1 || record.type === 28) {
        addresses++;
        if (
          !(record.type === 1
            ? publicIPv4(record.data)
            : publicIPv6(record.data))
        )
          throw new Error("DNS resolves to a non-public address");
      } else if (record.type !== 5) throw new Error("Unexpected DNS record");
    }
  }
  if (!addresses) throw new Error("No public destination addresses");
}
export function validateDiscord(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "discord.com" ||
    u.port ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    !/^\/api\/webhooks\/\d{16,22}\/[A-Za-z0-9_-]{50,150}$/.test(u.pathname)
  )
    throw new Error("Use a valid https://discord.com/api/webhooks/… URL");
  return u.toString();
}
