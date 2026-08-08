"""Pure indicator math. No external dependencies so it is easy to test."""

from __future__ import annotations

from quotex_bot.models import Candle


def ema(values: list[float], period: int) -> list[float]:
    """Exponential moving average. Seeds with the SMA of the first `period`.

    Returns a list the same length as `values`; entries before the seed
    window are None.
    """
    if period <= 0 or not values:
        return []
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return [float(v) for v in values if v is not None]
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


def average_body(candles: list[Candle]) -> float:
    if not candles:
        return 0.0
    return sum(c.body for c in candles) / len(candles)


def average_range(candles: list[Candle]) -> float:
    if not candles:
        return 0.0
    return sum(c.range for c in candles) / len(candles)
