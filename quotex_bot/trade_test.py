"""Verify real demo trading works end-to-end: place a BUY and a SELL,
poll for resolution, print results. Uses small demo bets on a live pair.

Usage:
    python trade_test.py [pair] [amount] [expiry]
"""
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from quotex_bot.connector.quotex import QuotexConnector
from quotex_bot.connector.base import ConnectorError

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EURUSD"
AMOUNT = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
EXPIRY = int(sys.argv[3]) if len(sys.argv) > 3 else 15


def resolve(conn, order):
    deadline = time.time() + order.expiry + 5.0
    while time.time() < deadline:
        result = conn.check_trade(order)
        if result is not None:
            return result
        time.sleep(1.0)
    raise ConnectorError(f"Trade {order.id} never resolved")


def main() -> int:
    conn = QuotexConnector(
        email=os.environ["QUOTEX_EMAIL"],
        password=os.environ["QUOTEX_PASSWORD"],
        is_demo=True,
        host=os.environ.get("QUOTEX_HOST", "market-qx.trade"),
        max_retries=2,
        backoff=1.0,
    )
    conn.connect()
    print(f"balance before -> {conn.get_balance():.2f}")

    for direction in ("buy", "sell"):
        order = conn.buy(PAIR, AMOUNT, EXPIRY) if direction == "buy" \
            else conn.sell(PAIR, AMOUNT, EXPIRY)
        print(f"{direction.upper()} placed -> id={order.id} amount={order.amount} "
              f"expiry={order.expiry}s")
        result = resolve(conn, order)
        print(f"  resolved -> win={result.win} pnl={result.pnl:+.2f} "
              f"payout={result.payout}")
        time.sleep(1.0)

    print(f"balance after  -> {conn.get_balance():.2f}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
