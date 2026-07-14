import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SharpDetector } from "../src/agent/detector";
import sampleOdds from "./fixtures/sample-odds.json";

describe("SharpDetector", () => {
  let detector: SharpDetector;

  beforeEach(() => {
    detector = new SharpDetector();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Janela mínima", () => {
    it("deve retornar null quando há menos de 5 leituras", () => {
      detector.analyze("f1", "market1", "over", 2.0);
      detector.analyze("f1", "market1", "over", 2.1);
      const signal = detector.analyze("f1", "market1", "over", 2.2);
      expect(signal).toBeNull();
    });

    it("deve começar a analisar após 5 leituras", () => {
      for (let i = 0; i < 4; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signal = detector.analyze("f1", "market1", "over", 10.0);
      expect(signal).not.toBeNull();
      expect(parseFloat(signal!.deviationPercent)).toBeGreaterThan(3);
    });
  });

  describe("Detecção de anomalias", () => {
    it("NÃO deve disparar para variações normais (< 3%)", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signal = detector.analyze("f1", "market1", "over", 2.04);
      expect(signal).toBeNull();
    });

    it("DEVE disparar para variações bruscas (> 3%)", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signal = detector.analyze("f1", "market1", "over", 1.5);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe("SHARP_MOVEMENT");
      expect(signal?.currentPrice).toBe(1.5);
      expect(parseFloat(signal!.deviationPercent)).toBeGreaterThan(20);
    });

    it("deve detectar tanto quedas quanto altas bruscas", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signalUp = detector.analyze("f1", "market1", "over", 3.0);
      expect(signalUp).not.toBeNull();
    });
  });

  describe("Cooldown", () => {
    it("NÃO deve disparar múltiplos sinais para o mesmo mercado em 60s", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signal1 = detector.analyze("f1", "market1", "over", 1.0);
      expect(signal1).not.toBeNull();

      const signal2 = detector.analyze("f1", "market1", "over", 0.5);
      expect(signal2).toBeNull();
    });

    it("deve permitir novo sinal após 60s", () => {
      vi.useFakeTimers();
      const start = 1_700_000_000_000;
      vi.setSystemTime(start);

      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      const signal1 = detector.analyze("f1", "market1", "over", 1.0);
      expect(signal1).not.toBeNull();

      // Ainda em cooldown
      vi.setSystemTime(start + 30_000);
      expect(detector.analyze("f1", "market1", "over", 0.5)).toBeNull();

      // Estabiliza a janela em 2.0 enquanto o cooldown bloqueia emissões
      for (let i = 0; i < 10; i++) {
        expect(detector.analyze("f1", "market1", "over", 2.0)).toBeNull();
      }

      // Cooldown expirado → nova anomalia permitida
      vi.setSystemTime(start + 60_000);
      const signal2 = detector.analyze("f1", "market1", "over", 1.0);
      expect(signal2).not.toBeNull();
      expect(signal2?.type).toBe("SHARP_MOVEMENT");
    });
  });

  describe("Isolamento de mercados", () => {
    it("deve tratar cada (fixture, market, outcome) separadamente", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
        detector.analyze("f1", "market1", "under", 2.0);
      }
      const signalOver = detector.analyze("f1", "market1", "over", 1.0);
      const signalUnder = detector.analyze("f1", "market1", "under", 2.02);

      expect(signalOver).not.toBeNull();
      expect(signalUnder).toBeNull();
    });

    it("deve rastrear fixtures diferentes independentemente", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      for (let i = 0; i < 5; i++) {
        detector.analyze("f2", "market1", "over", 5.0);
      }

      const s1 = detector.analyze("f1", "market1", "over", 1.0);
      const s2 = detector.analyze("f2", "market1", "over", 5.02);

      expect(s1).not.toBeNull();
      expect(s2).toBeNull();
    });
  });

  describe("Janela deslizante", () => {
    it("deve descartar leituras antigas além do windowSize", () => {
      for (let i = 0; i < 10; i++) {
        detector.analyze("f1", "market1", "over", 10.0);
      }
      for (let i = 0; i < 10; i++) {
        detector.analyze("f1", "market1", "over", 1.0);
      }
      const signal = detector.analyze("f1", "market1", "over", 1.05);
      expect(signal).toBeNull();
    });
  });

  describe("Casos extremos", () => {
    it("deve lidar com preço zero sem crashar", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      expect(() => {
        detector.analyze("f1", "market1", "over", 0);
      }).not.toThrow();
    });

    it("deve retornar null se a média da janela for zero", () => {
      for (let i = 0; i < 5; i++) {
        expect(detector.analyze("f1", "market1", "over", 0)).toBeNull();
      }
      // Ainda só zeros → avg === 0 → null (evita divisão por zero)
      expect(detector.analyze("f1", "market1", "over", 0)).toBeNull();
    });

    it("deve lidar com preços muito altos", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 1000.0);
      }
      const signal = detector.analyze("f1", "market1", "over", 500.0);
      expect(signal).not.toBeNull();
    });

    it("deve rejeitar NaN sem crashar", () => {
      for (let i = 0; i < 5; i++) {
        detector.analyze("f1", "market1", "over", 2.0);
      }
      expect(() => detector.analyze("f1", "market1", "over", Number.NaN)).not.toThrow();
      expect(detector.analyze("f1", "market1", "over", Number.NaN)).toBeNull();
    });
  });

  describe("Fixtures TxLINE reais", () => {
    it("deve detectar sharp move no over a partir de sample-odds.json", () => {
      const overTicks = sampleOdds
        .filter((o) => o.FixtureId === 18241006)
        .map((o) => {
          const idx = o.PriceNames.indexOf("over");
          return (o.Prices[idx] as number) / 1000;
        });

      let last: ReturnType<SharpDetector["analyze"]> = null;
      for (const price of overTicks) {
        last = detector.analyze(
          "18241006",
          "OVERUNDER_PARTICIPANT_GOALS",
          "over",
          price
        );
      }

      expect(last).not.toBeNull();
      expect(last?.type).toBe("SHARP_MOVEMENT");
      expect(last?.currentPrice).toBeCloseTo(2.49, 2);
      expect(parseFloat(last!.deviationPercent)).toBeGreaterThan(3);
    });
  });
});
