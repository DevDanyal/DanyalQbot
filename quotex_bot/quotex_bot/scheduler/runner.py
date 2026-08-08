"""Crash-proof trading loop (runs every day, unattended).

Responsibilities:
- keep a live connection (reconnect + backoff on any failure)
- daily reset of risk counters
- market-hours guard
- candle polling -> strategy -> risk -> trade -> resolve -> log
- never dies: every error is caught, logged and retried
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from quotex_bot.connector.base import Connector
from quotex_bot.connector.mock import MockConnector
from quotex_bot.config import Config
from quotex_bot.experience.memory import ExperienceMemory
from quotex_bot.models import TradeOrder
from quotex_bot.research.agent import ResearchAgent
from quotex_bot.risk.manager import RiskManager
from quotex_bot.scheduler import market
from quotex_bot.strategy.engine import SignalEngine
from quotex_bot.utils.logging import CsvWriter

log = logging.getLogger("quotex.runner")

TRADE_FIELDS = ["id", "time", "pair", "direction", "amount", "expiry",
                "open_price", "result", "payout", "pnl", "balance_after",
                "signal_reason"]


class Runner:
    def __init__(self, config: Config, connector: Connector | None = None):
        self.config = config
        self.connector = connector or self._build_connector(config)
        self.engine = SignalEngine(
            direction_ema_period=config.strategy.get("direction_ema_period", 50),
            min_body_pips=config.strategy.get("min_body_pips", 0.0003),
            body_vs_avg_ratio=config.strategy.get("body_vs_avg_ratio", 1.5),
            ema_slope_bars=config.strategy.get("ema_slope_bars", 3),
            reversal=config.strategy.get("reversal", False),
            require_strong_body=config.strategy.get("require_strong_body", False),
        )
        self.risk = RiskManager(
            bet_percent=config.risk.get("bet_percent", 0.01),
            min_bet=config.risk.get("min_bet", 0.10),
            max_bet=config.risk.get("max_bet", 50.0),
            daily_loss_limit_percent=config.risk.get("daily_loss_limit_percent", 0.10),
            daily_profit_target=config.risk.get("daily_profit_target"),
            total_max_loss_percent=config.risk.get("total_max_loss_percent", 0.30),
            max_daily_trades=config.risk.get("max_daily_trades", 500),
        )
        cfg = config.logging
        self.trades_csv = CsvWriter(cfg.get("trades_csv", "data/trades.csv"), TRADE_FIELDS)
        self.daily_csv = CsvWriter(cfg.get("daily_csv", "data/daily_summary.csv"),
                                   ["day", "trades", "pnl", "wins", "losses", "end_balance"])
        self.pair = config.market.get("pair", "EURUSD")
        pairs = config.market.get("pairs") or [self.pair]
        self.pairs = list(pairs)
        self.tz = config.market.get("timezone", "UTC")
        self.entry_tf = config.strategy.get("entry_timeframe", 5)
        self.dir_tf = config.strategy.get("direction_timeframe", 60)
        self.expiry = config.strategy.get("expiry_seconds", 5)
        self.dir_count = max(config.strategy.get("direction_ema_period", 50) + 5, 60)
        self.entry_window = 25
        self.check_interval = config.scheduler.get("check_interval", 1)
        self.idle_sleep = config.scheduler.get("idle_sleep", 60)
        self._last_trade_time: dict[str, float] = {p: 0.0 for p in self.pairs}
        self._summary_day: str | None = None
        self._summary: dict | None = None
        res = config.get("research", {})
        self.research = ResearchAgent(
            connector=self.connector,
            pairs=self.pairs,
            timeframe=self.entry_tf,
            expiry=self.expiry,
            min_body_pips=config.strategy.get("min_body_pips", 0.00001),
            payout_rate=config.risk.get("payout_rate", 0.85),
            min_sample=int(res.get("min_sample", 20)),
            margin=float(res.get("margin", 0.03)),
            min_body_fraction=float(res.get("min_body_fraction", 0.15)),
            cooldown=float(res.get("cooldown", 120.0)),
            research_csv=config.logging.get("research_csv", "data/research.csv"),
        )
        lrn = config.get("learning", {})
        self.experience = ExperienceMemory(
            file=config.logging.get("experience_json", "data/experience.json"),
            seed_csv=config.logging.get("trades_csv", "data/trades.csv"),
            payout_rate=config.risk.get("payout_rate", 0.85),
            min_sample=int(lrn.get("min_sample", 30)),
            margin=float(lrn.get("margin", 0.03)),
            enabled=bool(lrn.get("enabled", True)),
        )

    # -- construction -------------------------------------------------
    @staticmethod
    def _build_connector(config: Config) -> Connector:
        mode = config.account.get("mode", "demo")
        if config.get("connector.backend", "quotex") == "mock":
            log.warning("Using MOCK connector — no real trading happens.")
            return MockConnector(
                payout_rate=config.risk.get("payout_rate", 0.85),
                speed=config.get("mock.speed", 10.0),
            )
        from quotex_bot.connector.quotex import QuotexConnector
        email = config.account.get("email") or ""
        password = config.account.get("password") or ""
        return QuotexConnector(
            email=email,
            password=password,
            is_demo=(mode != "live"),
            payout_rate=config.risk.get("payout_rate", 0.85),
            max_retries=config.scheduler.get("reconnect_retries", 5),
            backoff=config.scheduler.get("reconnect_backoff", 2.0),
            host=config.get("connector.host", "market-qx.trade"),
            proxy=config.get("connector.proxy", ""),
        )

    # -- main loop ----------------------------------------------------
    def run_forever(self, stop_event=None) -> None:
        """Run the trading loop until interrupted or `stop_event` is set.

        `stop_event`: optional threading.Event used by the web UI to stop
        the bot gracefully (checked each cycle and during sleeps).
        """
        log.info("Runner started. Pairs=%s entry=%ss expiry=%ss dir=%ss",
                 self.pairs, self.entry_tf, self.expiry, self.dir_tf)
        failures = 0
        while True:
            if stop_event is not None and stop_event.is_set():
                log.info("Runner stop requested.")
                break
            try:
                failures = self._cycle(failures, stop_event)
            except KeyboardInterrupt:
                log.info("Interrupted by user.")
                self._flush_daily_summary()
                break
            except Exception as exc:  # noqa: BLE001 - never let the loop die
                failures += 1
                backoff = self.config.scheduler.get("reconnect_backoff", 2.0)
                delay = backoff * (2 ** min(failures - 1, 6))
                log.exception("Runner error (%s). Reconnecting in %.0fs", exc, delay)
                self._safe_close()
                if stop_event is not None and stop_event.wait(delay):
                    break

    def _cycle(self, failures: int, stop_event=None) -> int:
        self._ensure_connected()
        balance = self.connector.get_balance()
        now = datetime.now(timezone.utc)
        day_key = self.risk.day_key(now)

        if self.risk.start_day(balance, day_key):
            log.info("Day %s started", day_key)
        self._roll_day(day_key, balance)

        if not any(market.market_is_open(p, now, self.tz) for p in self.pairs):
            log.info("Market closed (%s). Sleeping %ss.", self.pairs, self.idle_sleep)
            if stop_event is not None:
                return failures if stop_event.wait(self.idle_sleep) else failures
            time.sleep(self.idle_sleep)
            return failures

        can, reason = self.risk.can_trade(balance, day_key)
        if not can:
            log.warning("Blocked: %s", reason)
            if stop_event is not None:
                return failures if stop_event.wait(self.idle_sleep) else failures
            time.sleep(self.idle_sleep)
            return failures

        self.research.refresh()
        traded = False
        for pair in self.pairs:
            if not market.market_is_open(pair, now, self.tz):
                continue
            verdict = self.research.verdict(pair)
            if not verdict.allowed:
                log.debug("RESEARCH %s | no edge: %s", pair, verdict.reason)
                continue
            traded = self._trade_once(pair, balance, day_key, verdict.reversal) or traded
        if not traded:
            if stop_event is not None:
                stop_event.wait(self.check_interval)
            else:
                time.sleep(self.check_interval)
        return 0

    # -- core trading step -------------------------------------------
    def _trade_once(self, pair: str, balance: float, day_key: str,
                    reversal: bool | None = None) -> bool:
        entry_candles = self.connector.get_candles(pair, self.entry_tf, self.entry_window)
        if not entry_candles:
            log.debug("No entry candles yet for %s", pair)
            return False

        latest = entry_candles[-1]
        if latest.time <= self._last_trade_time.get(pair, 0.0):
            return False

        direction_candles = self.connector.get_candles(pair, self.dir_tf, self.dir_count)
        signal = self.engine.evaluate(direction_candles, entry_candles, reversal=reversal)

        if not signal.active:
            log.info("NO TRADE %s | %s", pair, signal.reason)
            return False

        hour = int(datetime.fromtimestamp(latest.time, tz=timezone.utc).hour)
        exp_ok, exp_reason = self.experience.should_trade(pair, signal.direction, hour)
        if not exp_ok:
            log.info("SKIP %s | %s", pair, exp_reason)
            return False
        if exp_reason not in ("learning disabled",) and self.experience.enabled:
            log.debug("EXPERIENCE %s %s | %s", pair, signal.direction, exp_reason)

        bet = self.risk.next_bet(balance)
        log.info("SIGNAL %s %s @ %.5f | bet %.2f | %s",
                 pair, signal.direction.upper(), signal.price, bet, signal.reason)

        if signal.direction == "buy":
            order = self.connector.buy(pair, bet, self.expiry)
        else:
            order = self.connector.sell(pair, bet, self.expiry)
        self._last_trade_time[pair] = latest.time

        result = self._resolve(order)
        balance = self.connector.get_balance()
        self.risk.record_trade(result.pnl, balance, day_key)
        self.experience.record(pair, order.direction, result.win, result.pnl)
        if self._summary:
            self._summary["trades"] += 1
            self._summary["pnl"] += result.pnl
            if result.win:
                self._summary["wins"] += 1
            else:
                self._summary["losses"] += 1
            self._summary["end_balance"] = balance
        self.trades_csv.write({
            "id": order.id,
            "time": datetime.fromtimestamp(order.opened_at, tz=timezone.utc).isoformat(),
            "pair": order.pair,
            "direction": order.direction,
            "amount": order.amount,
            "expiry": order.expiry,
            "open_price": order.open_price,
            "result": "WIN" if result.win else "LOSS",
            "payout": result.payout,
            "pnl": round(result.pnl, 2),
            "balance_after": round(balance, 2),
            "signal_reason": signal.reason,
        })
        if result.win:
            log.info("WIN %s +%.2f | balance %.2f", pair, result.pnl, balance)
        else:
            log.info("LOSS %s %.2f | balance %.2f", pair, result.pnl, balance)
        return True

    def _resolve(self, order: TradeOrder):
        deadline = time.time() + order.expiry + 2.0
        while time.time() < deadline:
            result = self.connector.check_trade(order)
            if result is not None:
                return result
            time.sleep(max(0.2, min(1.0, self.check_interval)))
        result = self.connector.check_trade(order)
        if result is None:
            from quotex_bot.connector.base import ConnectorError
            raise ConnectorError(f"Trade {order.id} never resolved")
        return result

    # -- connection upkeep --------------------------------------------
    def _ensure_connected(self) -> None:
        if self.connector.is_connected():
            return
        log.info("Connecting to Quotex (%s)...", self.config.account.get("mode"))
        self.connector.connect()
        balance = self.connector.get_balance()
        if self.risk.start_balance is None:
            self.risk.start_balance = balance
        log.info("Connected. Balance: %.2f", balance)

    def _safe_close(self) -> None:
        try:
            self.connector.close()
        except Exception:  # noqa: BLE001
            pass

    # -- daily reporting ----------------------------------------------
    def _roll_day(self, day_key: str, balance: float) -> None:
        """Flush the finished day's summary on rollover; start tracking the
        new day. Writes each day exactly once (no duplicate rows)."""
        if self._summary_day is not None and self._summary_day != day_key:
            self._flush_daily_summary()
        if self._summary_day != day_key:
            self._summary_day = day_key
            self._summary = {"day": day_key, "trades": 0, "pnl": 0.0,
                             "wins": 0, "losses": 0, "end_balance": balance}

    def _flush_daily_summary(self) -> None:
        if not self._summary:
            return
        s = self._summary
        self.daily_csv.write({
            "day": s["day"],
            "trades": s["trades"],
            "pnl": round(s["pnl"], 2),
            "wins": s["wins"],
            "losses": s["losses"],
            "end_balance": round(s["end_balance"], 2),
        })
        log.info("Daily summary %s: %d trades | pnl %+.2f | %dW/%dL | balance %.2f",
                 s["day"], s["trades"], s["pnl"], s["wins"], s["losses"],
                 s["end_balance"])
