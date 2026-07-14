import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import type { AgentStats, DataSource, StoredSignal } from "../types";

const AGENT_WALLET = "5k9xj14xw3RCipeuv9XFWdd1o4ZpwMBjc55gRvEP1vvU";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SOLANA_RPC = "https://api.devnet.solana.com";
const LIVE_FETCH_TIMEOUT_MS = 1200;
const ONCHAIN_TIMEOUT_MS = 8_000;
const REFRESH_MS = 30_000;
const ONCHAIN_TX_LIMIT = 30;
const ONCHAIN_PARSE_LIMIT = 12;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const FIXTURE_NAMES: Record<string, string> = {
  "18193785": "USA vs Belgium",
  "18202783": "Switzerland vs Colombia",
  "18209181": "France vs Morocco",
  "18237038": "France vs Spain",
  "18143850": "Vietnam vs Myanmar",
  "18182808": "Australia vs Brazil",
  "18192996": "Mexico vs England",
};

const emptyStats: AgentStats = {
  totalSignals: 0,
  signalsToday: 0,
  maxDeviation: 0,
  fixturesMonitored: 0,
  byMarket: [],
  byFixture: [],
  timeline: [],
  wallet: AGENT_WALLET,
  network: "devnet",
  agentStatus: "offline",
};

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function getFixtureName(fixtureId: string): string {
  return FIXTURE_NAMES[fixtureId] || `Fixture ${fixtureId}`;
}

function computeStats(
  signals: StoredSignal[],
  base?: Partial<AgentStats>
): AgentStats {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const byMarket = new Map<string, number>();
  const byFixture = new Map<string, number>();
  let maxDeviation = 0;
  let deviationSum = 0;
  let deviationCount = 0;

  for (const s of signals) {
    byMarket.set(s.market, (byMarket.get(s.market) ?? 0) + 1);
    byFixture.set(s.fixtureId, (byFixture.get(s.fixtureId) ?? 0) + 1);
    const d = parseFloat(s.deviationPercent);
    if (!Number.isNaN(d)) {
      deviationSum += d;
      deviationCount += 1;
      if (d > maxDeviation) maxDeviation = d;
    }
  }

  return {
    totalSignals: signals.length,
    signalsToday: signals.filter((s) => s.timestamp >= todayMs).length,
    maxDeviation: Number(maxDeviation.toFixed(2)),
    averageDeviation:
      deviationCount > 0
        ? Number((deviationSum / deviationCount).toFixed(2))
        : 0,
    fixturesMonitored: byFixture.size,
    byMarket: [...byMarket.entries()]
      .map(([market, count]) => ({ market, count }))
      .sort((a, b) => b.count - a.count),
    byFixture: [...byFixture.entries()]
      .map(([fixtureId, count]) => ({ fixtureId, count }))
      .sort((a, b) => b.count - a.count),
    timeline: [...signals]
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((s) => ({
        t: s.timestamp,
        deviation: parseFloat(s.deviationPercent) || 0,
        market: s.market,
      })),
    wallet: base?.wallet ?? AGENT_WALLET,
    network: base?.network ?? "devnet",
    agentStatus: base?.agentStatus ?? "live",
  };
}

function toStoredSignal(
  raw: {
    fixtureId: string;
    fixtureName?: string;
    teams?: string;
    market: string;
    outcome: string;
    currentPrice: number;
    averagePrice: number | string;
    deviationPercent: string;
    timestamp: number;
    txSignature?: string;
    id?: string;
  },
  source: DataSource
): StoredSignal {
  const averagePrice =
    typeof raw.averagePrice === "number"
      ? raw.averagePrice
      : parseFloat(raw.averagePrice) || 0;
  const txSignature = raw.txSignature;
  return {
    id:
      raw.id ??
      `${raw.timestamp}-${raw.fixtureId}-${raw.outcome}-${raw.market}`,
    type: "SHARP_MOVEMENT",
    fixtureId: String(raw.fixtureId),
    market: raw.market,
    outcome: raw.outcome,
    currentPrice: raw.currentPrice,
    averagePrice,
    deviationPercent: String(raw.deviationPercent),
    timestamp: raw.timestamp,
    teams: raw.teams ?? raw.fixtureName ?? getFixtureName(String(raw.fixtureId)),
    txSignature,
    explorerUrl: txSignature ? explorerUrl(txSignature) : undefined,
    source,
  };
}

