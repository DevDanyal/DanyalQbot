"""Tests for the offline backtester."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import quotex_bot.backtest.engine as bt
from quotex_bot.models import Candle, Signal


def make_series(closes, start=1.0, step=5):
    candles = []
    prev = start
    for i, close in enumerate(closes):
        candles.append(Candle(
            time=float(i * step), open=prev,
            high=max(prev, close), low=min(prev, close), close=close,
        ))
        prev = close
    return candles


def test_summarize_counts_refunds_and_keeps_streak_neutral():
    trades = [
        {"win": False, "result": "loss", "pnl": -1.0},
        {"win": False, "result": "refund", "pnl": 0.0},
        {"win": False, "result": "loss", "pnl": -1.0},
        {"win": True, "result": "win", "pnl": 0.85},
    ]
    stats = bt.summarize(trades, 100.0, 0.85)
    assert stats["wins"] == 1
    assert stats["losses"] == 2
    assert stats["refunds"] == 1
    assert stats["decided_trades"] == 3
    assert abs(stats["win_rate"] - (1 / 3)) < 1e-9
    assert abs(stats["win_rate_all"] - 0.25) < 1e-9
    assert stats["net_pnl"] == -1.15
    assert stats["worst_loss_streak"] == 2


def test_summarize_empty():
    stats = bt.summarize([], 100.0, 0.85)
    assert stats["trades"] == 0
    assert stats["win_rate"] == 0.0
    assert stats["net_pnl"] == 0.0


def test_simulate_ties_are_refunds_not_losses():
    # Alternating closes: exit price at +2 candles always equals entry close.
    closes = [1.0, 1.0001] * 50
    candles = make_series(closes, start=0.9999)
    stats = bt.simulate(
        candles_5s=candles,
        expiry=10,
        payout=0.85,
        variant="streak_reversal",
        min_streak=1,
        reversal=True,
        initial_balance=1000.0,
    )
    assert stats["trades"] > 0
    assert stats["refunds"] == stats["trades"]
    assert stats["losses"] == 0
    assert stats["net_pnl"] == 0.0
    assert stats["end_balance"] == 1000.0


def test_simulate_passes_strategy_params(monkeypatch):
    captured = {}

    class FakeEngine:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def evaluate(self, direction_candles, entry_candles):
            return Signal()

    monkeypatch.setattr(bt, "SignalEngine", FakeEngine)
    candles = make_series([1.0 + i * 0.0001 for i in range(80)])
    bt.simulate(
        candles_5s=candles,
        require_strong_body=False,
        variant="streak_reversal",
        min_streak=4,
    )
    assert captured["require_strong_body"] is False
    assert captured["variant"] == "streak_reversal"
    assert captured["min_streak"] == 4


if __name__ == "__main__":
    test_summarize_counts_refunds_and_keeps_streak_neutral()
    test_summarize_empty()
    test_simulate_ties_are_refunds_not_losses()
    print("All backtest tests passed!")
