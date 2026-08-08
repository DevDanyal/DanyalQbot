"""Market-hours guard.

Forex pairs trade roughly 24/5 (closed weekends). Quotex OTC pairs
(name ends with `_otc`) trade 24/7 — for those the guard is skipped so
the bot can run every day including weekends.

Simplified model: weekend = closed (Saturday/Sunday in configured tz),
weekday = open. Holiday calendars can be layered in later.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

WEEKEND_DAYS = {5, 6}   # Saturday, Sunday


def pair_is_otc(pair: str) -> bool:
    return pair.lower().endswith("_otc")


def market_is_open(pair: str, now: datetime | None = None, tz_name: str = "UTC") -> bool:
    if pair_is_otc(pair):
        return True
    tz = ZoneInfo(tz_name)
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(tz)
    return local.weekday() not in WEEKEND_DAYS


def next_market_open(pair: str, now: datetime | None = None,
                     tz_name: str = "UTC") -> datetime | None:
    if pair_is_otc(pair):
        return now or datetime.now(timezone.utc)
    tz = ZoneInfo(tz_name)
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(tz)
    probe = local.replace(hour=0, minute=0, second=0, microsecond=0)
    while probe.weekday() in WEEKEND_DAYS:
        probe += __import__("datetime").timedelta(days=1)
    if probe.date() <= local.date():
        probe += __import__("datetime").timedelta(days=1)
        while probe.weekday() in WEEKEND_DAYS:
            probe += __import__("datetime").timedelta(days=1)
    return probe.astimezone(timezone.utc)