async function fetchLiveBackend(): Promise<{
  signals: StoredSignal[];
  stats: AgentStats;
} | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
  try {
    const [signalsRes, statsRes] = await Promise.all([
      fetch("/api/signals", { signal: controller.signal }),
      fetch("/api/stats", { signal: controller.signal }),
    ]);
    if (!signalsRes.ok || !statsRes.ok) return null;
    const signalsJson = (await signalsRes.json()) as {
      signals?: StoredSignal[];
      error?: string;
    };
    const statsJson = (await statsRes.json()) as AgentStats & { error?: string };
    if (signalsJson.error || statsJson.error || !Array.isArray(signalsJson.signals)) {
      return null;
    }
    const signals = (signalsJson.signals ?? []).map((s) => ({
      ...s,
      source: "live" as const,
      explorerUrl:
        s.explorerUrl ??
        (s.txSignature ? explorerUrl(s.txSignature) : undefined),
    }));
    return {
      signals,
      stats: {
        ...statsJson,
        wallet: statsJson.wallet ?? AGENT_WALLET,
        agentStatus: "live",
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeMemoData(data: string | Uint8Array | number[]): string | null {
  try {
    if (typeof data === "string") {
      try {
        return new TextDecoder().decode(bs58.decode(data));
      } catch {
        return data;
      }
    }
    const bytes =
      data instanceof Uint8Array ? data : Uint8Array.from(data as number[]);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function fetchOnChainSignals(): Promise<StoredSignal[]> {
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const walletPubkey = new PublicKey(AGENT_WALLET);

  const signatures = await connection.getSignaturesForAddress(walletPubkey, {
    limit: ONCHAIN_TX_LIMIT,
  });

  const signals: StoredSignal[] = [];

  for (const sigInfo of signatures.slice(0, ONCHAIN_PARSE_LIMIT)) {
    try {
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx) continue;

      for (const ix of tx.transaction.message.instructions) {
        const programId =
          "programId" in ix ? ix.programId.toBase58() : "";
        if (programId !== MEMO_PROGRAM_ID) continue;

        let memoText: string | null = null;
        if ("parsed" in ix && typeof ix.parsed === "string") {
          memoText = ix.parsed;
        } else if ("data" in ix && typeof ix.data === "string") {
          memoText = decodeMemoData(ix.data);
        }

        if (!memoText) continue;

        try {
          const parsed = JSON.parse(memoText) as {
            agent?: string;
            f?: string;
            m?: string;
            o?: string;
            p?: number;
            avg?: string | number;
            d?: string;
            t?: number;
          };
          if (parsed.agent !== "SharpSignalAgent" || !parsed.f || !parsed.t) {
            continue;
          }
          signals.push(
            toStoredSignal(
              {
                fixtureId: String(parsed.f),
                fixtureName: getFixtureName(String(parsed.f)),
                market: String(parsed.m ?? "unknown"),
                outcome: String(parsed.o ?? "unknown"),
                currentPrice: Number(parsed.p) || 0,
                averagePrice: parsed.avg ?? 0,
                deviationPercent: String(parsed.d ?? "0"),
                timestamp: Number(parsed.t),
                txSignature: sigInfo.signature,
              },
              "onchain"
            )
          );
        } catch {
          // not a SharpSignalAgent memo
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch tx ${sigInfo.signature}:`, err);
    }
  }

  return signals.sort((a, b) => b.timestamp - a.timestamp);
}

async function fetchDemoData(): Promise<{
  signals: StoredSignal[];
  stats: AgentStats;
}> {
  const response = await fetch("/demo-data.json");
  if (!response.ok) throw new Error("demo-data.json unavailable");
  const data = (await response.json()) as {
    signals: Array<{
      fixtureId: string;
      fixtureName?: string;
      market: string;
      outcome: string;
      currentPrice: number;
      averagePrice: string | number;
      deviationPercent: string;
      timestamp: number;
      txSignature: string;
    }>;
    stats?: {
      totalSignals?: number;
      fixturesMonitored?: number;
      maxDeviation?: string | number;
      averageDeviation?: string | number;
      agentWallet?: string;
      network?: string;
    };
  };

  const signals = (data.signals ?? []).map((s) =>
    toStoredSignal(
      {
        ...s,
        fixtureName: s.fixtureName,
      },
      "demo"
    )
  );

  const computed = computeStats(signals, {
    wallet: data.stats?.agentWallet ?? AGENT_WALLET,
    network: data.stats?.network ?? "devnet",
    agentStatus: "offline",
  });

  // Prefer recorded campaign totals when demo file includes them
  if (data.stats?.totalSignals && data.stats.totalSignals > computed.totalSignals) {
    computed.totalSignals = data.stats.totalSignals;
  }
  if (data.stats?.maxDeviation != null) {
    computed.maxDeviation = Number(data.stats.maxDeviation);
  }
  if (data.stats?.averageDeviation != null) {
    computed.averageDeviation = Number(data.stats.averageDeviation);
  }
  if (data.stats?.fixturesMonitored != null) {
    computed.fixturesMonitored = Number(data.stats.fixturesMonitored);
  }

  return { signals, stats: computed };
}

export function useSignals() {
  const [signals, setSignals] = useState<StoredSignal[]>([]);
  const [stats, setStats] = useState<AgentStats>(emptyStats);
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const liveModeRef = useRef(false);

  const mergeSignal = useCallback((signal: StoredSignal) => {
    setSignals((prev) => {
      const existing = prev.findIndex((s) => s.id === signal.id);
      let next: StoredSignal[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = {
          ...next[existing],
          ...signal,
          source: "live" as const,
        };
      } else {
        next = [
          { ...signal, source: "live" as const },
          ...prev,
        ].slice(0, 100);
      }
      setStats((prevStats) =>
        computeStats(next, { ...prevStats, agentStatus: "live" })
      );
      return next;
    });
  }, []);

  const applyDemo = useCallback(async () => {
    try {
      const demo = await fetchDemoData();
      setSignals(demo.signals);
      setStats(demo.stats);
      setDataSource("demo");
      setError(null);
      return true;
    } catch (err) {
      console.error("Failed to load demo data:", err);
      setError("Unable to load signal data");
      return false;
    }
  }, []);

  const tryUpgradeOnChain = useCallback(async () => {
    if (liveModeRef.current) return;
    try {
      const onchain = await withTimeout(
        fetchOnChainSignals(),
        ONCHAIN_TIMEOUT_MS,
        "on-chain fetch"
      );
      if (liveModeRef.current) return;
      if (onchain.length > 0) {
        setSignals(onchain);
        setStats(
          computeStats(onchain, {
            wallet: AGENT_WALLET,
            network: "devnet",
            agentStatus: "offline",
          })
        );
        setDataSource("onchain");
        setError(null);
      }
    } catch (err) {
      console.warn("On-chain fetch skipped:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    const connectWs = () => {
      if (!liveModeRef.current) return;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setError(null);
        setDataSource("live");
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
            if (msg.signals) {
              setSignals(
                msg.signals.map((s) => ({
                  ...s,
                  source: "live" as const,
                  explorerUrl:
                    s.explorerUrl ??
                    (s.txSignature ? explorerUrl(s.txSignature) : undefined),
                }))
              );
            }
            if (msg.stats) {
              setStats({
                ...msg.stats,
                wallet: msg.stats.wallet ?? AGENT_WALLET,
                agentStatus: "live",
              });
            }
            setDataSource("live");
            return;
          }

          if (msg.type === "signal" && msg.signal) {
            mergeSignal(msg.signal);
            setDataSource("live");
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!cancelled && liveModeRef.current) {
          retryTimer = setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    void (async () => {
      setLoading(true);

      // 1) Live agent backend (local) — only when API is actually up
      const live = await fetchLiveBackend();
      if (cancelled) return;

      if (live) {
        liveModeRef.current = true;
        setSignals(live.signals);
        setStats(live.stats);
        setDataSource("live");
        setError(null);
        setLoading(false);
        connectWs();
        return;
      }

      liveModeRef.current = false;

      // 2) Demo data first so the feed never stays empty on Vercel / offline backend
      await applyDemo();
      if (cancelled) return;
      setLoading(false);

      // 3) Optional upgrade from Solana Devnet memos (non-blocking, timed)
      void tryUpgradeOnChain();

      refreshTimer = setInterval(() => {
        if (!liveModeRef.current) {
          void tryUpgradeOnChain();
        }
      }, REFRESH_MS);
    })();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      wsRef.current?.close();
    };
  }, [applyDemo, mergeSignal, tryUpgradeOnChain]);

  const shortWallet = useMemo(() => {
    const w = stats.wallet ?? AGENT_WALLET;
    return `${w.slice(0, 4)}...${w.slice(-4)}`;
  }, [stats.wallet]);

  return {
    signals,
    stats,
    connected,
    error,
    shortWallet,
    loading,
    dataSource,
    live: dataSource === "live" && (connected || stats.agentStatus === "live"),
  };
}
