import type { StoredSignal } from "../types";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const sec = Math.floor(abs / 1000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (sec < 60) return `${sec}s ${suffix}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ${suffix}`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ${suffix}`;
  const days = Math.floor(hr / 24);
  return `${days}d ${suffix}`;
}

interface Props {
  signal: StoredSignal;
  fresh?: boolean;
}

export function TransactionCard({ signal, fresh }: Props) {
  const deviation = parseFloat(signal.deviationPercent) || 0;
  const up = signal.currentPrice >= signal.averagePrice;
  const href =
    signal.explorerUrl ??
    (signal.txSignature
      ? `https://explorer.solana.com/tx/${signal.txSignature}?cluster=devnet`
      : null);

  return (
    <article
      className={`rounded-xl border border-white/10 bg-panel p-4 ${
        fresh ? "animate-slideIn ring-1 ring-solana/40" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {signal.teams ?? `Fixture ${signal.fixtureId}`}
          </p>
          <p className="mt-1 font-mono text-xs text-white/50">{signal.market}</p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs font-medium ${
            up ? "bg-signal/15 text-signal" : "bg-red-500/15 text-red-400"
          }`}
        >
          {up ? "+" : ""}
          {signal.deviationPercent}%
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-white/40">Outcome</dt>
          <dd className="font-mono text-white/90">{signal.outcome}</dd>
        </div>
        <div>
          <dt className="text-white/40">Price</dt>
          <dd className="font-mono text-white/90">
            {signal.currentPrice.toFixed(3)}
            <span className="text-white/40">
              {" "}
              ← {signal.averagePrice.toFixed(3)}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
        <span className="text-white/40">{relativeTime(signal.timestamp)}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-solana hover:underline"
          >
            🔗 View on Solana Explorer
          </a>
        ) : (
          <span className="text-white/30">no tx</span>
        )}
      </div>

      {deviation > 50 && (
        <p className="mt-2 text-xs text-amber-300/80">Extreme move detected</p>
      )}
    </article>
  );
}
