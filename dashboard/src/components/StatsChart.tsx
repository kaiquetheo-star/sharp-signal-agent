import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AgentStats } from "../types";

interface Props {
  stats: AgentStats;
}

export function StatsChart({ stats }: Props) {
  const marketData = stats.byMarket.slice(0, 8).map((m) => ({
    name: m.market.length > 18 ? `${m.market.slice(0, 16)}…` : m.market,
    count: m.count,
  }));

  const timeline = stats.timeline.map((p, i) => ({
    i: i + 1,
    deviation: p.deviation,
    label: new Date(p.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-panel p-4">
        <h3 className="mb-3 text-sm font-medium text-white/70">Sinais por mercado</h3>
        {marketData.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">Sem dados ainda</p>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marketData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill="#9945FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-panel p-4">
        <h3 className="mb-3 text-sm font-medium text-white/70">Desvios ao longo do tempo</h3>
        {timeline.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">Sem dados ainda</p>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a1a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="deviation"
                  stroke="#14F195"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
