"""Pure indicator math. No external dependencies so it is easy to test."""

from __future__ import annotations

from quotex_bot.models import Candle


def ema(values: list[float], period: int) -> list[float | None]:
    """Exponential moving average. Seeds with the SMA of the first `period`."""
    if period <= 0 or not values:
        return []
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    k = 2.0 / (period + 1)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def last_ema(values: list[float], period: int) -> float | None:
    series = ema(values, period)
    for value in reversed(series):
        if value is not None:
            return value
    return None


def sma(values: list[float], period: int) -> float | None:
    if period <= 0 or len(values) < period:
        return None
    return sum(values[-period:]) / period


def rsi(values: list[float], period: int = 14) -> float | None:
    if period <= 0 or len(values) < period + 1:
        return None
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = values[i] - values[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses -= delta
    avg_gain = gains / period
    avg_loss = losses / period
    for i in range(period + 1, len(values)):
        delta = values[i] - values[i - 1]
        gain = delta if delta > 0 else 0.0
        loss = -delta if delta < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def macd(values: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[float | None, float | None, float | None]:
    if len(values) < slow + signal:
        return None, None, None
    fast_series = ema(values, fast)
    slow_series = ema(values, slow)
    macd_series: list[float] = []
    for f, s in zip(fast_series, slow_series):
        if f is None or s is None:
            macd_series.append(float("nan"))
        else:
            macd_series.append(f - s)
    valid = [v for v in macd_series if v == v]
    if len(valid) < signal:
        return None, None, None
    signal_series = ema(valid, signal)
    sig = None
    for v in reversed(signal_series):
        if v is not None:
            sig = v
            break
    if sig is None:
        return None, None, None
    m = valid[-1]
    return m, sig, m - sig


def atr(candles: list[Candle], period: int = 14) -> float | None:
    if period <= 0 or len(candles) < period + 1:
        return None
    trs: list[float] = []
    for i in range(1, len(candles)):
        h = candles[i].high
        l = candles[i].low
        pc = candles[i - 1].close
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    if len(trs) < period:
        return None
    val = sum(trs[:period]) / period
    for tr in trs[period:]:
        val = (val * (period - 1) + tr) / period
    return val


def average_body(candles: list[Candle]) -> float:
    if not candles:
        return 0.0
    return sum(c.body for c in candles) / len(candles)


def average_range(candles: list[Candle]) -> float:
    if not candles:
        return 0.0
    return sum(c.range for c in candles) / len(candles)


def recent_support_resistance(candles: list[Candle], lookback: int = 20) -> tuple[float | None, float | None]:
    window = candles[-lookback:] if lookback > 0 else candles
    if not window:
        return None, None
    return min(c.low for c in window), max(c.high for c in window)
