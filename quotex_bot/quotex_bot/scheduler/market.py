"""Market-hours guard.

Forex pairs trade roughly 24/5 (closed weekends). Quotex OTC pairs
(name ends with `_otc`) trade 24/7 — for those the guard is skipped so
the bot can run every day including weekends.

Weekend = closed (Saturday/Sunday in configured tz).
Major forex holidays = closed (Christmas, New Year, etc.).
"""

from __future__ import annotations

from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

WEEKEND_DAYS = {5, 6}   # Saturday, Sunday

# Major forex market holidays (US/EU focused)
# Format: (month, day) for fixed holidays, or computed relative dates
FOREX_HOLIDAYS_FIXED = {
    (1, 1),    # New Year's Day
    (7, 4),    # US Independence Day
    (12, 25),  # Christmas Day
    (12, 26),  # Boxing Day (UK)
}

# Relative holidays (computed from a reference point)
# Thanksgiving: 4th Thursday of November
def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """Get nth occurrence of weekday in a month."""
    first = date(year, month, 1)
    # Find first occurrence of weekday
    days_ahead = weekday - first.weekday()
    if days_ahead < 0:
        days_ahead += 7
    first_occurrence = first + timedelta(days=days_ahead)
    return first_occurrence + timedelta(weeks=n-1)

def _is_forex_holiday(d: date) -> bool:
    """Check if a date is a major forex holiday."""
    # Fixed holidays
    if (d.month, d.day) in FOREX_HOLIDAYS_FIXED:
        return True
    
    # Thanksgiving: 4th Thursday of November (weekday 3)
    if d.month == 11 and d.weekday() == 3:
        thanksgiving = _nth_weekday(d.year, 11, 3, 4)
        if d == thanksgiving:
            return True
    
    # Good Friday: 2 days before Easter (computed)
    # Easter algorithm (Anonymous Gregorian algorithm)
    a = d.year % 19
    b = d.year // 100
    c = d.year % 100
    d_easter = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d_easter - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month_easter = (h + l - 7 * m + 114) // 31
    day_easter = ((h + l - 7 * m + 114) % 31) + 1
    easter_date = date(d.year, month_easter, day_easter)
    good_friday = easter_date - timedelta(days=2)
    
    if d == good_friday:
        return True
    
    return False

def pair_is_otc(pair: str) -> bool:
    return pair.lower().endswith("_otc")


def market_is_open(pair: str, now: datetime | None = None, tz_name: str = "UTC") -> bool:
    if pair_is_otc(pair):
        return True
    tz = ZoneInfo(tz_name)
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(tz)
    if local.weekday() in WEEKEND_DAYS:
        return False
    if _is_forex_holiday(local.date()):
        return False
    return True


def next_market_open(pair: str, now: datetime | None = None,
                     tz_name: str = "UTC") -> datetime | None:
    if pair_is_otc(pair):
        return now or datetime.now(timezone.utc)
    tz = ZoneInfo(tz_name)
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(tz)
    probe = local.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Skip weekends and holidays
    while probe.weekday() in WEEKEND_DAYS or _is_forex_holiday(probe.date()):
        probe += timedelta(days=1)
    
    if probe.date() <= local.date():
        probe += timedelta(days=1)
        while probe.weekday() in WEEKEND_DAYS or _is_forex_holiday(probe.date()):
            probe += timedelta(days=1)
    
    return probe.astimezone(timezone.utc)
