"""Collect historical candles from Quotex (demo) and dump to CSV.

Usage:
    python -m quotex_bot.backtest.fetch_candles --pair EURUSD --timeframe 5 --count 20000

Output goes to data/candles.csv by default.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from quotex_bot.config import Config
from quotex_bot.connector.mock import MockConnector
from quotex_bot.utils.logging import setup_logger


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump Quotex candles to CSV")
    parser.add_argument("--config", default=None, help="path to config.yaml")
    parser.add_argument("--pair", default=None, help="pair to fetch (overrides config)")
    parser.add_argument("--timeframe", type=int, default=None, help="candle seconds")
    parser.add_argument("--count", type=int, default=20000, help="number of candles")
    parser.add_argument("--out", default="data/candles.csv", help="output CSV path")
    parser.add_argument("--mock", action="store_true", help="use synthetic feed (no connection)")
    args = parser.parse_args()

    config = Config.from_yaml(args.config)
    setup_logger("fetch", config.logging.get("level", "INFO"), config.logging.get("log_file"))

    pair = args.pair or config.market.get("pair", "EURUSD")
    timeframe = args.timeframe or config.strategy.get("entry_timeframe", 5)

    if args.mock:
        connector = MockConnector(seed=42)
        connector.connect()
    else:
        from quotex_bot.connector.quotex import QuotexConnector
        connector = QuotexConnector(
            email=config.account.get("email", ""),
            password=config.account.get("password", ""),
            is_demo=config.account.get("mode") != "live",
            host=config.get("connector.host", "market-qx.trade"),
            proxy=config.get("connector.proxy", ""),
        )
        connector.connect()

    print(f"Fetching {args.count} x {timeframe}s candles for {pair}...")
    candles = connector.get_candles(pair, timeframe, args.count)
    connector.close()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["time", "open", "high", "low", "close", "volume"])
        writer.writeheader()
        for c in candles:
            writer.writerow(c.as_dict())
    print(f"Wrote {len(candles)} candles to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
