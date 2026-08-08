"""Connector interface and factory.

All concrete connectors implement this interface so the rest of the bot
is agnostic to whether it talks to Quotex over WebSocket, a Playwright
browser, or a synthetic mock feed.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator

from quotex_bot.models import Candle, TradeOrder, TradeResult


class ConnectorError(Exception):
    """Base error for connector failures (connection drops, timeouts...)."""


class Connector(ABC):
    """Minimal surface the bot needs from a Quotex connection."""

    name: str = "base"

    @abstractmethod
    def connect(self) -> bool:
        """Establish the connection. Returns True when ready."""

    @abstractmethod
    def close(self) -> None:
        """Tear down the connection."""

    @abstractmethod
    def is_connected(self) -> bool:
        """True when the connection is currently usable."""

    @abstractmethod
    def get_balance(self) -> float:
        """Current account balance in account currency."""

    @abstractmethod
    def get_candles(self, pair: str, timeframe: int, count: int) -> list[Candle]:
        """Historical closed candles ending now. Candle.time is close time."""

    @abstractmethod
    def buy(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        """Place a 'call' (price-up) trade."""

    @abstractmethod
    def sell(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        """Place a 'put' (price-down) trade."""

    @abstractmethod
    def check_trade(self, order: TradeOrder) -> TradeResult | None:
        """Resolve a trade once its expiry has passed. None while still open."""

    def stream_candles(self, pair: str, timeframe: int) -> Iterator[Candle]:
        """Yield a closed candle each time `timeframe` seconds elapse."""
        raise NotImplementedError
