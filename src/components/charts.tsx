import {
  AreaChart,
  Area,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type { Analytics } from "../../shared/types";
import { Empty } from "./common";
const tooltipStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text)",
};
const axis = {
  tick: { fill: "var(--muted)", fontSize: 10 },
  axisLine: false,
  tickLine: false,
};
const label = (v: number) =>
  new Date(v * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });
export function TrendChart({
  data,
  kind = "latency",
  height = 230,
}: {
  data: Analytics["series"];
  kind?: "latency" | "uptime";
  height?: number;
}) {
  if (!data.length)
    return (
      <Empty
        title="Waiting for measurements"
        description="Charts start with the first completed check. Missing periods are never counted as uptime."
      />
    );
  return (
    <div
      role="img"
      aria-label={`${kind === "latency" ? "Response time" : "Availability"} chart with ${data.length} measurement periods`}
      style={{ width: "100%", height, minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, left: -24, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={kind === "latency" ? "#818cf8" : "#34d399"}
                stopOpacity={0.2}
              />
              <stop
                offset="100%"
                stopColor={kind === "latency" ? "#818cf8" : "#34d399"}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            {...axis}
            dataKey="time"
            tickFormatter={(v) =>
              data.at(-1)!.time - data[0].time > 172800
                ? new Date(v * 1000).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : new Date(v * 1000).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
            }
            minTickGap={48}
          />
          <YAxis
            {...axis}
            domain={kind === "uptime" ? [95, 100] : [0, "auto"]}
            tickFormatter={(v) => (kind === "uptime" ? `${v}%` : `${v}`)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => label(Number(v))}
            formatter={(v) => [
              `${Number(v).toFixed(kind === "uptime" ? 2 : 0)}${kind === "uptime" ? "%" : " ms"}`,
              kind === "uptime" ? "Availability" : "Response time",
            ]}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey={kind === "latency" ? "average" : "uptime"}
            stroke={kind === "latency" ? "#818cf8" : "#34d399"}
            strokeWidth={2}
            fill={`url(#fill-${kind})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function MiniTrend({ values }: { values: number[] }) {
  return (
    <div className="mini-chart">
      <ResponsiveContainer width="100%" height={36}>
        <LineChart data={values.map((v, i) => ({ v, i }))}>
          <Line
            type="monotone"
            dataKey="v"
            stroke="currentColor"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ServiceChart({ data }: { data: Analytics["services"] }) {
  if (!data.length) return <Empty title="Add a monitor to compare services" />;
  return (
    <div className="chart-wrap" style={{ height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 16 }}>
          <CartesianGrid
            stroke="var(--border)"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            {...axis}
            dataKey="name"
            tickFormatter={(v) => String(v).split(" ")[0]}
          />
          <YAxis {...axis} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [
              `${Math.round(Number(v))} ms`,
              "Average response",
            ]}
          />
          <Bar
            dataKey="average"
            radius={[4, 4, 0, 0]}
            maxBarSize={42}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.id} fill={i % 2 ? "#5b61d6" : "#818cf8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
