"""Experience memory: the bot learns from its own trade history.

Every placed trade is remembered by the situation it was taken in —
pair, direction, and hour-of-day (UTC). Over time the memory builds a
win-rate profile per situation. Before placing a new trade the runner
consults it and SKIPS situations where history says the bot loses
(win rate below break-even + margin, once enough samples exist).

Knowledge persists in ``data/experience.json`` across restarts, so the
bot gets more experienced the longer it runs. This is a simple,
interpretable statistical memory — it can never guarantee profit, it
only stops the bot from repeating losing situations.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("quotex.experience")


def _bucket(pair: str, direction: str, hour_utc: int) -> str:
    return f"{pair}|{direction}|{hour_utc:02d}"


def _hour_of(ts: float) -> int:
    return datetime.fromtimestamp(ts, tz=timezone.utc).hour


class ExperienceMemory:
    """Persistent win/loss statistics per trade situation."""

    def __init__(
            self,
            file: str = "data/experience.json",
            seed_csv: str | None = "data/trades.csv",
            payout_rate: float = 0.85,
            min_sample: int = 30,
            margin: float = 0.03,
            enabled: bool = True,
    ):
        self.file = file
        self.payout_rate = payout_rate
        self.break_even = 1.0 / (1.0 + payout_rate) if payout_rate > 0 else 0.0
        self.threshold = self.break_even + margin
        self.min_sample = max(1, int(min_sample))
        self.enabled = enabled
        self.buckets: dict[str, dict] = {}
        self._load(seed_csv)

    # -- persistence -------------------------------------------------
    def _load(self, seed_csv: str | None) -> None:
        path = Path(self.file)
        if path.exists():
            try:
                self.buckets = json.loads(path.read_text(encoding="utf-8"))
                log.info("Experience loaded: %d situations remembered from %s",
                         len(self.buckets), self.file)
                return
            except (OSError, ValueError) as exc:
                log.warning("Could not read experience file %s (%s); rebuilding.",
                            self.file, exc)
        if seed_csv:
            self._seed_from_trades_csv(seed_csv)
        if self.buckets:
            self.save()

    def _seed_from_trades_csv(self, seed_csv: str) -> None:
        """Bootstrap knowledge from the existing trade log (once)."""
        path = Path(seed_csv)
        if not path.exists():
            return
        seeded = 0
        try:
            with open(path, "r", encoding="utf-8") as fh:
                header = None
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    if header is None:
                        header = line.split(",")
                        continue
                    row = dict(zip(header, line.split(",")))
                    pair = row.get("pair", "")
                    direction = row.get("direction", "")
                    result = row.get("result", "").upper()
                    if not pair or direction not in ("buy", "sell"):
                        continue
                    hour = 0
                    raw_time = row.get("time", "")
                    try:
                        hour = int(datetime.fromisoformat(raw_time).hour)
                    except ValueError:
                        try:
                            hour = int(raw_time.split("T")[1].split(":")[0])
                        except (IndexError, ValueError):
                            hour = 0
                    key = _bucket(pair, direction, hour)
                    b = self.buckets.setdefault(key, self._blank())
                    b["trades"] += 1
                    if result == "WIN":
                        b["wins"] += 1
                    else:
                        b["losses"] += 1
                    b["pnl"] += float(row.get("pnl", 0) or 0)
                    seeded += 1
        except OSError as exc:
            log.warning("Could not seed experience from %s (%s)", seed_csv, exc)
        if seeded:
            log.info("Experience seeded from %d past trades in %s",
                     seeded, seed_csv)

    @staticmethod
    def _blank() -> dict:
        return {"trades": 0, "wins": 0, "losses": 0, "pnl": 0.0, "last": 0}

    def save(self) -> None:
        try:
            path = Path(self.file)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(self.buckets, indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("Could not save experience to %s (%s)", self.file, exc)

    # -- knowledge queries -------------------------------------------
    def win_rate(self, pair: str, direction: str, hour_utc: int) -> float | None:
        """Historical win rate for a situation, or None if too few samples."""
        key = _bucket(pair, direction, hour_utc)
        b = self.buckets.get(key)
        if b and b["trades"] >= self.min_sample:
            return b["wins"] / b["trades"]
        return None

    def should_trade(
            self, pair: str, direction: str, hour_utc: int
    ) -> tuple[bool, str]:
        """Decide whether history allows a trade in this situation.

        A situation (pair, direction, hour-of-day) is blocked only once it
        has enough history to judge AND its historical win rate is below
        break-even + margin. Until then the bot keeps trading it so
        knowledge can accumulate. Per-slot learning keeps the bot active
        while it builds a precise map of where it wins and loses.
        """
        if not self.enabled:
            return True, "learning disabled"
        rate = self.win_rate(pair, direction, hour_utc)
        if rate is not None:
            if rate < self.threshold:
                return False, (
                    f"experience avoids {pair} {direction} at {hour_utc:02d}:00 "
                    f"UTC ({rate:.0%} win rate < {self.threshold:.0%} "
                    f"threshold over {self._slot(pair, direction, hour_utc)} trades)")
            return True, f"experience ok ({rate:.0%} win rate)"
        return True, (f"experience learning {pair} {direction} "
                      f"(needs {self.min_sample} samples)")

    def _slot(self, pair: str, direction: str, hour_utc: int) -> int:
        key = _bucket(pair, direction, hour_utc)
        b = self.buckets.get(key)
        return b["trades"] if b else 0

    def _pair_stats(self, pair: str) -> dict | None:
        stats = self._blank()
        for key, b in self.buckets.items():
            if key.startswith(pair + "|"):
                stats["trades"] += b["trades"]
                stats["wins"] += b["wins"]
                stats["losses"] += b["losses"]
                stats["pnl"] += b["pnl"]
        return stats if stats["trades"] else None

    # -- learning -----------------------------------------------------
    def record(self, pair: str, direction: str, win: bool,
               pnl: float, ts: float | None = None) -> None:
        """Remember the outcome of one trade."""
        if not self.enabled:
            return
        ts = ts if ts is not None else time.time()
        key = _bucket(pair, direction, _hour_of(ts))
        b = self.buckets.setdefault(key, self._blank())
        b["trades"] += 1
        if win:
            b["wins"] += 1
        else:
            b["losses"] += 1
        b["pnl"] = round(b["pnl"] + pnl, 4)
        b["last"] = int(ts)
        self.save()

    # -- reporting ---------------------------------------------------
    def summary(self) -> dict:
        """Overall stats across all remembered situations."""
        total = self._blank()
        losing = []
        for key, b in self.buckets.items():
            total["trades"] += b["trades"]
            total["wins"] += b["wins"]
            total["losses"] += b["losses"]
            total["pnl"] += b["pnl"]
            if b["trades"] >= self.min_sample:
                rate = b["wins"] / b["trades"]
                if rate < self.threshold:
                    losing.append({"situation": key, "trades": b["trades"],
                                   "win_rate": round(rate, 4),
                                   "pnl": round(b["pnl"], 2)})
        total["pnl"] = round(total["pnl"], 2)
        losing.sort(key=lambda x: x["win_rate"])
        return {"total": total, "blocked_situations": losing}
