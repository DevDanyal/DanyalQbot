"""Statistical research sub-agent.

Runs BEFORE any trade is placed. For every watched pair it measures the
current, real behaviour of the market using recently closed candles and
decides:

- WHICH pair to trade (only pairs where the measured edge beats the
  break-even win rate plus a safety margin),
- WHEN to trade (only when the edge is present right now and the market
  is alive — enough real candles with actual movement),
- WHICH DIRECTION mode is currently correct for each pair
  (reversal when candles mean-revert, momentum when they trend).

If the measurements are inconclusive the agent says NO TRADE for that
pair. Skipping is the strategy. Nothing here can guarantee profit — it
only stops the bot from trading when the edge is NOT demonstrably there.
"""

from __future__ import annotations

import bisect
import logging
import statistics
import time
from dataclasses import dataclass

from quotex_bot.connector.base import Connector
from quotex_bot.models import Candle
from quotex_bot.utils.logging import CsvWriter

log = logging.getLogger("quotex.research")

RESEARCH_FIELDS = ["time", "pair", "sample", "flip_rate", "avg_body",
                   "body_fraction", "mode", "allowed", "reason"]


@dataclass
class Verdict:
    """Research outcome for one pair in the current window."""

    pair: str
    sample: int = 0            # real-body candles usable for the measurement
    flip_rate: float = 0.0     # fraction of those candles followed by an opposite move
    avg_body: float = 0.0
    body_fraction: float = 0.0 # share of candles with a real body
    reversal: bool = False     # True = trade against the trigger candle
    allowed: bool = False
    reason: str = "no data"


class ResearchAgent:
    def __init__(self, connector: Connector, pairs: list[str], timeframe: int = 5,
                 expiry: int = 15, min_body_pips: float = 0.00001,
                 payout_rate: float = 0.85, min_sample: int = 20,
                 margin: float = 0.03, min_body_fraction: float = 0.15,
                 cooldown: float = 120.0,
                 research_csv: str = "data/research.csv"):
        self.connector = connector
        self.pairs = pairs
        self.timeframe = timeframe
        self.expiry = expiry
        self.min_body_pips = min_body_pips
        self.payout_rate = payout_rate
        self.min_sample = min_sample
        self.margin = margin
        self.min_body_fraction = min_body_fraction
        self.cooldown = cooldown
        self.break_even = 1.0 / (1.0 + payout_rate) if payout_rate > 0 else 0.0
        self.threshold = self.break_even + margin
        self.verdicts: dict[str, Verdict] = {}
        self._last_research = 0.0
        self.research_csv = CsvWriter(research_csv, RESEARCH_FIELDS)

    def refresh(self) -> None:
        """Re-run research if the cached results are older than the cooldown."""
        if time.time() - self._last_research < self.cooldown:
            return
        self.run()

    def run(self) -> None:
        log.info("Research: edge threshold %.1f%% (break-even %.1f%% + margin %.1f%%)",
                 self.threshold * 100, self.break_even * 100, self.margin * 100)
        for pair in self.pairs:
            try:
                candles = self.connector.get_candles(pair, self.timeframe, 300)
                self.verdicts[pair] = self._analyze(pair, candles)
            except Exception as exc:  # noqa: BLE001
                self.verdicts[pair] = Verdict(
                    pair, reason=f"research error: {exc}")
                log.exception("Research failed for %s", pair)
        self._last_research = time.time()

    def verdict(self, pair: str) -> Verdict:
        return self.verdicts.get(pair, Verdict(pair))

    # -- measurement --------------------------------------------------
    def _analyze(self, pair: str, candles: list[Candle]) -> Verdict:
        candles = [c for c in candles if c.time > 0]
        candles.sort(key=lambda c: c.time)
        if len(candles) < 2:
            return Verdict(pair, reason="not enough candles")

        times = [c.time for c in candles]
        step = self._median_step(candles)
        if step <= 0:
            return Verdict(pair, reason="invalid candle times")
        horizon = max(self.timeframe, self.expiry)

        bodies = [c.body for c in candles]
        avg_body = sum(bodies) / len(bodies) if bodies else 0.0
        real = [i for i, c in enumerate(candles)
                if c.body >= self.min_body_pips
                and _exit_index(times, i, c.time, horizon) is not None]

        body_fraction = len(real) / max(1, len(candles) - 1)
        v = Verdict(pair=pair, avg_body=avg_body, body_fraction=body_fraction)

        if len(real) < self.min_sample:
            v.reason = (f"sample too small {len(real)} < {self.min_sample} "
                        f"(market too quiet, {body_fraction:.0%} real bodies)")
            return v
        if body_fraction < self.min_body_fraction:
            v.reason = (f"market too quiet ({body_fraction:.0%} real bodies "
                        f"< {self.min_body_fraction:.0%})")
            return v

        hits = 0
        for i in real:
            cur = candles[i]
            k = _exit_index(times, i, cur.time, horizon)
            if k is None:
                continue
            exit_price = candles[k].close
            reversal_hit = ((exit_price < cur.close) if cur.close > cur.open
                            else (exit_price > cur.close))
            hits += int(reversal_hit)

        v.sample = len(real)
        v.flip_rate = hits / len(real)
        # flip_rate is the measured REVERSAL accuracy over the SAME horizon
        # the trade will be resolved at (expiry seconds ahead). If it beats
        # the threshold the market mean-reverts -> trade reversal. If it is
        # far below break-even the market trends -> trade momentum.
        if v.flip_rate >= self.threshold:
            v.reversal = True
            v.allowed = True
            v.reason = (f"edge {v.flip_rate:.1%} >= threshold {self.threshold:.1%} "
                        f"at {horizon}s -> REVERSAL")
        elif v.flip_rate <= self.break_even - self.margin:
            v.reversal = False
            v.allowed = True
            v.reason = (f"trend regime {v.flip_rate:.1%} <= {self.break_even - self.margin:.1%} "
                        f"at {horizon}s -> MOMENTUM")
        else:
            v.reason = (f"no clear edge {v.flip_rate:.1%} at {horizon}s "
                        f"between {self.break_even - self.margin:.1%} and {self.threshold:.1%}")

        self.research_csv.write({
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "pair": pair,
            "sample": v.sample,
            "flip_rate": round(v.flip_rate, 4),
            "avg_body": round(v.avg_body, 6),
            "body_fraction": round(v.body_fraction, 4),
            "mode": "reversal" if v.reversal else "momentum",
            "allowed": str(v.allowed),
            "reason": v.reason,
        })
        return v

    @staticmethod
    def _median_step(candles: list[Candle]) -> float:
        deltas = [candles[i].time - candles[i - 1].time
                  for i in range(1, len(candles))
                  if 0 < candles[i].time - candles[i - 1].time < 600]
        if not deltas:
            return 0.0
        return statistics.median(deltas)


def _exit_index(times: list[float], start: int, candle_time: float,
                horizon: float) -> int | None:
    """Index of the first candle at or after `candle_time + horizon`."""
    k = bisect.bisect_left(times, candle_time + horizon, lo=start + 1)
    if k >= len(times):
        return None
    if times[k] - candle_time > horizon * 1.5:
        return None
    return k
