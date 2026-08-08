"""Web dashboard entry point.

Usage:
    python run_web.py                 # http://127.0.0.1:8000
    python run_web.py --port 9000
    python run_web.py --host 0.0.0.0  # reachable from LAN

Serves the two-bot dashboard:
  - Chart Analyst  : upload a chart photo -> image bot reads the candles
                     and gives an UP/DOWN/FLAT verdict with confidence.
  - Auto Trader    : start/stop the trading runner; wins/losses are
                     counted and shown live.
"""

from __future__ import annotations

import argparse
import sys

from quotex_bot.config import Config
from quotex_bot.utils.logging import setup_logger


def main() -> int:
    parser = argparse.ArgumentParser(description="Quotex web dashboard")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--config", default=None, help="path to config.yaml")
    args = parser.parse_args()

    config = Config.from_yaml(args.config)
    setup_logger("quotex", config.logging.get("level", "INFO"),
                 config.logging.get("log_file"))

    from quotex_bot.web.app import main as serve
    print(f"Dashboard: http://{args.host}:{args.port}")
    serve(host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
