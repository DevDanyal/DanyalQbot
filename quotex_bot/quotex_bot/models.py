"""Core data models shared across the bot."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


@dataclass
class Candle:
    """A single OHLCV candle."""

    time: float          # close time (epoch seconds, UTC)
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def range(self) -> float:
        return self.high - self.low

    @property
    def bullish(self) -> bool:
        return self.close >= self.open

    @property
    def timestamp(self) -> datetime:
        return datetime.fromtimestamp(self.time, tz=timezone.utc)

    def as_dict(self) -> dict:
        return {
            "time": self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


@dataclass
class Signal:
    """Strategy output for the last closed candle."""

    direction: str = "none"   # "buy" | "sell" | "none"
    reason: str = ""
    price: float = 0.0
    ema: float = 0.0
    body: float = 0.0
    avg_body: float = 0.0
    candle_time: float = 0.0

    @property
    def active(self) -> bool:
        return self.direction in ("buy", "sell")


@dataclass
class TradeOrder:
    """A placed order."""

    id: str
    pair: str
    direction: str            # "buy" | "sell"
    amount: float
    expiry: int               # seconds
    opened_at: float = field(default_factory=_now_ts)
    expires_at: float = 0.0
    open_price: float = 0.0

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "pair": self.pair,
            "direction": self.direction,
            "amount": self.amount,
            "expiry": self.expiry,
            "opened_at": self.opened_at,
            "expires_at": self.expires_at,
            "open_price": self.open_price,
        }


@dataclass
class TradeResult:
    """Resolved outcome of a trade."""

    order: TradeOrder
    win: bool | None          # None while still open
    payout: float = 0.0       # net multiple on win (e.g. 0.85)
    pnl: float = 0.0          # signed profit/loss in account currency
    closed_at: float = 0.0

    def as_dict(self) -> dict:
        return {
            "id": self.order.id,
            "pair": self.order.pair,
            "direction": self.order.direction,
            "amount": self.order.amount,
            "expiry": self.order.expiry,
            "opened_at": self.order.opened_at,
            "closed_at": self.closed_at,
            "win": self.win,
            "payout": self.payout,
            "pnl": self.pnl,
        }
