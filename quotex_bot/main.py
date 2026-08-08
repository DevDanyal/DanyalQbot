"""Quotex trading bot entry point.

Usage:
    python main.py                    # run the bot (demo by default)
    python main.py --mode backtest    # replay candles against the strategy
    python main.py --mode collect     # download candles to data/candles.csv
    python main.py --mock             # use the synthetic connector (no Quotex)
"""

from __future__ import annotations

import argparse
import sys

from quotex_bot.config import Config
from quotex_bot.utils.logging import setup_logger


def _run(config: Config, mock: bool) -> None:
    from quotex_bot.connector.mock import MockConnector
    from quotex_bot.scheduler.runner import Runner

    if mock:
        connector = MockConnector(
            payout_rate=config.risk.get("payout_rate", 0.85),
            speed=float(config.get("mock.speed", 10.0)),
        )
    else:
        connector = None
    Runner(config, connector).run_forever()


def _backtest(config: Config, candles_csv: str, args) -> None:
    import csv

    from quotex_bot.backtest.engine import format_report, simulate
    from quotex_bot.models import Candle

    candles = []
    with open(candles_csv, "r", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            candles.append(Candle(
                time=float(row["time"]), open=float(row["open"]), high=float(row["high"]),
                low=float(row["low"]), close=float(row["close"]),
                volume=float(row.get("volume") or 0),
            ))
    stats = simulate(
        candles_5s=candles,
        direction_timeframe=config.strategy.get("direction_timeframe", 60),
        direction_ema_period=config.strategy.get("direction_ema_period", 50),
        expiry=config.strategy.get("expiry_seconds", 5),
        payout=config.risk.get("payout_rate", 0.85),
        bet_percent=config.risk.get("bet_percent", 0.01),
        min_body_pips=config.strategy.get("min_body_pips", 0.0003),
        body_vs_avg_ratio=config.strategy.get("body_vs_avg_ratio", 1.5),
        ema_slope_bars=config.strategy.get("ema_slope_bars", 3),
        reversal=config.strategy.get("reversal", False),
        initial_balance=float(args.initial_balance),
    )
    print(format_report(stats))


def _collect(config: Config) -> int:
    from quotex_bot.backtest import fetch_candles
    return fetch_candles.main()


def main() -> int:
    parser = argparse.ArgumentParser(description="Quotex trading bot")
    parser.add_argument("--mode", choices=["run", "backtest", "collect"], default="run")
    parser.add_argument("--config", default=None, help="path to config.yaml")
    parser.add_argument("--mock", action="store_true",
                        help="use synthetic connector instead of Quotex")
    parser.add_argument("--candles", default="data/candles.csv",
                        help="CSV of candles for --mode backtest")
    parser.add_argument("--initial-balance", default="10000", help="starting balance for backtest")
    args = parser.parse_args()

    config = Config.from_yaml(args.config)
    setup_logger("quotex", config.logging.get("level", "INFO"),
                 config.logging.get("log_file"))

    if args.mode == "run":
        _run(config, args.mock)
    elif args.mode == "backtest":
        _backtest(config, args.candles, args)
    elif args.mode == "collect":
        return _collect(config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
