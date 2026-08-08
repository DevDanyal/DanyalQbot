"""Trend-Filtered Momentum strategy (v1) per claude.md section 4.

Direction comes from EMA-50 on the direction-timeframe candles:
- price above EMA -> only buy (call) allowed
- price below EMA -> only sell (put) allowed

Entry comes from the last closed entry-timeframe candle: it must have a
strong body (above an absolute floor and above a multiple of the recent
average body) and must have closed fully on the right side of the EMA.
No signal -> no trade.
"""

from __future__ import annotations

import logging

from quotex_bot.models import Candle, Signal
from quotex_bot.strategy import indicators as ind

log = logging.getLogger("quotex.strategy")


class SignalEngine:
    def __init__(self, direction_ema_period: int = 50, min_body_pips: float = 0.0003,
                 body_vs_avg_ratio: float = 1.5, min_direction_candles: int = 60,
                 avg_body_window: int = 20, ema_slope_bars: int = 3,
                 reversal: bool = False, require_strong_body: bool = True):
        self.direction_ema_period = direction_ema_period
        self.min_body_pips = min_body_pips
        self.body_vs_avg_ratio = body_vs_avg_ratio
        self.min_direction_candles = min_direction_candles
        self.avg_body_window = avg_body_window
        self.ema_slope_bars = ema_slope_bars
        self.reversal = reversal
        self.require_strong_body = require_strong_body

    def evaluate(self, direction_candles: list[Candle],
                 entry_candles: list[Candle], reversal: bool | None = None) -> Signal:
        """Evaluate the strategy on the latest closed candles.

        `direction_candles`: trend-timeframe closed candles (e.g. 1m).
        `entry_candles`: entry-timeframe closed candles (e.g. 5s), oldest
        first; the last one is the trigger candle.
        `reversal`: optional override of the configured direction mode
        (used by the research agent to pick the current regime per pair).
        """
        if reversal is None:
            reversal = self.reversal
        signal = Signal(candle_time=entry_candles[-1].time if entry_candles else 0.0)

        if len(direction_candles) < self.min_direction_candles:
            signal.reason = (f"not enough direction candles "
                             f"({len(direction_candles)} < {self.min_direction_candles})")
            return signal
        if not entry_candles:
            signal.reason = "no entry candles"
            return signal

        closes = [c.close for c in direction_candles]
        ema_series = ind.ema(closes, self.direction_ema_period)
        ema_now = ind.last_ema(closes, self.direction_ema_period)
        if ema_now is None:
            signal.reason = "EMA not ready"
            return signal

        ema_prev = ema_series[-1 - self.ema_slope_bars] if self.ema_slope_bars > 0 else None
        if ema_prev is None:
            signal.reason = "EMA slope not ready"
            return signal

        candle = entry_candles[-1]
        avg_body = ind.average_body(entry_candles[-self.avg_body_window:])
        threshold = max(self.min_body_pips, self.body_vs_avg_ratio * avg_body)

        signal.ema = ema_now
        signal.price = candle.close
        signal.body = candle.body
        signal.avg_body = avg_body

        above = candle.close > ema_now
        below = candle.close < ema_now
        strong = candle.body >= threshold
        rising = ema_now > ema_prev
        falling = ema_now < ema_prev

        # Direction-first mode: the EMA trend decides buy/sell. As long as
        # the market is alive (candle has a real body) we trade the trend —
        # no strict strength filter that would leave the bot idle.
        if not self.require_strong_body:
            if candle.body < self.min_body_pips:
                signal.reason = (f"market quiet (body {candle.body:.6f} < "
                                 f"min {self.min_body_pips:.6f})")
                return signal
            if above and rising:
                direction = "sell" if reversal else "buy"
                signal.direction = direction
                signal.reason = (f"{'REVERSAL: ' if reversal else ''}"
                                 f"market UP (price {candle.close:.5f} > EMA "
                                 f"{ema_now:.5f}, EMA rising) -> {direction}")
                return signal
            if below and falling:
                direction = "buy" if reversal else "sell"
                signal.direction = direction
                signal.reason = (f"{'REVERSAL: ' if reversal else ''}"
                                 f"market DOWN (price {candle.close:.5f} < EMA "
                                 f"{ema_now:.5f}, EMA falling) -> {direction}")
                return signal
            if above and below:
                signal.reason = "candle inside EMA band"
                return signal
            signal.reason = (f"EMA flat (slope not confirmed over "
                             f"{self.ema_slope_bars} bars)")
            return signal

        if not strong:
            signal.reason = (f"weak body {candle.body:.6f} < threshold "
                             f"{threshold:.6f} (avg {avg_body:.6f})")
            return signal

        if above and rising and candle.low >= ema_now:
            direction = "sell" if reversal else "buy"
            signal.direction = direction
            signal.reason = (f"{'REVERSAL: ' if reversal else ''}"
                             f"trend up (price {candle.close:.5f} > EMA {ema_now:.5f}, "
                             f"EMA rising), strong bullish body {candle.body:.6f}")
            return signal

        if below and falling and candle.high <= ema_now:
            direction = "buy" if reversal else "sell"
            signal.direction = direction
            signal.reason = (f"{'REVERSAL: ' if reversal else ''}"
                             f"trend down (price {candle.close:.5f} < EMA {ema_now:.5f}, "
                             f"EMA falling), strong bearish body {candle.body:.6f}")
            return signal

        if above and below:
            signal.reason = "candle inside EMA band"
            return signal

        if (above and not rising) or (below and not falling):
            signal.reason = f"EMA flat (slope not confirmed over {self.ema_slope_bars} bars)"
            return signal

        signal.reason = (f"candle not fully on the trend side of EMA "
                         f"(high {candle.high:.5f}, low {candle.low:.5f}, EMA {ema_now:.5f})")
        return signal
