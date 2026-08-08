"""WebSocket connector to the real Quotex platform.

Uses the community `pyquotex` package (reverse-engineered API, GitHub
only) so the same code path works for both demo and live accounts — only
the account mode differs. Lazy-imports the library so this module stays
importable even when it is not installed.

pyquotex is fully async, so this wrapper bridges calls onto a dedicated
background event loop and presents a synchronous interface to the rest of
the bot.

The API is unofficial and may break on platform updates: every call is
wrapped so failures raise ConnectorError and the runner can reconnect.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from typing import Iterator

from quotex_bot.models import Candle, TradeOrder, TradeResult
from quotex_bot.connector.base import Connector, ConnectorError
from quotex_bot.connector.cffi_adapter import patch_browser_http
from quotex_bot.utils import dns as dns_fallback

log = logging.getLogger("quotex.connector")

DEMO_MODE = "PRACTICE"
LIVE_MODE = "REAL"


class _EventLoopThread:
    """Runs one dedicated asyncio loop on a background thread.

    pyquotex's Quotex client owns long-lived websocket tasks; those must
    live on a single persistent loop, not be created per-call.
    """

    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run(self, coro, timeout: float = 60.0):
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)


def _import_quotex():
    try:
        from pyquotex.stable_api import Quotex
        return Quotex
    except ImportError as exc:
        raise ConnectorError(
            "pyquotex is not installed. Run: pip install -r requirements.txt"
        ) from exc


def _patch_login_host(host: str) -> None:
    """pyquotex's login module hardcodes 'qxbroker.com' for the sign-in
    HTTP flow (network/login.py). On networks where that domain is
    ISP-blocked we must redirect the whole flow to the current platform
    host (e.g. market-qx.trade). Class attrs, so one patch is enough."""
    try:
        from pyquotex.network.login import Login
        if Login.base_url != host:
            Login.base_url = host
            Login.https_base_url = f"https://{host}"
            log.info("Patched pyquotex login host to %s", host)
    except ImportError:
        pass


def patch_buy_channel() -> None:
    """Fix order placement for fast options (OTC and non-OTC).

    pyquotex's buy flow sends ``settings/apply`` then ``orders/open``
    with ``time=<expiry timestamp>``. For fast (5-60s) options the server
    only confirms (``f_orders/open``) when ``orders/open`` carries
    ``time=<duration in seconds>`` and no settings/apply is sent first;
    otherwise buy() times out. We short-circuit the whole flow for fast
    options and fall through to pyquotex for long-duration options.
    """
    try:
        import asyncio
        from pyquotex import expiration
        from pyquotex._api.trading import TradingMixin
        from pyquotex.utils import json_utils as json
    except ImportError:
        return
    if getattr(TradingMixin, "_patched_fast_buy", False):
        return
    orig = TradingMixin.buy

    async def _buy(self, amount, asset, direction, duration, time_mode="TIME"):
        if time_mode.upper() != "TIME":
            return await orig(self, amount, asset, direction, duration, time_mode)

        self.api.buy_id = None
        self.api.buy_successful = None
        self.api.slots.buy_confirm.clear()
        await self.start_realtime_price(asset, duration)
        await self.get_server_time()

        expiration_time = expiration.get_expiration_time_quotex(
            int(time.time()), duration
        )
        payload = {
            "asset": asset,
            "amount": amount,
            "time": expiration_time,
            "action": direction,
            "isDemo": self.api.account_type,
            "tournamentId": self.api.tournament_id,
            "requestId": expiration.get_timestamp(),
            "optionType": 1,
        }
        await self.api.send_websocket_request('42["tick"]')
        await self.api.send_websocket_request(
            f'42["orders/open",{json.dumps_str(payload)}]'
        )
        log.debug("Fast buy sent: %s", payload)

        timeout = duration + 5
        if self.api.buy_id is None:
            try:
                event_data = await self.api.slots.buy_confirm.wait(timeout=timeout)
            except asyncio.TimeoutError:
                return False, "Timeout"
        else:
            event_data = {"id": self.api.buy_id}
        if event_data and isinstance(event_data, dict) and "error" in event_data:
            return False, event_data["error"]
        return True, event_data

    TradingMixin.buy = _buy
    TradingMixin._patched_fast_buy = True
    log.info("Patched pyquotex buy flow for fast options")


def patch_check_win() -> None:
    """Resolve trade results quickly and correctly.

    Upstream ``check_win`` waits up to 300s on a WS close-event slot and
    reports a LOSS on timeout even when the trade actually won. We cap the
    wait at ~expiry+20s and, if the event was missed, fall back to a
    history query for the true result so trades always settle on time.
    """
    try:
        import asyncio
        from pyquotex._api.trading import TradingMixin
    except ImportError:
        return
    if getattr(TradingMixin, "_patched_check_win", False):
        return
    orig = TradingMixin.check_win

    async def _check_win(self, order_id, duration=0):
        if self.api is not None:
            cached = self.api.listinfodata.get(order_id)
            if cached and cached.get("game_state") == 1:
                self.api.listinfodata.delete(order_id)
                return (cached.get("win", "loss"),
                        float(cached.get("profit", 0)))
            key = str(order_id)
            slot = self.api.slots.win_result(key)
            timeout = (duration + 20) if duration else 300
            result = None
            try:
                result = await slot.wait(timeout=timeout)
            except asyncio.TimeoutError:
                result = None
            finally:
                self.api.slots.release_win_result(key)
            if result is not None:
                self.api.listinfodata.delete(order_id)
                return (result.get("win", "loss"),
                        float(result.get("profit", 0)))
            # Close event missed -> query trade history for the real result.
            try:
                for item in await self.get_history():
                    if str(item.get("ticket")) == str(order_id):
                        profit = float(item.get("profitAmount", 0) or 0)
                        return ("win" if profit > 0 else "loss"), profit
            except Exception:  # noqa: BLE001 - keep running
                pass
        return await orig(self, order_id, duration)

    TradingMixin.check_win = _check_win
    TradingMixin._patched_check_win = True
    log.info("Patched pyquotex check_win for fast, correct resolution")


def _pair_name(pair: str) -> str:
    return pair


class QuotexConnector(Connector):
    name = "quotex"

    def __init__(self, email: str, password: str, is_demo: bool = True,
                 remember_me: bool = True, payout_rate: float = 0.85,
                 max_retries: int = 5, backoff: float = 2.0, host: str = "market-qx.trade",
                 proxy: str | None = None, otp_callback=None,
                 order_retries: int = 3):
        if not email or not password:
            raise ConnectorError(
                "Quotex credentials missing. Set QUOTEX_EMAIL and QUOTEX_PASSWORD env vars."
            )
        self._email = email
        self._password = password
        self._is_demo = is_demo
        self._host = host
        self._proxy = proxy or os.environ.get("QUOTEX_PROXY") or ""
        self._payout = payout_rate
        self._max_retries = max_retries
        self._backoff = backoff
        self._order_retries = max(1, order_retries)
        self._client = None
        self._loop = None
        self._balance = 0.0
        self._otp_callback = otp_callback
        self._hist: dict[tuple[str, int], dict[int, Candle]] = {}

    # -- 2FA (email PIN) ----------------------------------------------
    def _default_otp(self, input_message: str) -> str:
        pin = os.environ.get("QUOTEX_PIN", "").strip()
        if pin:
            return pin
        raise ConnectorError(
            "Quotex requires an email PIN code. Check your inbox, then set "
            "QUOTEX_PIN=<code> in .env (or pass otp_callback) and retry."
        )

    # -- lifecycle ----------------------------------------------------
    def _apply_proxy(self) -> None:
        """Make httpx (sign-in page) and websockets (data socket) route
        through the configured proxy. Both honor these standard env vars,
        which keeps site-packages untouched and works across updates."""
        proxy = self._proxy
        if not proxy:
            return
        for key in ("HTTPS_PROXY", "HTTP_PROXY", "WSS_PROXY", "WS_PROXY", "ALL_PROXY"):
            os.environ[key] = proxy
        log.info("Routing Quotex traffic through proxy %s", proxy)

    def connect(self) -> bool:
        Quotex = _import_quotex()
        _patch_login_host(self._host)
        patch_browser_http()
        patch_buy_channel()
        patch_check_win()
        if self._loop is None:
            self._loop = _EventLoopThread()

        # OS/ISP DNS is flaky/poisoned for the platform hosts; pin public DNS.
        dns_fallback.ensure_resolution(self._host, f"ws2.{self._host}")
        self._apply_proxy()

        last_error: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                client = Quotex(self._email, self._password, host=self._host, lang="en",
                                on_otp_callback=self._otp_callback or self._default_otp)
                client.set_account_mode(DEMO_MODE if self._is_demo else LIVE_MODE)
                check, reason = self._loop.run(client.connect(), timeout=60)
                if check:
                    self._client = client
                    self._balance = self._loop.run(client.get_balance())
                    log.info("Connected to Quotex (%s). Balance: %.2f",
                             "demo" if self._is_demo else "live", self._balance)
                    return True
                last_error = ConnectorError(f"Quotex connect refused: {reason}")
            except Exception as exc:  # noqa: BLE001 - keep running through retries
                last_error = exc
            delay = self._backoff * (2 ** (attempt - 1))
            log.warning("Quotex connect attempt %d/%d failed (%s). Retrying in %.0fs",
                        attempt, self._max_retries, last_error, delay)
            time.sleep(delay)
        raise ConnectorError(f"Could not connect to Quotex: {last_error}")

    def close(self) -> None:
        if self._client is not None and self._loop is not None:
            try:
                self._loop.run(self._client.close(), timeout=10)
            except Exception:  # noqa: BLE001
                pass
        self._client = None

    def is_connected(self) -> bool:
        return self._client is not None

    # -- helpers ------------------------------------------------------
    def _guard(self):
        if self._client is None or self._loop is None:
            raise ConnectorError("Not connected to Quotex")

    def _call(self, coro, timeout: float = 60.0):
        """Run a client coroutine, reconnecting once if it fails."""
        self._guard()
        try:
            return self._loop.run(coro, timeout=timeout)
        except Exception as exc:  # noqa: BLE001
            log.warning("Quotex call failed (%s); forcing reconnect", exc)
            self.close()
            self.connect()
            return self._loop.run(coro, timeout=timeout)

    # -- market data --------------------------------------------------
    def get_balance(self) -> float:
        self._balance = self._call(self._client.get_balance())
        return self._balance

    def get_candles(self, pair: str, timeframe: int, count: int) -> list[Candle]:
        """Return the latest `count` closed candles for `pair`/`timeframe`.

        The Quotex server only serves the last ~9 minutes of candle
        history per request, which is far less than EMA-50 on 1m candles
        needs. So we keep a rolling per-(pair, timeframe) buffer: seeded
        once with the tick/candle history and then topped up with the
        live recent window on every call. All candles are normalized to
        CLOSE-time semantics so downstream horizon math is consistent.
        """
        key = (pair, timeframe)
        buf = self._hist.setdefault(key, {})

        if not buf:
            self._seed_history(pair, timeframe, count, buf)

        raw = None
        for _ in range(3):
            raw = self._call(
                self._client.get_candles(_pair_name(pair), None, 120, timeframe),
                timeout=60,
            )
            if raw:
                break
            time.sleep(0.5)
        self._merge_raw(buf, raw, timeframe)

        if not buf:
            return []
        latest = sorted(buf.values(), key=lambda c: c.time)
        return latest[-count:]

    def _seed_history(self, pair: str, timeframe: int, count: int,
                      buf: dict[int, Candle]) -> None:
        span = max(count * timeframe + 60, 120)
        try:
            raw = self._call(
                self._client.get_historical_candles(
                    _pair_name(pair), span, timeframe, timeout=15, max_workers=3
                ),
                timeout=120,
            )
            candles = self._ticks_to_candles(raw, timeframe)
            self._merge_raw(buf, candles, timeframe)
        except Exception as exc:  # noqa: BLE001 - live fetch still works
            log.warning("Deep candle seed failed for %s/%ss: %s", pair, timeframe, exc)

    @staticmethod
    def _ticks_to_candles(raw, timeframe: int) -> list[Candle]:
        """Turn raw history into `timeframe`-second candles (close-time).

        The historical endpoint returns 1-second TICKS
        ({'time': ..., 'price': ...}) for small timeframes, and already
        aggregated OHLC candles for larger ones. Ticks are bucketed into
        candles with the bucket's CLOSE boundary as `time` so they line
        up with the live candles for the same period.
        """
        if timeframe <= 0:
            return []
        buckets: dict[int, dict] = {}
        candles_out: list[Candle] = []
        for item in raw or []:
            if not isinstance(item, dict):
                continue
            if "open" in item and "close" in item:
                # already an OHLC candle -> convert directly (close-time)
                c = QuotexConnector._to_candle(item, timeframe)
                if c is not None:
                    candles_out.append(c)
                continue
            if "price" not in item:
                continue
            try:
                t = float(item["time"])
                price = float(item["price"])
            except (TypeError, ValueError):
                continue
            if t > 1e11:  # millisecond timestamps -> seconds
                t = t / 1000.0
            if t <= 0 or price == 0.0:
                continue
            close_time = (int(t) // timeframe + 1) * timeframe
            b = buckets.setdefault(close_time, {
                "open": price, "high": price, "low": price,
                "close": price, "volume": 0.0,
            })
            b["high"] = max(b["high"], price)
            b["low"] = min(b["low"], price)
            b["close"] = price
            b["volume"] += 1.0
        candles = [
            Candle(time=close_time, open=b["open"], high=b["high"],
                   low=b["low"], close=b["close"], volume=b["volume"])
            for close_time, b in buckets.items()
        ]
        candles.extend(candles_out)
        candles.sort(key=lambda c: c.time)
        return candles

    def _merge_raw(self, buf: dict[int, Candle], raw, timeframe: int = 0) -> None:
        for item in raw or []:
            candle = item if isinstance(item, Candle) else self._to_candle(item, timeframe)
            if candle is not None:
                buf[candle.time] = candle

    @staticmethod
    def _to_candle(item, timeframe: int = 0) -> Candle | None:
        if isinstance(item, dict):
            try:
                if "price" in item and "close" not in item and "open" not in item:
                    t = float(item.get("time", 0))
                    if t > 1e11:
                        t = t / 1000.0
                    p = float(item.get("price", 0))
                    if t <= 0 or p == 0.0:
                        return None
                    return Candle(time=t, open=p, high=p, low=p, close=p,
                                  volume=float(item.get("tick", 0) or 0))
                t = float(item.get("time", 0))
                if t > 1e11:
                    t = t / 1000.0
                if timeframe > 0:
                    # server candle times are bucket OPEN times -> close-time
                    t += timeframe
                candle = Candle(
                    time=t,
                    open=float(item.get("open", 0)),
                    high=float(item.get("high", item.get("max", 0))),
                    low=float(item.get("low", item.get("min", 0))),
                    close=float(item.get("close", 0)),
                    volume=float(item.get("ticks", item.get("volume", 0)) or 0),
                )
                if candle.time <= 0 or candle.close == 0.0:
                    return None
                return candle
            except (TypeError, ValueError):
                return None
        if isinstance(item, (list, tuple)) and len(item) >= 5:
            candle = Candle(
                time=float(item[0]), open=float(item[1]), close=float(item[2]),
                high=float(item[3]), low=float(item[4]),
                volume=float(item[5]) if len(item) > 5 else 0.0,
            )
            if candle.time <= 0 or candle.close == 0.0:
                return None
            return candle
        return None

    # -- trading ------------------------------------------------------
    def _late_ack_order_id(self):
        """Recover the order id when the server acks *after* the wait timed
        out: pyquotex still records the acked id on `client.api.buy_id`.
        Returns the id (str/int) or None if the order truly never placed."""
        try:
            api = getattr(self._client, "api", None)
            return api.buy_id if api is not None else None
        except Exception:  # noqa: BLE001 - best-effort recovery
            return None

    def _place(self, pair: str, direction: str, amount: float, expiry: int) -> TradeOrder:
        api_dir = "call" if direction == "buy" else "put"
        attempt = 0
        while True:
            attempt += 1
            order_id = None
            reason = None
            try:
                ok, info = self._call(
                    self._client.buy(amount, _pair_name(pair), api_dir, int(expiry)),
                    timeout=60,
                )
            except ConnectorError as exc:
                reason = str(exc)
            else:
                if ok and isinstance(info, dict) and "id" in info:
                    order_id = str(info["id"])
                else:
                    reason = info if not isinstance(info, dict) else str(info)
            if order_id is None:
                order_id = self._late_ack_order_id()
            if order_id is not None:
                if attempt > 1:
                    log.info("Order %s %s recovered on attempt %d (late ack, id %s)",
                             direction, pair, attempt, order_id)
                return TradeOrder(id=str(order_id), pair=pair, direction=direction,
                                  amount=amount, expiry=expiry,
                                  open_price=self.get_balance())
            if attempt < self._order_retries:
                delay = min(1.5 * attempt, 6.0)
                log.warning("Order %s %s failed (%s); retrying %d/%d in %.1fs",
                            direction, pair, reason, attempt, self._order_retries, delay)
                time.sleep(delay)
                continue
            raise ConnectorError(f"Quotex rejected {direction} order for {pair}: {reason}")

    def buy(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "buy", amount, expiry)

    def sell(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "sell", amount, expiry)

    def check_trade(self, order: TradeOrder) -> TradeResult | None:
        try:
            status, profit = self._call(
                self._client.check_win(order.id, order.expiry), timeout=310)
        except ConnectorError:
            return None
        if status is None:
            return None
        if status == "win":
            win, pnl = True, float(profit)
        elif status == "equal":
            win, pnl = False, 0.0
        else:  # "loss"
            win, pnl = False, -order.amount
        self._balance = self.get_balance()
        return TradeResult(order=order, win=win, payout=self._payout,
                           pnl=pnl, closed_at=time.time())
