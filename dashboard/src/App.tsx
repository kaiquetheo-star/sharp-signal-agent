import { SignalsFeed } from "./components/SignalsFeed";
import { StatsChart } from "./components/StatsChart";
import { useSignals } from "./hooks/useSignals";
import type { DataSource } from "./types";

export default function App() {
  const {
    signals,
    stats,
    live,
    error,
    shortWallet,
    loading,
    dataSource,
  } = useSignals();

  return (
    <div className="min-h-screen bg-ink">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-solana">
              TxLINE · Track 1
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              Sharp Signal Agent
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DataSourceBadge source={dataSource} live={live} />
            <span className="rounded-full border border-white/10 bg-panel px-3 py-1 font-mono text-xs text-white/70">
              {shortWallet}
            </span>
            <span className="rounded-full border border-white/10 bg-panel px-3 py-1 text-xs uppercase text-white/50">
              {stats.network}
            </span>
          </div>
        </div>
        {error && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
            {error}
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-sm font-medium text-white/80">
              Signal feed
            </h2>
            <span className="font-mono text-xs text-white/40">
              {signals.length} signals
            </span>
          </div>
          <SignalsFeed signals={signals} loading={loading} />
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Total signals" value={String(stats.totalSignals)} />
            <Metric
              label="Avg deviation"
              value={`${stats.averageDeviation ?? "—"}%`}
            />
            <Metric
              label="Max deviation"
              value={`${stats.maxDeviation}%`}
              accent
            />
            <Metric
              label="Fixtures monitored"
              value={String(stats.fixturesMonitored)}
            />
          </div>
          <StatsChart stats={stats} />
        </section>
      </main>
    </div>
  );
}

function DataSourceBadge({
  source,
  live,
}: {
  source: DataSource;
  live: boolean;
}) {
  if (source === "live" && live) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
        <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
        LIVE AGENT
      </span>
    );
  }

  if (source === "onchain") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-medium text-signal">
        <span className="h-2 w-2 rounded-full bg-signal" />
        LIVE ON-CHAIN
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
      <span className="h-2 w-2 rounded-full bg-amber-300" />
      DEMO DATA
    </span>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-panel p-4">
      <p className="text-xs text-white/45">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold ${
          accent ? "text-solana" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
