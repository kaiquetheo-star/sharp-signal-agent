export interface SharpSignal {
  type: "SHARP_MOVEMENT";
  fixtureId: string;
  market: string;
  outcome: string;
  currentPrice: number;
  averagePrice: number;
  deviationPercent: string;
  timestamp: number;
}

export interface SharpDetectorOptions {
  windowSize?: number;
  threshold?: number;
  cooldownMs?: number;
  minSamples?: number;
}

/**
 * Sliding-window percentage deviation detector for sharp money moves.
 * Default: window=10, min samples=5, threshold=3%, cooldown=60s per market key.
 */
export class SharpDetector {
  private history = new Map<string, number[]>();
  private cooldowns = new Map<string, number>();
  private readonly windowSize: number;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly minSamples: number;

  constructor(options: SharpDetectorOptions = {}) {
    this.windowSize = options.windowSize ?? 10;
    this.threshold = options.threshold ?? 0.03;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.minSamples = options.minSamples ?? 5;
  }

  analyze(
    fixtureId: string,
    market: string,
    outcome: string,
    currentPrice: number
  ): SharpSignal | null {
    const key = `${fixtureId}_${market}_${outcome}`;

    const lastSignalTime = this.cooldowns.get(key) || 0;
    if (Date.now() - lastSignalTime < this.cooldownMs) {
      this.updateHistory(key, currentPrice);
      return null;
    }

    this.updateHistory(key, currentPrice);
    const prices = this.history.get(key)!;

    if (prices.length < this.minSamples) return null;

    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (avg === 0 || !Number.isFinite(avg)) return null;

    const deviation = Math.abs(currentPrice - avg) / avg;
    if (!Number.isFinite(deviation)) return null;

    if (deviation > this.threshold) {
      this.cooldowns.set(key, Date.now());

      return {
        type: "SHARP_MOVEMENT",
        fixtureId,
        market,
        outcome,
        currentPrice,
        averagePrice: avg,
        deviationPercent: (deviation * 100).toFixed(2),
        timestamp: Date.now(),
      };
    }

    return null;
  }

  private updateHistory(key: string, price: number) {
    if (!this.history.has(key)) this.history.set(key, []);
    const prices = this.history.get(key)!;
    prices.push(price);
    if (prices.length > this.windowSize) prices.shift();
  }
}
