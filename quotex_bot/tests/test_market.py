"""Tests for market hours guard."""

from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import sys
import os

# Add parent directory to path so we can import the module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from quotex_bot.scheduler.market import market_is_open, next_market_open, _is_forex_holiday, pair_is_otc


def test_pair_is_otc():
    assert pair_is_otc("EUR/USD_otc") is True
    assert pair_is_otc("EUR/USD") is False
    assert pair_is_otc("GBP/USD_otc") is True


def test_weekend_closed():
    # Saturday
    saturday = datetime(2026, 8, 29, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", saturday) is False
    
    # Sunday
    sunday = datetime(2026, 8, 30, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", sunday) is False


def test_weekday_open():
    # Monday
    monday = datetime(2026, 8, 31, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", monday) is True
    
    # Tuesday
    tuesday = datetime(2026, 9, 1, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", tuesday) is True


def test_otc_always_open():
    # Weekend but OTC
    saturday = datetime(2026, 8, 29, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD_otc", saturday) is True


def test_holiday_closed():
    # Christmas Day 2026
    christmas = datetime(2026, 12, 25, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", christmas) is False
    
    # New Year's Day 2027
    new_year = datetime(2027, 1, 1, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    assert market_is_open("EUR/USD", new_year) is False


def test_holiday_computation():
    # Test that the holiday function works for various dates
    assert _is_forex_holiday(date(2026, 12, 25)) is True
    assert _is_forex_holiday(date(2026, 12, 26)) is True
    assert _is_forex_holiday(date(2026, 7, 4)) is True
    assert _is_forex_holiday(date(2026, 1, 1)) is True
    assert _is_forex_holiday(date(2026, 6, 15)) is False  # Regular day


def test_next_market_open():
    # From Saturday, should open Monday
    saturday = datetime(2026, 8, 29, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    next_open = next_market_open("EUR/USD", saturday)
    assert next_open.weekday() == 0  # Monday
    assert next_open.date() == date(2026, 8, 31)


def test_next_market_open_from_holiday():
    # From Christmas Day, should open next business day
    christmas = datetime(2026, 12, 25, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    next_open = next_market_open("EUR/USD", christmas)
    # Should be December 28 (Monday) since 26th is Boxing Day
    assert next_open.date() == date(2026, 12, 28)


if __name__ == "__main__":
    test_pair_is_otc()
    test_weekend_closed()
    test_weekday_open()
    test_otc_always_open()
    test_holiday_closed()
    test_holiday_computation()
    test_next_market_open()
    test_next_market_open_from_holiday()
    print("All tests passed!")