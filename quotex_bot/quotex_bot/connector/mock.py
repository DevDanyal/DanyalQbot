"""Synthetic market connector for offline development and testing.

Generates a geometric-random-walk price path so the strategy, risk and
runner logic can be exercised end-to-end without touching Quotex. Trades
are simulated with the configured payout rate.
"""

from __future__ import annotations

import random
import time
from typing import Iterator

from quotex_bot.models import Candle, TradeOrder, TradeResult
from quotex_bot.connector.base import Connector


class MockConnector(Connector):
    name = "mock"

    def __init__(self, initial_balance: float = 10000.0, payout_rate: float = 0.85,
                 start_price: float = 1.0850, seed: int | None = None, speed: float = 10.0):
        self._rng = random.Random(seed)
        self._balance = initial_balance
        self._payout = payout_rate
        self._price = start_price
        self._speed = speed            # times faster than real time
        self._vol = 0.0006             # per-candle volatility
        self._connected = False
        self._orders: dict[str, TradeOrder] = {}
        self._order_seq = 0

    # -- lifecycle ----------------------------------------------------
    def connect(self) -> bool:
        self._connected = True
        return True

    def close(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    # -- market data --------------------------------------------------
    def _next_price(self) -> float:
        # geometric random walk: returns a new ABSOLUTE price
        return self._price * (1 + self._vol * self._rng.gauss(0, 1))

    def get_candles(self, pair: str, timeframe: int, count: int) -> list[Candle]:
        candles: list[Candle] = []
        t = time.time() - (count * timeframe)
        p = self._price
        for _ in range(count):
            o = p
            c = self._next_price()
            high = max(o, c) * (1 + abs(self._rng.gauss(0, self._vol)))
            low = min(o, c) * (1 - abs(self._rng.gauss(0, self._vol)))
            candles.append(Candle(time=t, open=o, high=high, low=low, close=c,
                                  volume=abs(self._rng.gauss(0, 10))))
            p = c
            t += timeframe
        self._price = p
        return candles

    def stream_candles(self, pair: str, timeframe: int) -> Iterator[Candle]:
        interval = timeframe / self._speed
        while self._connected:
            base = time.time()
            o = self._price
            c = self._next_price()
            high = max(o, c) * (1 + abs(self._rng.gauss(0, self._vol)))
            low = min(o, c) * (1 - abs(self._rng.gauss(0, self._vol)))
            candle = Candle(time=time.time(), open=o, high=high, low=low, close=c,
                            volume=abs(self._rng.gauss(0, 10)))
            self._price = c
            yield candle
            elapsed = time.time() - base
            if elapsed < interval:
                time.sleep(interval - elapsed)

    # -- trading ------------------------------------------------------
    def _place(self, pair: str, direction: str, amount: float, expiry: int) -> TradeOrder:
        self._order_seq += 1
        order = TradeOrder(
            id=f"mock-{self._order_seq}",
            pair=pair,
            direction=direction,
            amount=amount,
            expiry=expiry,
            open_price=self._price,
        )
        order.expires_at = time.time() + expiry
        self._orders[order.id] = order
        return order

    def buy(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "buy", amount, expiry)

    def sell(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "sell", amount, expiry)

    def check_trade(self, order: TradeOrder) -> TradeResult | None:
        if time.time() < order.expires_at:
            return None
        # Simulate the path to expiry: up-drift for buys, down for sells.
        p = order.open_price
        bias = 0.00004 if order.direction == "buy" else -0.00004
        for _ in range(10):
            p = p * (1 + bias + self._vol * self._rng.gauss(0, 1))
        win = (p > order.open_price) if order.direction == "buy" else (p < order.open_price)
        pnl = (order.amount * self._payout) if win else -order.amount
        self._balance += pnl
        return TradeResult(order=order, win=win, payout=self._payout, pnl=pnl,
                           closed_at=time.time())

    def get_balance(self) -> float:
        return self._balance
