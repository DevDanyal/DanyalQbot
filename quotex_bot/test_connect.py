"""Quick connectivity check for the Quotex platform.

Run from ANY network (home WiFi, phone hotspot, office) to find out
whether Quotex is reachable from it:

    python test_connect.py

Checks:
  1. DNS  - can we resolve market-qx.trade / ws2.market-qx.trade?
  2. TLS  - can we open a TLS connection to market-qx.trade:443?
  3. HTTP - does the sign-in page respond?
  4. Proxy- does the connection work through QUOTEX_PROXY (if set)?

Exit code 0 = platform reachable, 1 = blocked/unreachable.
"""

from __future__ import annotations

import socket
import ssl
import sys

from quotex_bot.config import load_config
from quotex_bot.utils import dns as dns_fallback

HOST = "market-qx.trade"
WS_HOST = f"ws2.{HOST}"


def dns_ok() -> bool:
    try:
        socket.getaddrinfo(HOST, 443)
        print(f"[OK]   DNS: {HOST} resolves via the OS")
        return True
    except OSError:
        pass
    dns_fallback.ensure_resolution(HOST, WS_HOST)
    try:
        ip = socket.getaddrinfo(HOST, 443)[0][4][0]
        print(f"[OK]   DNS: {HOST} resolves via public DNS fallback -> {ip}")
        return True
    except OSError as exc:
        print(f"[FAIL] DNS: cannot resolve {HOST} (OS or public DNS): {exc}")
        return False


def tls_ok() -> bool:
    if not dns_ok():
        return False
    ctx = ssl.create_default_context()
    ok = False
    for _, _, _, _, sockaddr in socket.getaddrinfo(HOST, 443):
        ip = sockaddr[0]
        try:
            with socket.create_connection((ip, 443), timeout=15) as raw:
                with ctx.wrap_socket(raw, server_hostname=HOST) as tls:
                    peer = tls.getpeercert()
            print(f"[OK]   TLS: handshake with {HOST} ({ip}) succeeded")
            ok = True
        except ssl.SSLError as exc:
            print(f"[FAIL] TLS: handshake with {HOST} ({ip}) reset/blocked: {exc}")
        except OSError as exc:
            print(f"[FAIL] TLS: cannot connect to {HOST} ({ip}): {exc}")
    return ok


def http_ok() -> bool:
    if not tls_ok():
        return False
    try:
        import httpx
        resp = httpx.get(f"https://{HOST}/", timeout=20, follow_redirects=False)
        print(f"[OK]   HTTP: {HOST} responded with status {resp.status_code}")
        return True
    except httpx.ConnectError as exc:
        print(f"[FAIL] HTTP: connection failed: {exc}")
        return False
    except httpx.HTTPError as exc:
        print(f"[WARN] HTTP: responded but with an error: {exc}")
        return True


def proxy_ok() -> bool:
    cfg = load_config()
    proxy = cfg.get("connector.proxy", "")
    if not proxy:
        print("[SKIP] Proxy: none configured (set QUOTEX_PROXY to test)")
        return True
    import os
    os.environ["HTTPS_PROXY"] = proxy
    os.environ["HTTP_PROXY"] = proxy
    try:
        import httpx
        resp = httpx.get(f"https://{HOST}/", timeout=30, follow_redirects=False)
        print(f"[OK]   Proxy: {HOST} reachable through {proxy} (status {resp.status_code})")
        return True
    except httpx.HTTPError as exc:
        print(f"[FAIL] Proxy: through {proxy} failed: {exc}")
        return False


def main() -> int:
    print(f"--- Connectivity check for {HOST} ---")
    results = {
        "DNS": dns_ok(),
        "TLS": tls_ok(),
        "HTTP": http_ok(),
        "Proxy": proxy_ok(),
    }
    if all(v for k, v in results.items()):
        print("\nRESULT: Quotex is reachable from this network.")
        return 0
    print("\nRESULT: BLOCKED on this network (most likely your ISP).")
    print("Try: phone hotspot / another WiFi / a proxy (QUOTEX_PROXY).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
