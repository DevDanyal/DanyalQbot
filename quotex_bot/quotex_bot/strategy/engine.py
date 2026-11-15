"""Signal engine for Quotex trading bot.

Variants:
- ema_trend: EMA trend filter + optional strong-body trigger (original).
- streak_reversal: trade after N consecutive same-direction candles.
- confluence: stronger multi-signal analyzer (EMA + RSI + MACD + momentum + S/R filter).
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
                 reversal: bool = False, require_strong_body: bool = True,
                 variant: str = "ema_trend", min_streak: int = 3,
                 rsi_period: int = 14, rsi_buy: float = 55.0, rsi_sell: float = 45.0,
                 macd_fast: int = 12, macd_slow: int = 26, macd_signal: int = 9,
                 sr_lookback: int = 20, sr_buffer_ratio: float = 0.15,
                 min_confluence: int = 3):
        self.direction_ema_period = direction_ema_period
        self.min_body_pips = min_body_pips
        self.body_vs_avg_ratio = body_vs_avg_ratio
        self.min_direction_candles = min_direction_candles
        self.avg_body_window = avg_body_window
        self.ema_slope_bars = ema_slope_bars
        self.reversal = reversal
        self.require_strong_body = require_strong_body
        self.variant = variant
        self.min_streak = min_streak
        self.rsi_period = rsi_period
        self.rsi_buy = rsi_buy
        self.rsi_sell = rsi_sell
        self.macd_fast = macd_fast
        self.macd_slow = macd_slow
        self.macd_signal = macd_signal
        self.sr_lookback = sr_lookback
        self.sr_buffer_ratio = sr_buffer_ratio
        self.min_confluence = min_confluence

    def evaluate(self, direction_candles: list[Candle],
                 entry_candles: list[Candle], reversal: bool | None = None) -> Signal:
        """Evaluate the strategy on the latest closed candles.

        `direction_candles`: trend-timeframe closed candles (e.g. 1m).
        `entry_candles`: entry-timeframe closed candles (e.g. 5s), oldest
        first; the last one is the trigger candle.
        `reversal`: optional override of the configured direction mode.
        """
        if reversal is None:
            reversal = self.reversal
        if self.variant == "streak_reversal":
            return self._evaluate_streak(entry_candles, reversal)
        if self.variant == "confluence":
            return self._evaluate_confluence(direction_candles, entry_candles, reversal)
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

    def _evaluate_streak(self, entry_candles: list[Candle],
                         reversal: bool) -> Signal:
        """Streak variant: react to `min_streak` consecutive same-direction entry candles."""
        signal = Signal(candle_time=entry_candles[-1].time if entry_candles else 0.0)
        if len(entry_candles) < self.min_streak:
            signal.reason = (f"not enough entry candles "
                             f"({len(entry_candles)} < {self.min_streak})")
            return signal

        window = entry_candles[-self.min_streak:]
        signs = []
        for c in window:
            if c.close > c.open:
                signs.append(1)
            elif c.close < c.open:
                signs.append(-1)
            else:
                signs.append(0)

        last = entry_candles[-1]
        signal.price = last.close
        signal.body = last.body

        if 0 in signs:
            signal.reason = "doji inside streak window"
            return signal
        if len(set(signs)) != 1:
            signal.reason = f"no {self.min_streak}-candle streak"
            return signal

        streak_dir = signs[0]
        direction = "buy" if streak_dir > 0 else "sell"
        if reversal:
            direction = "sell" if direction == "buy" else "buy"
        signal.direction = direction
        signal.reason = (f"{'REVERSAL: ' if reversal else ''}"
                         f"{self.min_streak}-candle "
                         f"{'up' if streak_dir > 0 else 'down'} streak "
                         f"-> {direction}")
        return signal

    def _evaluate_confluence(self, direction_candles: list[Candle],
                             entry_candles: list[Candle], reversal: bool) -> Signal:
        """Stronger multi-signal analyzer (UP/DOWN/NO TRADE).

        Signals considered: EMA trend+slope, RSI, MACD histogram, short momentum,
        and recent support/resistance proximity filter.
        """
        candle = entry_candles[-1] if entry_candles else None
        signal = Signal(candle_time=candle.time if candle else 0.0)
        if not candle or len(direction_candles) < self.min_direction_candles or len(entry_candles) < self.avg_body_window:
            signal.reason = "not enough candles for confluence"
            return signal

        closes_dir = [c.close for c in direction_candles]
        closes_entry = [c.close for c in entry_candles]
        ema_now = ind.last_ema(closes_dir, self.direction_ema_period)
        ema_series = ind.ema(closes_dir, self.direction_ema_period)
        ema_prev = ema_series[-1 - self.ema_slope_bars] if self.ema_slope_bars > 0 else None
        if ema_now is None or ema_prev is None:
            signal.reason = "EMA not ready"
            return signal

        rsi_val = ind.rsi(closes_entry, self.rsi_period)
        macd_line, macd_sig, macd_hist = ind.macd(closes_entry, self.macd_fast, self.macd_slow, self.macd_signal)
        support, resistance = ind.recent_support_resistance(entry_candles, self.sr_lookback)
        atr_val = ind.atr(entry_candles, 14)

        signal.ema = ema_now
        signal.price = candle.close
        signal.body = candle.body
        signal.avg_body = ind.average_body(entry_candles[-self.avg_body_window:])

        if candle.body < self.min_body_pips:
            signal.reason = f"market quiet (body {candle.body:.6f})"
            return signal

        buy = 0
        sell = 0
        reasons: list[str] = []

        if candle.close > ema_now and ema_now > ema_prev:
            buy += 1
            reasons.append("EMA up")
        elif candle.close < ema_now and ema_now < ema_prev:
            sell += 1
            reasons.append("EMA down")

        if rsi_val is not None:
            if rsi_val >= self.rsi_buy:
                buy += 1
                reasons.append(f"RSI {rsi_val:.1f}>= {self.rsi_buy}")
            elif rsi_val <= self.rsi_sell:
                sell += 1
                reasons.append(f"RSI {rsi_val:.1f}<= {self.rsi_sell}")

        if macd_hist is not None:
            if macd_hist > 0:
                buy += 1
                reasons.append("MACD+")
            elif macd_hist < 0:
                sell += 1
                reasons.append("MACD-")

        mom_window = entry_candles[-3:] if len(entry_candles) >= 3 else entry_candles
        up = sum(1 for c in mom_window if c.close > c.open)
        down = sum(1 for c in mom_window if c.close < c.open)
        if up > down:
            buy += 1
            reasons.append(f"mom {up}/{len(mom_window)} up")
        elif down > up:
            sell += 1
            reasons.append(f"mom {down}/{len(mom_window)} down")

        direction = "none"
        score = 0
        if buy >= self.min_confluence and buy > sell:
            direction = "buy"
            score = buy
        elif sell >= self.min_confluence and sell > buy:
            direction = "sell"
            score = sell
        else:
            signal.reason = f"no confluence (buy={buy} sell={sell} need={self.min_confluence})"
            return signal

        # S/R proximity filter: avoid buying into nearby resistance / selling into support.
        if support is not None and resistance is not None and atr_val and atr_val > 0:
            buffer = atr_val * self.sr_buffer_ratio
            if direction == "buy" and resistance - candle.close <= buffer:
                signal.reason = f"skip BUY near resistance {resistance:.5f}"
                return signal
            if direction == "sell" and candle.close - support <= buffer:
                signal.reason = f"skip SELL near support {support:.5f}"
                return signal

        if reversal:
            direction = "sell" if direction == "buy" else "buy"
            reasons.append("reversal")

        signal.direction = direction
        conf = min(100, int(50 + score * 12))
        signal.reason = f"{direction.upper()} conf={conf}% ({', '.join(reasons)})"
        return signal
