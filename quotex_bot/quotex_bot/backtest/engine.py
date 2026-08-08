"""Offline backtester.

Replays historical candles against the strategy and simulates trades with
a fixed payout rate. No connection to Quotex needed. Reports win rate,
net P/L, drawdown and losing streaks so a strategy can be validated
before any live trading (claude.md section 8).
"""

from __future__ import annotations

import logging
from collections import defaultdict

from quotex_bot.models import Candle, Signal
from quotex_bot.strategy import indicators as ind
from quotex_bot.strategy.engine import SignalEngine

log = logging.getLogger("quotex.backtest")


def aggregate(candles: list[Candle], timeframe: int) -> list[Candle]:
    """Group candles into `timeframe`-second buckets by close time."""
    buckets: dict[int, dict] = {}
    for c in candles:
        key = int(c.time) // timeframe
        b = buckets.setdefault(key, {"time": 0, "open": c.open, "high": c.high,
                                     "low": c.low, "close": c.close, "volume": 0.0})
        b["time"] = max(b["time"], int(c.time))
        b["open"] = b.get("first_open", c.open)
        b.setdefault("first_open", c.open)
        b["high"] = max(b["high"], c.high)
        b["low"] = min(b["low"], c.low)
        b["close"] = c.close
        b["volume"] += c.volume
    return [Candle(time=b["time"], open=b["open"], high=b["high"], low=b["low"],
                   close=b["close"], volume=b["volume"]) for b in buckets.values()]


def simulate(candles_5s: list[Candle], direction_timeframe: int = 60,
             direction_ema_period: int = 50, expiry: int = 5,
             payout: float = 0.85, bet_percent: float = 0.01,
             min_body_pips: float = 0.0003, body_vs_avg_ratio: float = 1.5,
             initial_balance: float = 10000.0, entry_window: int = 25,
             min_dir_candles: int = 60, ema_slope_bars: int = 3,
             reversal: bool = False) -> dict:
    candles_5s.sort(key=lambda c: c.time)
    dir_candles = aggregate(candles_5s, direction_timeframe)
    dir_closes = [c.close for c in dir_candles]
    ema_series = ind.ema(dir_closes, direction_ema_period)

    engine = SignalEngine(
        direction_ema_period=direction_ema_period,
        min_body_pips=min_body_pips,
        body_vs_avg_ratio=body_vs_avg_ratio,
        min_direction_candles=min_dir_candles,
        avg_body_window=entry_window,
        ema_slope_bars=ema_slope_bars,
        reversal=reversal,
    )

    balance = initial_balance
    trades: list[dict] = []
    last_signal_time = -1.0

    def ema_at(candle_time: float) -> float | None:
        # newest 1m close that happened at or before this candle
        idx = -1
        for i, c in enumerate(dir_candles):
            if c.time <= candle_time:
                idx = i
            else:
                break
        if idx < 0:
            return None
        value = ema_series[idx]
        return float(value) if value is not None else None

    def dir_candles_at(candle_time: float) -> list[Candle]:
        return [c for c in dir_candles if c.time <= candle_time]

    i = min_dir_candles
    while i < len(candles_5s):
        candle = candles_5s[i]
        if candle.time <= last_signal_time:
            i += 1
            continue

        ema_val = ema_at(candle.time)
        if ema_val is None:
            i += 1
            continue

        entry = candles_5s[max(0, i - entry_window + 1): i + 1]
        dirs = dir_candles_at(candle.time)
        signal = engine.evaluate(dirs, entry)
        if not signal.active:
            i += 1
            continue

        # fill at this candle's close, resolve `expiry` seconds later
        fill = candle.close
        resolve_time = candle.time + expiry
        j = i + 1
        resolved = None
        while j < len(candles_5s) and candles_5s[j].time < resolve_time:
            j += 1
        if j >= len(candles_5s):
            break
        exit_price = candles_5s[j].close

        win = (exit_price > fill) if signal.direction == "buy" else (exit_price < fill)
        bet = max(0.10, balance * bet_percent)
        pnl = bet * payout if win else -bet
        balance += pnl
        trades.append({
            "time": candle.time,
            "direction": signal.direction,
            "bet": round(bet, 2),
            "fill": fill,
            "exit": exit_price,
            "win": win,
            "pnl": round(pnl, 2),
            "reason": signal.reason,
        })
        last_signal_time = candle.time
        i = j

    return summarize(trades, initial_balance, payout)


def summarize(trades: list[dict], initial_balance: float, payout: float) -> dict:
    wins = sum(1 for t in trades if t["win"])
    losses = len(trades) - wins
    net = sum(t["pnl"] for t in trades)
    peak = initial_balance
    max_dd = 0.0
    balance = initial_balance
    for t in trades:
        balance += t["pnl"]
        peak = max(peak, balance)
        max_dd = max(max_dd, peak - balance)

    worst_streak = 0
    streak = 0
    for t in trades:
        streak = streak + 1 if not t["win"] else 0
        worst_streak = max(worst_streak, streak)

    win_rate = wins / len(trades) if trades else 0.0
    break_even = 1.0 / (1.0 + payout) if payout > 0 else 0.0
    return {
        "trades": len(trades),
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "break_even_win_rate": break_even,
        "net_pnl": round(net, 2),
        "end_balance": round(initial_balance + net, 2),
        "max_drawdown": round(max_dd, 2),
        "worst_loss_streak": worst_streak,
        "avg_pnl": round(net / len(trades), 4) if trades else 0.0,
    }


def format_report(stats: dict) -> str:
    lines = [
        "=== BACKTEST REPORT ===",
        f"Trades:            {stats['trades']}",
        f"Wins / Losses:     {stats['wins']} / {stats['losses']}",
        f"Win rate:          {stats['win_rate']*100:.2f}%  (break-even {stats['break_even_win_rate']*100:.2f}%)",
        f"Net P/L:           {stats['net_pnl']:+.2f}",
        f"End balance:       {stats['end_balance']:.2f}",
        f"Max drawdown:      {stats['max_drawdown']:.2f}",
        f"Worst loss streak: {stats['worst_loss_streak']}",
        f"Avg P/L per trade: {stats['avg_pnl']:+.4f}",
        "=====================",
    ]
    return "\n".join(lines)
