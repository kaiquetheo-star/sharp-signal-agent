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

export interface AgentStats {
  totalSignals: number;
  signalsToday: number;
  maxDeviation: number;
  fixturesMonitored: number;
  byMarket: Array<{ market: string; count: number }>;
  byFixture: Array<{ fixtureId: string; count: number }>;
  timeline: Array<{ t: number; deviation: number; market: string }>;
  wallet: string | null;
  network: string;
  agentStatus: "live" | "offline";
}
