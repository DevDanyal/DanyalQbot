"""Playwright browser-automation fallback connector.

Only used if the WebSocket (quotexapi) route fails. Drives the real
Quotex website UI. Slower and more fragile than WebSocket, and more
likely to be detected as automation.

Covers: connect, login, balance, and best-effort DOM trading
(buy/sell/check_trade). Candle reads are not possible from the DOM —
the site's chart is a canvas — so `get_candles` raises a clear error
and the bot falls back to the WebSocket connector for market data.
"""

from __future__ import annotations

import logging
import time
from typing import Iterator

from quotex_bot.models import Candle, TradeOrder, TradeResult
from quotex_bot.connector.base import Connector, ConnectorError

log = logging.getLogger("quotex.browser")

SITE_URL = "https://quotex.io"


class BrowserConnector(Connector):
    name = "browser"

    def __init__(self, email: str, password: str, is_demo: bool = True,
                 headless: bool = True, payout_rate: float = 0.85):
        if not email or not password:
            raise ConnectorError("Quotex credentials missing for browser connector")
        self._email = email
        self._password = password
        self._is_demo = is_demo
        self._headless = headless
        self._payout = payout_rate
        self._browser = None
        self._page = None
        self._balance = 0.0

    def connect(self) -> bool:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise ConnectorError("playwright is not installed. Run: pip install -r requirements.txt") from exc
        try:
            p = sync_playwright().start()
            self._browser = p.chromium.launch(headless=self._headless)
            page = self._browser.new_page()
            page.goto(SITE_URL, timeout=60000)
            log.info("Opened %s", SITE_URL)
            self._page = page
            self._login()
            self._balance = self._read_balance()
            log.info("Browser connector ready. Balance: %.2f", self._balance)
            return True
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Browser connect failed: {exc}") from exc

    def _login(self) -> None:
        page = self._page
        page.wait_for_selector("input[type=email], input[type=text]", timeout=60000)
        page.fill("input[type=email]", self._email)
        page.fill("input[type=password]", self._password)
        page.click("button[type=submit], button:has-text('Sign in')")
        page.wait_for_timeout(3000)

    def _read_balance(self) -> float:
        # Balance element selector is site-specific and version-dependent.
        try:
            text = self._page.locator("body").inner_text(timeout=5000)
            import re
            match = re.search(r"(\d{1,7}(?:[.,]\d{1,2})?)", text)
            return float(match.group(1)) if match else 0.0
        except Exception:  # noqa: BLE001
            return 0.0

    def close(self) -> None:
        if self._browser is not None:
            try:
                self._browser.close()
            except Exception:  # noqa: BLE001
                pass
        self._browser = None
        self._page = None

    def is_connected(self) -> bool:
        return self._page is not None

    def get_balance(self) -> float:
        self._balance = self._read_balance()
        return self._balance

    def get_candles(self, pair: str, timeframe: int, count: int) -> list[Candle]:
        # The site draws candles on a canvas — there is no DOM to scrape.
        # Market data must come from the WebSocket connector.
        raise ConnectorError(
            "Browser connector cannot read candles from the DOM. Use the WebSocket connector."
        )

    # -- best-effort DOM trading -------------------------------------
    def _trade_panel(self):
        """Locate the trade amount input and the Buy/Sell button."""
        page = self._page
        amount = page.locator(
            "input[type='number'], input[placeholder*='mount' i], input[placeholder*='amount' i]"
        ).last
        page.wait_for_timeout(500)
        return amount

    def _set_expiry(self, expiry: int) -> None:
        """Select the trade expiry in the panel. Selectors are best-effort."""
        page = self._page
        label = f"{expiry} sec" if expiry else ""
        try:
            dropdown = page.locator(
                "div[class*='trade'] [class*='expiration'], "
                "div[class*='header'] [class*='time']"
            ).first
            dropdown.click()
            page.wait_for_timeout(500)
            option = page.locator(
                f"text='{expiry} sec', text='{expiry}s', "
                f"div[role='option']:has-text('{expiry}')"
            ).first
            option.click(timeout=3000)
            if label:
                log.info("Browser expiry set to %s", label)
        except Exception as exc:  # noqa: BLE001
            log.warning("Browser expiry selection failed (%s); using default panel expiry", exc)

    def _place(self, pair: str, direction: str, amount: float, expiry: int) -> TradeOrder:
        if self._page is None:
            raise ConnectorError("Not connected to the Quotex site")
        try:
            amount_input = self._trade_panel()
            amount_input.fill(str(amount))
            self._set_expiry(expiry)
            button = self._page.locator(
                f"button:has-text('{direction.capitalize()}')"
            ).first
            button.click(timeout=5000)
            log.info("Browser %s clicked for %s @ %.2f / %ss",
                     direction, pair, amount, expiry)
            page = self._page
            order_id = None
            for _ in range(20):
                page.wait_for_timeout(500)
                text = page.locator("body").inner_text(timeout=3000)
                import re
                match = re.search(r"[#]?(\d{8,12})", text)
                if match:
                    order_id = match.group(1)
                    break
            if order_id is None:
                # No id surfaced in the DOM — still record the trade so the
                # runner can poll the trade list for its result.
                order_id = f"browser-{int(time.time() * 1000)}"
            return TradeOrder(id=order_id, pair=pair, direction=direction,
                              amount=amount, expiry=expiry, open_price=self._balance)
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Browser trade failed ({direction} {pair}): {exc}") from exc

    def buy(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "buy", amount, expiry)

    def sell(self, pair: str, amount: float, expiry: int) -> TradeOrder:
        return self._place(pair, "sell", amount, expiry)

    def check_trade(self, order: TradeOrder) -> TradeResult | None:
        """Poll the on-site trade list for the order's win/loss state."""
        if self._page is None:
            raise ConnectorError("Not connected to the Quotex site")
        try:
            text = self._page.locator("body").inner_text(timeout=5000)
            import re
            lower = text.lower()
            if order.id and order.id in lower:
                return None  # still listed as open
            if "win" in lower or "won" in lower:
                win, pnl = True, round(order.amount * self._payout, 2)
            elif "loss" in lower or "lost" in lower:
                win, pnl = False, -order.amount
            else:
                return None
            self._balance = self.get_balance()
            return TradeResult(order=order, win=win, payout=self._payout,
                               pnl=pnl, closed_at=time.time())
        except Exception as exc:  # noqa: BLE001
            raise ConnectorError(f"Browser trade check failed: {exc}") from exc
