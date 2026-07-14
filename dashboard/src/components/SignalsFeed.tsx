import { useEffect, useState } from "react";
import type { StoredSignal } from "../types";
import { TransactionCard } from "./TransactionCard";

interface Props {
  signals: StoredSignal[];
}

export function SignalsFeed({ signals }: Props) {
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!seen) {
      setSeen(true);
      return;
    }
    if (signals.length === 0) return;
    const newest = signals[0]?.id;
    if (!newest) return;
    setFreshIds((prev) => new Set(prev).add(newest));
    const t = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(newest);
        return next;
      });
    }, 2500);
    return () => clearTimeout(t);
  }, [signals, seen]);

  if (signals.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-panel/60 p-8 text-center">
        <div>
          <p className="text-sm font-medium text-white/70">Aguardando sinais…</p>
          <p className="mt-2 text-xs text-white/40">
            O agente precisa acumular ≥5 leituras e desvio &gt; 3%
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
      {signals.map((signal) => (
        <TransactionCard
          key={signal.id}
          signal={signal}
          fresh={freshIds.has(signal.id)}
        />
      ))}
    </div>
  );
}
