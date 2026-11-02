import type { Env } from "../env";
function bounded(value: string, fallback: number, max: number) {
  const number = Number(value);
  return Math.min(
    max,
    Math.max(
      1,
      Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback,
    ),
  );
}
export function capacityLimits(
  env: Pick<
    Env,
    "MAX_WORKSPACE_MONITORS" | "MAX_GLOBAL_MONITORS" | "CHECK_BATCH_SIZE"
  >,
) {
  const batch = bounded(env.CHECK_BATCH_SIZE, 2, 2);
  return {
    batch,
    workspace: bounded(env.MAX_WORKSPACE_MONITORS, 5, 5),
    global: bounded(env.MAX_GLOBAL_MONITORS, 10, batch * 5),
  };
}
