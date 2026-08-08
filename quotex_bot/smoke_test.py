"""Smoke test the real QuotexConnector: connect, balance, candles."""
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "quotex_bot"))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from quotex_bot.connector.quotex import QuotexConnector


def main():
    conn = QuotexConnector(
        email=os.environ["QUOTEX_EMAIL"],
        password=os.environ["QUOTEX_PASSWORD"],
        is_demo=True,
        host=os.environ.get("QUOTEX_HOST", "market-qx.trade"),
        max_retries=2,
        backoff=1.0,
    )
    ok = conn.connect()
    print("connect ->", ok)
    if not ok:
        return 1
    print("balance ->", conn.get_balance())
    candles = conn.get_candles("EURUSD_otc", 60, 5)
    print(f"candles(1m) count={len(candles)}")
    for c in candles[:3]:
        print("  ", c)
    conn.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
