"""Tests for the mock connector."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quotex_bot.connector.mock import MockConnector


def test_connect():
    mc = MockConnector()
    assert mc.connect() is True
    assert mc.is_connected() is True


def test_close():
    mc = MockConnector()
    mc.connect()
    mc.close()
    assert mc.is_connected() is False


def test_get_balance_initial():
    mc = MockConnector(initial_balance=5000.0)
    assert mc.get_balance() == 5000.0


def test_get_candles():
    mc = MockConnector(seed=42)
    candles = mc.get_candles("EUR/USD", 5, 100)
    assert len(candles) == 100
    assert candles[0].time < candles[-1].time  # ascending
    for c in candles:
        assert c.high >= max(c.open, c.close)
        assert c.low <= min(c.open, c.close)


def test_buy_creates_order():
    mc = MockConnector(seed=7)
    order = mc.buy("EUR/USD", 10.0, 5)
    assert order.direction == "buy"
    assert order.amount == 10.0
    assert order.expiry == 5
    assert order.id is not None


def test_sell_creates_order():
    mc = MockConnector(seed=7)
    order = mc.sell("EUR/USD", 10.0, 5)
    assert order.direction == "sell"
    assert order.amount == 10.0
    assert order.expiry == 5


def test_check_trade_open():
    mc = MockConnector(seed=7, speed=0.001)
    order = mc.buy("EUR/USD", 10.0, 60)  # long expiry
    # Should be None (still open) immediately
    result = mc.check_trade(order)
    assert result is None


def test_check_trade_expired():
    mc = MockConnector(seed=7, speed=0.001)
    order = mc.buy("EUR/USD", 10.0, 1)
    order.expires_at = time.time() - 1  # force expired
    result = mc.check_trade(order)
    assert result is not None
    # PnL is either +amount*payout or -amount
    if result.win:
        assert result.pnl == 10.0 * result.payout
    else:
        assert result.pnl == -10.0


def test_get_candles_stateful():
    mc = MockConnector(seed=1)
    c1 = mc.get_candles("EUR/USD", 5, 50)
    c2 = mc.get_candles("EUR/USD", 5, 50)
    # Prices should evolve (state maintained across calls)
    assert c1[-1].close != c2[-1].close or c1[-1].time != c2[-1].time


if __name__ == "__main__":
    test_connect()
    test_close()
    test_get_balance_initial()
    test_get_candles()
    test_buy_creates_order()
    test_sell_creates_order()
    test_check_trade_open()
    test_check_trade_expired()
    test_get_candles_stateful()
    print("All mock connector tests passed!")