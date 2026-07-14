import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStats, StoredSignal } from "../types";

const emptyStats: AgentStats = {
  totalSignals: 0,
  signalsToday: 0,
  maxDeviation: 0,
  fixturesMonitored: 0,
  byMarket: [],
  byFixture: [],
  timeline: [],
  wallet: null,
  network: "devnet",
  agentStatus: "offline",
};

function computeStats(signals: StoredSignal[], base?: AgentStats): AgentStats {
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

  return {
    totalSignals: signals.length,
    signalsToday: signals.filter((s) => s.timestamp >= todayMs).length,
    maxDeviation: Number(maxDeviation.toFixed(2)),
    fixturesMonitored: byFixture.size,
    byMarket: [...byMarket.entries()]
      .map(([market, count]) => ({ market, count }))
      .sort((a, b) => b.count - a.count),
    byFixture: [...byFixture.entries()]
      .map(([fixtureId, count]) => ({ fixtureId, count }))
      .sort((a, b) => b.count - a.count),
    timeline: [...signals]
      .reverse()
      .map((s) => ({
        t: s.timestamp,
        deviation: parseFloat(s.deviationPercent) || 0,
        market: s.market,
      })),
    wallet: base?.wallet ?? null,
    network: base?.network ?? "devnet",
    agentStatus: base?.agentStatus ?? "live",
  };
}

export function useSignals() {
  const [signals, setSignals] = useState<StoredSignal[]>([]);
  const [stats, setStats] = useState<AgentStats>(emptyStats);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const mergeSignal = useCallback((signal: StoredSignal) => {
    setSignals((prev) => {
      const existing = prev.findIndex((s) => s.id === signal.id);
      let next: StoredSignal[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = { ...next[existing], ...signal };
      } else {
        next = [signal, ...prev].slice(0, 100);
      }
      setStats((prevStats) => computeStats(next, { ...prevStats, agentStatus: "live" }));
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const loadRest = async () => {
      try {
        const [signalsRes, statsRes] = await Promise.all([
          fetch("/api/signals"),
          fetch("/api/stats"),
        ]);
        if (!signalsRes.ok || !statsRes.ok) throw new Error("API offline");
        const signalsJson = (await signalsRes.json()) as { signals: StoredSignal[] };
        const statsJson = (await statsRes.json()) as AgentStats;
        if (cancelled) return;
        setSignals(signalsJson.signals ?? []);
        setStats({ ...statsJson, agentStatus: "live" });
        setError(null);
      } catch {
        if (!cancelled) {
          setError("Backend offline — inicie npm run start");
          setStats((s) => ({ ...s, agentStatus: "offline" }));
        }
      }
    };

    const connectWs = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            signal?: StoredSignal;
            signals?: StoredSignal[];
            stats?: AgentStats;
          };

          if (msg.type === "hello") {
            if (msg.signals) setSignals(msg.signals);
            if (msg.stats) setStats({ ...msg.stats, agentStatus: "live" });
            return;
          }

          if (msg.type === "signal" && msg.signal) {
            mergeSignal(msg.signal);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setStats((s) => ({ ...s, agentStatus: "offline" }));
        if (!cancelled) {
          retryTimer = setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    void loadRest();
    connectWs();

    const poll = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        void loadRest();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [mergeSignal]);

  const shortWallet = useMemo(() => {
    const w = stats.wallet;
    if (!w) return "—";
    return `${w.slice(0, 4)}...${w.slice(-4)}`;
  }, [stats.wallet]);

  return {
    signals,
    stats,
    connected,
    error,
    shortWallet,
    live: connected || stats.agentStatus === "live",
  };
}
