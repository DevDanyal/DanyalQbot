import type { Trade } from "@/lib/types";
import {
  dirLabel,
  fmtSigned,
  fmtTradeTime,
  isBuy,
} from "@/lib/format";
import { ResultTag } from "@/components/ui";

export function TradesTable({
  trades,
  showReason = false,
}: {
  trades: Trade[];
  showReason?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[.07]">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-white/[.07] text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="px-3.5 py-2.5 font-medium">Time</th>
            <th className="px-3.5 py-2.5 font-medium">Pair</th>
            <th className="px-3.5 py-2.5 font-medium">Dir</th>
            <th className="px-3.5 py-2.5 font-medium">Amount</th>
            <th className="px-3.5 py-2.5 font-medium">Result</th>
            <th className="px-3.5 py-2.5 text-right font-medium">P/L</th>
            {showReason ? (
              <th className="px-3.5 py-2.5 font-medium">Signal reason</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const buy = isBuy(t.direction);
            const pnl = Number(t.pnl || 0);
            return (
              <tr
                key={t.id}
                className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]"
              >
                <td className="px-3.5 py-2.5 tabular-nums text-faint">
                  {fmtTradeTime(t.time)}
                </td>
                <td className="px-3.5 py-2.5 font-medium">{t.pair}</td>
                <td
                  className={`px-3.5 py-2.5 font-medium ${buy ? "text-mint" : "text-coral"}`}
                >
                  {dirLabel(t.direction)}
                </td>
                <td className="px-3.5 py-2.5 tabular-nums">
                  {Number(t.amount || 0).toFixed(2)}
                </td>
                <td className="px-3.5 py-2.5">
                  <ResultTag r={t.result} />
                </td>
                <td
                  className={`px-3.5 py-2.5 text-right tabular-nums ${
                    pnl > 0 ? "text-mint" : pnl < 0 ? "text-coral" : ""
                  }`}
                >
                  {fmtSigned(pnl)}
                </td>
                {showReason ? (
                  <td className="px-3.5 py-2.5 max-w-[260px] truncate text-xs text-faint">
                    {t.signal_reason || "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
