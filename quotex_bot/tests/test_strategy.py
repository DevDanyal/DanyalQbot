"""Tests for strategy engine."""

import sys
import os
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quotex_bot.models import Candle
from quotex_bot.strategy.engine import SignalEngine
from quotex_bot.strategy import indicators as ind


def make_candle(open_, close, i, volume=0):
    high = max(open_, close)
    low = min(open_, close)
    return Candle(time=float(i), open=open_, high=high, low=low, close=close, volume=volume)


def make_uptrend_candles(n=100, start=1.0, step=0.001):
    """Generate a rising series of candles."""
    candles = []
    price = start
    for i in range(n):
        o = price
        price += step
        c = price
        candles.append(make_candle(o, c, i))
    return candles


def make_downtrend_candles(n=100, start=2.0, step=0.001):
    """Generate a falling series of candles."""
    candles = []
    price = start
    for i in range(n):
        o = price
        price -= step
        c = price
        candles.append(make_candle(o, c, i))
    return candles


def test_ema_basic():
    closes = [1.0 + i * 0.01 for i in range(50)]
    result = ind.ema(closes, 10)
    assert len(result) == len(closes)
    assert result[-1] is not None


def test_ema_uptrend_lower():
    closes = [1.0 + i * 0.01 for i in range(100)]
    ema = ind.ema(closes, 20)[-1]
    # In an uptrend, price is above EMA
    assert ema < closes[-1]


def test_ema_downtrend_higher():
    closes = [2.0 - i * 0.01 for i in range(100)]
    ema = ind.ema(closes, 20)[-1]
    # In a downtrend, price is below EMA
    assert ema > closes[-1]


def test_signal_uptrend_buy():
    engine = SignalEngine(min_direction_candles=60, require_strong_body=False)
    # Continuous rising series: direction candles end at ~1.099, entry continues up
    direction = make_uptrend_candles(100, start=1.0, step=0.001)
    last = direction[-1].close
    entry = make_uptrend_candles(10, start=last, step=0.001)
    signal = engine.evaluate(direction, entry)
    assert signal.active is True
    assert signal.direction == "buy"


def test_signal_downtrend_sell():
    engine = SignalEngine(min_direction_candles=60, require_strong_body=False)
    direction = make_downtrend_candles(100, start=2.0, step=0.001)
    last = direction[-1].close
    entry = make_downtrend_candles(10, start=last, step=0.001)
    signal = engine.evaluate(direction, entry)
    assert signal.active is True
    assert signal.direction == "sell"


def test_signal_quiet_market_no_trade():
    # Flat/no movement market should not signal
    engine = SignalEngine(min_direction_candles=60, min_body_pips=1e-6, require_strong_body=False)
    direction = [make_candle(1.0, 1.000001, i) for i in range(100)]
    entry = [make_candle(1.0, 1.0000005, i) for i in range(5)]
    signal = engine.evaluate(direction, entry)
    assert signal.active is False


def test_signal_not_enough_candles():
    engine = SignalEngine(min_direction_candles=60, require_strong_body=False)
    direction = make_uptrend_candles(10)  # Not enough
    entry = make_uptrend_candles(5)
    signal = engine.evaluate(direction, entry)
    assert signal.active is False


def test_reversal_mode():
    engine = SignalEngine(min_direction_candles=60, require_strong_body=False, reversal=True)
    direction = make_uptrend_candles(100, start=1.0, step=0.001)
    last = direction[-1].close
    entry = make_uptrend_candles(10, start=last, step=0.001)
    signal = engine.evaluate(direction, entry)
    # In reversal mode, uptrend means sell
    assert signal.direction == "sell"


def test_strong_body_mode():
    engine = SignalEngine(min_direction_candles=60, require_strong_body=True,
                          min_body_pips=0.001, body_vs_avg_ratio=1.0)
    # Continuous uptrend with strong matching bodies (clearly above threshold)
    direction = make_uptrend_candles(100, start=1.0, step=0.01)
    last = direction[-1].close
    entry = [make_candle(last + 0.02 * i, last + 0.02 * (i + 1), 1000 + i)
             for i in range(5)]
    signal = engine.evaluate(direction, entry)
    assert signal.active is True


def test_average_body():
    candles = [make_candle(1.0, 1.01, i) for i in range(10)]  # body = 0.01 each
    avg = ind.average_body(candles)
    assert abs(avg - 0.01) < 1e-9


if __name__ == "__main__":
    test_ema_basic()
    test_ema_uptrend_lower()
    test_ema_downtrend_higher()
    test_signal_uptrend_buy()
    test_signal_downtrend_sell()
    test_signal_quiet_market_no_trade()
    test_signal_not_enough_candles()
    test_reversal_mode()
    test_strong_body_mode()
    test_average_body()
    print("All strategy tests passed!")