import { useEffect, useState } from "react";
import type { StoredSignal } from "../types";
import { TransactionCard } from "./TransactionCard";

interface Props {
  signals: StoredSignal[];
  loading?: boolean;
}

export function SignalsFeed({ signals, loading }: Props) {
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

  if (loading && signals.length === 0) {
    return (
      <div className="flex max-h-[70vh] flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-white/10 bg-panel p-4"
          >
            <div className="mb-3 h-4 w-2/5 rounded bg-white/10" />
            <div className="mb-2 h-3 w-3/5 rounded bg-white/5" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-8 rounded bg-white/5" />
              <div className="h-8 rounded bg-white/5" />
            </div>
          </div>
        ))}
        <p className="pt-2 text-center text-xs text-white/40">
          Loading signals…
        </p>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-panel/60 p-8 text-center">
        <div>
          <p className="text-sm font-medium text-white/70">No signals yet</p>
          <p className="mt-2 text-xs text-white/40">
            The agent needs ≥5 readings and &gt;3% deviation to emit a signal
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
