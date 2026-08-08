"""Drop-in HTTP adapter that lets pyquotex talk to Quotex through
`curl_cffi` (real Chrome TLS fingerprint) instead of httpx.

Cloudflare puts market-qx.trade / qxbroker.com behind a managed bot
challenge. httpx's OpenSSL TLS fingerprint is flagged (HTTP 403), while a
genuine browser fingerprint (or curl_cffi impersonating one) passes.
The connector patches pyquotex's Browser to use this client.
"""

from __future__ import annotations

import logging

from curl_cffi import requests as cffi_requests

log = logging.getLogger("quotex.cffi")

IMPERSONATE = "chrome"


class CffiResponse:
    """Mimics the httpx.Response surface that pyquotex's login flow uses."""

    def __init__(self, resp):
        self._resp = resp
        self.status_code = resp.status_code
        self.reason_phrase = resp.reason or ""
        self.url = str(resp.url)
        self.headers = dict(resp.headers)
        self.cookies = dict(resp.cookies)

    @property
    def is_success(self) -> bool:
        return self.status_code < 400

    @property
    def ok(self) -> bool:
        return self.is_success

    @property
    def content(self) -> bytes:
        return self._resp.content

    @property
    def text(self) -> str:
        return self._resp.text

    def json(self):
        return self._resp.json()


class CffiAsyncClient:
    """Async session wrapper with the httpx-like surface pyquotex uses:
    `request(method, url, headers=..., data=..., timeout=...)` and `close()`.
    """

    def __init__(self):
        self._session = cffi_requests.AsyncSession(impersonate=IMPERSONATE)
        self.is_closed = False
        self.cookies = self._session.cookies

    async def request(self, method: str, url: str, **kwargs):
        timeout = kwargs.pop("timeout", 30.0)
        data = kwargs.pop("data", None)
        headers = kwargs.pop("headers", None)
        resp = await self._session.request(
            method,
            url,
            headers=headers,
            data=data,
            timeout=timeout,
            **kwargs,
        )
        if resp.status_code >= 400:
            log.info("HTTP %s from %s", resp.status_code, url)
        return CffiResponse(resp)

    async def close(self) -> None:
        if self.is_closed:
            return
        try:
            await self._session.close()
        except Exception:  # noqa: BLE001
            pass
        self.is_closed = True

    async def aclose(self) -> None:
        await self.close()


def patch_browser_http() -> None:
    """Replace pyquotex's httpx client with the curl_cffi-based one."""
    import pyquotex.network.navigator as navigator

    if getattr(navigator.Browser, "_cffi_patched", False):
        return

    original_init = navigator.Browser.__init__

    def patched_init(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        # Discard the never-used httpx client (it would be flagged by
        # Cloudflare anyway); everything goes through the curl_cffi client.
        self._client = CffiAsyncClient()

    navigator.Browser.__init__ = patched_init
    navigator.Browser._cffi_patched = True
    log.info("Patched pyquotex HTTP layer to use curl_cffi (impersonate=%s)", IMPERSONATE)
