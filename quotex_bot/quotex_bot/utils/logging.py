"""Logging setup and thread-safe CSV writers."""

from __future__ import annotations

import csv
import logging
import threading
from pathlib import Path
from typing import Iterable


def setup_logger(name: str, level: str = "INFO", log_file: str | None = None) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(name)s | %(message)s")

    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    logger.addHandler(stream)

    if log_file:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        logger.addHandler(fh)
    return logger


class CsvWriter:
    """Append-only CSV writer safe for a single writer thread."""

    def __init__(self, path: str | Path, fieldnames: Iterable[str]):
        self.path = Path(path)
        self.fieldnames = list(fieldnames)
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._needs_header = not self.path.exists() or self.path.stat().st_size == 0

    def write(self, row: dict) -> None:
        with self._lock:
            with open(self.path, "a", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=self.fieldnames, extrasaction="ignore")
                if self._needs_header:
                    writer.writeheader()
                    self._needs_header = False
                writer.writerow(row)
