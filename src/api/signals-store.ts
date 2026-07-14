import fs from "fs";
import path from "path";

export interface StoredSignal {
  id: string;
  type: "SHARP_MOVEMENT";
  fixtureId: string;
  market: string;
  outcome: string;
  currentPrice: number;
  averagePrice: number;
  deviationPercent: string;
  timestamp: number;
  teams?: string;
  txSignature?: string;
  explorerUrl?: string;
}

const MAX_SIGNALS = 100;
const FILE_PATH = path.join(process.cwd(), "signals.json");

function readAll(): StoredSignal[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredSignal[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(signals: StoredSignal[]): void {
  fs.writeFileSync(FILE_PATH, JSON.stringify(signals.slice(0, MAX_SIGNALS), null, 2));
}

export function getSignals(limit = MAX_SIGNALS): StoredSignal[] {
  return readAll().slice(0, limit);
}

export function appendSignal(signal: StoredSignal): StoredSignal {
  const list = readAll();
  const idx = list.findIndex((s) => s.id === signal.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...signal };
  } else {
    list.unshift(signal);
  }
  writeAll(list);
  return signal;
}

export function getStats() {
  const signals = readAll();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const byMarket = new Map<string, number>();
  const byFixture = new Map<string, number>();
  let maxDeviation = 0;

  for (const s of signals) {
    byMarket.set(s.market, (byMarket.get(s.market) ?? 0) + 1);
    byFixture.set(s.fixtureId, (byFixture.get(s.fixtureId) ?? 0) + 1);
    const d = parseFloat(s.deviationPercent);
    if (!Number.isNaN(d) && d > maxDeviation) maxDeviation = d;
  }

  const signalsToday = signals.filter((s) => s.timestamp >= todayMs).length;

  return {
    totalSignals: signals.length,
    signalsToday,
    maxDeviation: Number(maxDeviation.toFixed(2)),
    fixturesMonitored: byFixture.size,
    byMarket: [...byMarket.entries()]
      .map(([market, count]) => ({ market, count }))
      .sort((a, b) => b.count - a.count),
    byFixture: [...byFixture.entries()]
      .map(([fixtureId, count]) => ({ fixtureId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    timeline: [...signals]
      .reverse()
      .map((s) => ({
        t: s.timestamp,
        deviation: parseFloat(s.deviationPercent) || 0,
        market: s.market,
      })),
    wallet: process.env.DASHBOARD_WALLET ?? null,
    network: process.env.NETWORK ?? "devnet",
    agentStatus: "live" as const,
  };
}
