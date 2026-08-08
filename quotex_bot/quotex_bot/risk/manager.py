"""Risk manager: fixed-% bet sizing, daily limits, kill-switch.

Non-negotiable rules from claude.md section 5:
- Fixed % bet per trade (1-2% of balance). No martingale, no doubling.
- Daily loss limit: stop for the day after losing X% of the day bankroll.
- Daily profit target: optional stop after reaching the target.
- Total max loss guard: absolute stop even if the daily limit fails.
- Kill-switch: when triggered the bot goes idle until the next trading day.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger("quotex.risk")


class RiskManager:
    def __init__(self, bet_percent: float = 0.01, min_bet: float = 0.10,
                 max_bet: float = 50.0,
                 daily_loss_limit_percent: float = 0.10,
                 daily_profit_target: float | None = None,
                 total_max_loss_percent: float = 0.30,
                 max_daily_trades: int = 500):
        if not (0 < bet_percent <= 0.05):
            raise ValueError("bet_percent must be in (0, 0.05] — spec says 1-2%")
        self.bet_percent = bet_percent
        self.min_bet = min_bet
        self.max_bet = max_bet
        self.daily_loss_limit_percent = daily_loss_limit_percent
        self.daily_profit_target = daily_profit_target
        self.total_max_loss_percent = total_max_loss_percent
        self.max_daily_trades = max_daily_trades

        self.day_start_balance: float | None = None
        self.start_balance: float | None = None      # lifetime starting balance
        self.pnl_today = 0.0
        self.trades_today = 0
        self.wins_today = 0
        self.losses_today = 0
        self.killed_reason: str | None = None
        self.killed_on: float | None = None
        self._day: str | None = None

    # -- daily lifecycle ----------------------------------------------
    def start_day(self, balance: float, day_key: str) -> bool:
        """Begin a new trading day. Returns True if the day actually rolled."""
        if self._day == day_key:
            return False
        self._day = day_key
        self.day_start_balance = balance
        self.pnl_today = 0.0
        self.trades_today = 0
        self.wins_today = 0
        self.losses_today = 0
        self.killed_reason = None
        self.killed_on = None
        log.info("New trading day %s. Day bankroll: %.2f", day_key, balance)
        return True

    def day_key(self, now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        return now.strftime("%Y-%m-%d")

    # -- decisions ----------------------------------------------------
    def can_trade(self, balance: float, day_key: str) -> tuple[bool, str | None]:
        """Whether the bot may place a trade right now."""
        if self._day != day_key:
            return False, "trading day not started"
        if self.killed_reason:
            return False, f"kill-switch active: {self.killed_reason}"
        if self.day_start_balance is None:
            return False, "no day bankroll"

        day_bankroll = self.day_start_balance
        loss_limit = day_bankroll * self.daily_loss_limit_percent
        if self.pnl_today <= -loss_limit:
            return False, f"daily loss limit reached ({self.pnl_today:.2f} <= -{loss_limit:.2f})"

        if self.daily_profit_target is not None and self.pnl_today >= self.daily_profit_target:
            return False, f"daily profit target reached ({self.pnl_today:.2f})"

        if self.total_max_loss_percent and self.start_balance is not None:
            total_loss = self.start_balance - balance
            if total_loss >= self.start_balance * self.total_max_loss_percent:
                return False, (f"total max loss guard reached "
                               f"({total_loss:.2f} lost of {self.start_balance:.2f})")

        if self.trades_today >= self.max_daily_trades:
            return False, f"max daily trades reached ({self.max_daily_trades})"

        return True, None

    def next_bet(self, balance: float) -> float:
        """Fixed percentage of the current balance, clamped. Never increases on loss."""
        amount = balance * self.bet_percent
        amount = max(self.min_bet, min(self.max_bet, amount))
        return round(amount, 2)

    def record_trade(self, pnl: float, balance: float, day_key: str) -> None:
        if self._day != day_key:
            self.start_day(balance, day_key)
        self.pnl_today += pnl
        self.trades_today += 1
        if pnl > 0:
            self.wins_today += 1
        else:
            self.losses_today += 1
        if self.start_balance is None:
            self.start_balance = balance - pnl
        if self.killed_reason is None and self.day_start_balance is not None:
            if self.pnl_today <= -(self.day_start_balance * self.daily_loss_limit_percent):
                self._kill("daily loss limit")
            elif self.daily_profit_target is not None and self.pnl_today >= self.daily_profit_target:
                self._kill("daily profit target")
            elif self.total_max_loss_percent and self.start_balance:
                if balance <= self.start_balance * (1 - self.total_max_loss_percent):
                    self._kill("total max loss guard")
        log.info("Trade %d today | PnL today %.2f | balance %.2f",
                 self.trades_today, self.pnl_today, balance)

    def kill(self, reason: str) -> None:
        self._kill(reason)

    def _kill(self, reason: str) -> None:
        from datetime import datetime, timezone
        self.killed_reason = reason
        self.killed_on = datetime.now(timezone.utc).timestamp()
        log.warning("KILL-SWITCH TRIGGERED: %s. Bot idle until next trading day.", reason)

    def status(self) -> dict:
        return {
            "day": self._day,
            "day_start_balance": self.day_start_balance,
            "pnl_today": self.pnl_today,
            "trades_today": self.trades_today,
            "wins_today": self.wins_today,
            "losses_today": self.losses_today,
            "killed_reason": self.killed_reason,
        }
