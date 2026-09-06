"""Tests for risk manager."""

import sys
import os

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quotex_bot.risk.manager import RiskManager


def test_bet_calculation():
    rm = RiskManager(bet_percent=0.02, min_bet=0.10, max_bet=50.0)
    
    # 1000 balance * 2% = 20
    assert rm.next_bet(1000.0) == 20.0
    
    # 100 balance * 2% = 2
    assert rm.next_bet(100.0) == 2.0
    
    # 10 balance * 2% = 0.20 (above min)
    assert rm.next_bet(10.0) == 0.20
    
    # 1 balance * 2% = 0.02 (below min, clamped to 0.10)
    assert rm.next_bet(1.0) == 0.10


def test_bet_max_limit():
    rm = RiskManager(bet_percent=0.02, min_bet=0.10, max_bet=50.0)
    
    # 10000 balance * 2% = 200 (above max, clamped to 50)
    assert rm.next_bet(10000.0) == 50.0


def test_daily_loss_limit():
    rm = RiskManager(bet_percent=0.02, daily_loss_limit_percent=0.10)
    rm.start_day(1000.0, "2026-01-01")
    
    # Can trade initially
    can, reason = rm.can_trade(1000.0, "2026-01-01")
    assert can is True
    
    # Lose 100 (10% of 1000) - should hit limit
    rm.record_trade(-100.0, 900.0, "2026-01-01")
    can, reason = rm.can_trade(900.0, "2026-01-01")
    assert can is False
    assert "daily loss limit" in reason


def test_daily_profit_target():
    rm = RiskManager(bet_percent=0.02, daily_profit_target=50.0)
    rm.start_day(1000.0, "2026-01-01")
    
    # Can trade initially
    can, reason = rm.can_trade(1000.0, "2026-01-01")
    assert can is True
    
    # Gain 50 - should hit target
    rm.record_trade(50.0, 1050.0, "2026-01-01")
    can, reason = rm.can_trade(1050.0, "2026-01-01")
    assert can is False
    assert "daily profit target" in reason


def test_total_max_loss_guard():
    # Total max loss must exceed daily loss limit so it triggers first.
    rm = RiskManager(bet_percent=0.02, daily_loss_limit_percent=0.60,
                     total_max_loss_percent=0.30)
    rm.start_day(1000.0, "2026-01-01")
    rm.start_balance = 1000.0
    
    # Can trade initially
    can, reason = rm.can_trade(1000.0, "2026-01-01")
    assert can is True
    
    # Lose 350 (35% of 1000) - should hit total max loss guard
    rm.record_trade(-350.0, 650.0, "2026-01-01")
    can, reason = rm.can_trade(650.0, "2026-01-01")
    assert can is False
    assert "total max loss guard" in reason


def test_kill_switch():
    rm = RiskManager(bet_percent=0.02)
    rm.start_day(1000.0, "2026-01-01")
    
    # Can trade initially
    can, reason = rm.can_trade(1000.0, "2026-01-01")
    assert can is True
    
    # Manual kill
    rm.kill("manual test")
    can, reason = rm.can_trade(1000.0, "2026-01-01")
    assert can is False
    assert "kill-switch active" in reason


def test_max_daily_trades():
    rm = RiskManager(bet_percent=0.02, max_daily_trades=3)
    rm.start_day(1000.0, "2026-01-01")
    
    # Trade 3 times
    rm.record_trade(1.0, 1001.0, "2026-01-01")
    rm.record_trade(1.0, 1002.0, "2026-01-01")
    rm.record_trade(1.0, 1003.0, "2026-01-01")
    
    # Can trade initially
    can, reason = rm.can_trade(1003.0, "2026-01-01")
    assert can is False
    assert "max daily trades" in reason


def test_day_rollover():
    rm = RiskManager(bet_percent=0.02, daily_loss_limit_percent=0.10)
    rm.start_day(1000.0, "2026-01-01")
    
    # Lose on day 1
    rm.record_trade(-100.0, 900.0, "2026-01-01")
    can, _ = rm.can_trade(900.0, "2026-01-01")
    assert can is False
    
    # New day - should reset
    rm.start_day(900.0, "2026-01-02")
    can, _ = rm.can_trade(900.0, "2026-01-02")
    assert can is True


def test_status():
    rm = RiskManager(bet_percent=0.02)
    rm.start_day(1000.0, "2026-01-01")
    rm.record_trade(50.0, 1050.0, "2026-01-01")
    
    status = rm.status()
    assert status["day"] == "2026-01-01"
    assert status["pnl_today"] == 50.0
    assert status["trades_today"] == 1
    assert status["wins_today"] == 1
    assert status["losses_today"] == 0


if __name__ == "__main__":
    test_bet_calculation()
    test_bet_max_limit()
    test_daily_loss_limit()
    test_daily_profit_target()
    test_total_max_loss_guard()
    test_kill_switch()
    test_max_daily_trades()
    test_day_rollover()
    test_status()
    print("All risk tests passed!")