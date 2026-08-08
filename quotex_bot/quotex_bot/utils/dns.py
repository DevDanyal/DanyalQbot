"""DNS fallback so the bot can reach Quotex even when the OS/ISP DNS
blocks or fails to resolve the platform hostnames.

Some ISPs and routers block binary-options domains at the DNS level while
the sites themselves are reachable (they sit behind Cloudflare). When the
OS resolver fails for a host, we query a public DNS (8.8.8.8 / 1.1.1.1)
directly and patch `socket.getaddrinfo` to use the returned IPs — only for
those specific hosts, everything else is untouched.
"""

from __future__ import annotations

import logging
import socket
import threading

import dns.resolver

log = logging.getLogger("quotex.dns")

PUBLIC_DNS = ["8.8.8.8", "1.1.1.8", "1.1.1.1"]

_orig_getaddrinfo = socket.getaddrinfo
_overrides: dict[str, list[str]] = {}
_lock = threading.Lock()
_patched = False


def _resolve_a(host: str) -> list[str]:
    last_error: Exception | None = None
    for server in PUBLIC_DNS:
        try:
            resolver = dns.resolver.Resolver(configure=False)
            resolver.nameservers = [server]
            resolver.lifetime = 5.0
            resolver.timeout = 5.0
            answers = resolver.resolve(host, "A")
            ips = [str(r.address) for r in answers]
            if ips:
                return ips
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    log.warning("Public DNS lookup failed for %s: %s", host, last_error)
    return []


def _patched_getaddrinfo(host, port, family=0, socktype=0, proto=0, flags=0):
    name = host.decode() if isinstance(host, bytes) else host
    if name in _overrides:
        results = []
        types = [socktype] if socktype else [socket.SOCK_STREAM]
        for ip in _overrides[name]:
            for stype in types:
                results.append((socket.AF_INET, stype, proto, "", (ip, port)))
        if results:
            return results
    return _orig_getaddrinfo(host, port, family, socktype, proto, flags)


def ensure_resolution(*hosts: str) -> None:
    """Make sure each host resolves, deterministically.

    The ISP DNS is flaky/poisoned for these domains (works, then fails a
    second later). So instead of probing the OS resolver and only patching
    on failure, we ALWAYS resolve via public DNS and pin the result. This
    keeps resolution stable for the whole process lifetime.
    """
    global _patched
    for host in hosts:
        ips = _resolve_a(host)
        if not ips:
            # public DNS failed too; keep whatever the OS resolver gives us
            log.warning("Could not resolve %s via public DNS; relying on OS resolver", host)
            continue
        with _lock:
            _overrides[host] = ips
        log.info("DNS pin %s -> %s", host, ips)
        if not _patched:
            socket.getaddrinfo = _patched_getaddrinfo
            _patched = True
