export const id = () => crypto.randomUUID();
export const now = () => Math.floor(Date.now() / 1000);
export async function rows<T>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): Promise<T[]> {
  const result = await db
    .prepare(query)
    .bind(...params)
    .all<T>();
  return result.results;
}
export async function one<T>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): Promise<T | null> {
  return db
    .prepare(query)
    .bind(...params)
    .first<T>();
}
export async function run(db: D1Database, query: string, ...params: unknown[]) {
  return db
    .prepare(query)
    .bind(...params)
    .run();
}
export async function audit(
  db: D1Database,
  org: string,
  user: string,
  action: string,
  resource?: string,
) {
  await run(
    db,
    "INSERT INTO audit_logs (id,organization_id,user_id,action,resource_id,created_at) VALUES (?,?,?,?,?,?)",
    id(),
    org,
    user,
    action,
    resource ?? null,
    now(),
  );
}
