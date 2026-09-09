"""Flask web app: dashboard for the two bots.

- Chart Analyst: upload a chart photo -> image bot reads candles and
  gives an UP/DOWN/FLAT verdict with confidence (chart_analyzer).
- Auto Trader: start/stop the real trading runner from the browser;
  wins/losses are counted and shown from data/trades.csv.

Run with:  python run_web.py   ->   http://127.0.0.1:8000
"""

from __future__ import annotations

import csv
import logging
import os
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from quotex_bot.config import Config
from quotex_bot.web import chart_analyzer

log = logging.getLogger("quotex.web")

ROOT = Path(__file__).resolve().parents[2]          # project root
DATA = ROOT / "data"

TRADE_FIELDS = ["id", "time", "pair", "direction", "amount", "expiry",
                "open_price", "result", "payout", "pnl", "balance_after",
                "signal_reason"]

app = Flask(
    __name__,
    template_folder=str(ROOT / "quotex_bot" / "web" / "templates"),
    static_folder=str(ROOT / "quotex_bot" / "web" / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB uploads


class BotController:
    """Runs the trading Runner in a background thread, UI-controllable."""

    def __init__(self, config: Config):
        self.config = config
        self._thread: threading.Thread | None = None
        self._stop: threading.Event | None = None
        self._runner = None
        self._connector = None
        self._lock = threading.Lock()
        self.started_at: float | None = None
        self.error: str | None = None

    def is_running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(
        self,
        mock: bool = False,
        email: str | None = None,
        password: str | None = None,
        mode: str | None = None,
    ) -> tuple[bool, str]:
        with self._lock:
            if self.is_running():
                return False, "Bot is already running."
            from quotex_bot.scheduler.runner import Runner

            cfg = dict(self.config.data)
            account = dict(cfg.get("account", {}))
            if email is not None:
                account["email"] = email
            if password is not None:
                account["password"] = password
            if mode is not None:
                account["mode"] = mode
            cfg["account"] = account
            self.config = Config(cfg)

            mode = account.get("mode", "demo")
            if mock or self.config.get("connector.backend", "quotex") == "mock":
                from quotex_bot.connector.mock import MockConnector
                self._connector = MockConnector(
                    payout_rate=self.config.risk.get("payout_rate", 0.85),
                    speed=float(self.config.get("mock.speed", 10.0)),
                )
            else:
                from quotex_bot.connector.quotex import QuotexConnector
                self._connector = QuotexConnector(
                    email=self.config.account.get("email") or "",
                    password=self.config.account.get("password") or "",
                    is_demo=(mode != "live"),
                    payout_rate=self.config.risk.get("payout_rate", 0.85),
                    max_retries=self.config.scheduler.get("reconnect_retries", 5),
                    backoff=self.config.scheduler.get("reconnect_backoff", 2.0),
                    host=self.config.get("connector.host", "market-qx.trade"),
                    proxy=self.config.get("connector.proxy", ""),
                )
            self._stop = threading.Event()
            self._runner = Runner(self.config, self._connector)
            self.started_at = time.time()
            self.error = None
            self._thread = threading.Thread(
                target=self._run, daemon=True, name="bot-runner")
            self._thread.start()
            return True, "Bot started."

    def _run(self) -> None:
        try:
            self._runner.run_forever(self._stop)
        except Exception as exc:  # noqa: BLE001
            self.error = f"{type(exc).__name__}: {exc}"
            log.exception("Bot thread crashed")

    def stop(self) -> None:
        if self._stop is not None:
            self._stop.set()

    def status(self) -> dict:
        balance = None
        if self._connector is not None and self.is_running():
            try:
                balance = self._connector.get_balance()
            except Exception:  # noqa: BLE001
                balance = None
        account = self.config.account
        email = account.get("email", "")
        masked = ""
        if email:
            at = email.find("@")
            if at > 0:
                masked = email[: min(3, at)] + "…" + email[at:]
            else:
                masked = email[:3] + "…"
        return {
            "running": self.is_running(),
            "started_at": self.started_at,
            "uptime": round(time.time() - self.started_at, 1)
            if self.started_at else 0,
            "balance": balance,
            "error": self.error,
            "mode": account.get("mode", "demo"),
            "account_email": masked,
        }


class BotRegistry:
    """One BotController per buyer (keyed by customer id)."""

    def __init__(self, base_config: Config):
        self._base_config = base_config
        self._bots: dict[str, BotController] = {}
        self._lock = threading.Lock()

    def _config_for(self, key: str) -> Config:
        cfg = dict(self._base_config.data)
        if key == "default":
            return Config(cfg)
        logging_cfg = dict(cfg.get("logging", {}))
        suffix = f"_{key}"
        logging_cfg["trades_csv"] = f"data/trades{suffix}.csv"
        logging_cfg["daily_csv"] = f"data/daily_summary{suffix}.csv"
        logging_cfg["experience_json"] = f"data/experience{suffix}.json"
        logging_cfg["research_csv"] = f"data/research{suffix}.csv"
        cfg["logging"] = logging_cfg
        return Config(cfg)

    def controller(self, key: str) -> BotController:
        with self._lock:
            if key not in self._bots:
                self._bots[key] = BotController(self._config_for(key))
            return self._bots[key]


def require_token() -> tuple[bool, str | None]:
    """True if the shared BOT_AUTH_TOKEN is accepted.

    If BOT_AUTH_TOKEN is unset, requests are allowed (backwards compatible
    local dev). When set, every bot/stats request must send it in
    `x-bot-token`.
    """
    expected = os.environ.get("BOT_AUTH_TOKEN", "").strip()
    if not expected:
        return True, None
    provided = request.headers.get("x-bot-token", "")
    if provided == expected:
        return True, None
    return False, "Invalid or missing bot token."


def _read_csv(path: Path, fields: list[str]) -> list[dict]:
    if not path.exists():
        return []
    out = []
    try:
        with open(path, "r", encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                if row and any(row.get(f) not in (None, "") for f in fields):
                    out.append({f: row.get(f, "") for f in fields})
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not read %s: %s", path, exc)
    return out


def _stats(key: str = "default") -> dict:
    suffix = "" if key == "default" else f"_{key}"
    trades = _read_csv(DATA / f"trades{suffix}.csv", TRADE_FIELDS)
    wins = sum(1 for t in trades if t["result"] == "WIN")
    losses = sum(1 for t in trades if t["result"] == "LOSS")
    pnl = sum(float(t.get("pnl") or 0) for t in trades)
    daily = _read_csv(DATA / f"daily_summary{suffix}.csv",
                      ["day", "trades", "pnl", "wins", "losses", "end_balance"])

    experience = {"slots": {}}
    exp_file = DATA / f"experience{suffix}.json"
    if exp_file.exists():
        try:
            import json
            experience["slots"] = json.loads(
                exp_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):  # noqa: BLE001
            experience = {"slots": {}}

    return {
        "total_trades": len(trades),
        "wins": wins,
        "losses": losses,
        "win_rate": round(100 * wins / len(trades), 1) if trades else 0.0,
        "pnl": round(pnl, 2),
        "recent": trades[-15:][::-1],
        "daily": daily[-7:][::-1],
        "experience": experience,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    file = request.files.get("image")
    if file is None:
        return jsonify({"ok": False, "error": "No image uploaded."}), 400
    try:
        result = chart_analyzer.analyze(file.read())
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:  # noqa: BLE001
        log.exception("Analyze failed")
        return jsonify({"ok": False, "error": f"Analysis error: {exc}"}), 500
    return jsonify(result)


@app.route("/api/bot/start", methods=["POST"])
def bot_start():
    ok_auth, msg = require_token()
    if not ok_auth:
        return jsonify({"ok": False, "message": msg}), 401
    data = request.json if request.is_json else {}
    key = str(data.get("customer") or "default")
    ctrl = registry.controller(key)
    ok, msg = ctrl.start(
        mock=data.get("mock", False),
        email=data.get("email"),
        password=data.get("password"),
        mode=data.get("mode"),
    )
    return jsonify({"ok": ok, "message": msg, "customer": key})


@app.route("/api/bot/stop", methods=["POST"])
def bot_stop():
    ok_auth, msg = require_token()
    if not ok_auth:
        return jsonify({"ok": False, "message": msg}), 401
    data = request.json if request.is_json else {}
    key = str(data.get("customer") or "default")
    registry.controller(key).stop()
    return jsonify({"ok": True, "message": "Stop requested.", "customer": key})


@app.route("/api/bot/status")
def bot_status():
    ok_auth, msg = require_token()
    if not ok_auth:
        return jsonify({"ok": False, "message": msg}), 401
    key = str(request.args.get("customer") or "default")
    data = registry.controller(key).status()
    data["customer"] = key
    return jsonify(data)


@app.route("/api/stats")
def stats():
    ok_auth, msg = require_token()
    if not ok_auth:
        return jsonify({"ok": False, "message": msg}), 401
    key = str(request.args.get("customer") or "default")
    return jsonify(_stats(key))


@app.route("/api/history")
def history():
    """All trades grouped by trading day (newest day first)."""
    ok_auth, msg = require_token()
    if not ok_auth:
        return jsonify({"ok": False, "message": msg}), 401
    key = str(request.args.get("customer") or "default")
    suffix = "" if key == "default" else f"_{key}"
    trades = _read_csv(DATA / f"trades{suffix}.csv", TRADE_FIELDS)
    by_day: dict[str, list[dict]] = {}
    for t in trades:
        day = (t.get("time") or "")[:10] or "unknown"
        by_day.setdefault(day, []).append(t)

    days = []
    for day, day_trades in by_day.items():
        wins = sum(1 for t in day_trades if t["result"] == "WIN")
        losses = sum(1 for t in day_trades if t["result"] == "LOSS")
        pnl = sum(float(t.get("pnl") or 0) for t in day_trades)
        days.append({
            "day": day,
            "trades": day_trades[::-1],  # newest first
            "wins": wins,
            "losses": losses,
            "pnl": round(pnl, 2),
        })
    days.sort(key=lambda d: d["day"], reverse=True)
    return jsonify({"days": days})


_config = Config.from_yaml()
registry = BotRegistry(_config)


def main(port: int = 8000, host: str = "127.0.0.1") -> None:
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
