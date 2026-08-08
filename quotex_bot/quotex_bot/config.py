"""Configuration loading with environment-variable interpolation.

Credentials must never be committed. Use QUOTEX_EMAIL / QUOTEX_PASSWORD
environment variables and reference them as ${VAR} in config.yaml.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import yaml


_ENV_RE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _load_dotenv(*paths: Path) -> None:
    """Load KEY=VALUE lines from .env files into the environment.

    Never overrides variables already set in the environment.
    """
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("\"'")
            if key:
                os.environ.setdefault(key, value)


def _interpolate(value):
    if isinstance(value, str):
        def repl(match):
            name = match.group(1)
            # Missing env vars become "" — mock/backtest modes work without
            # credentials; the live connector validates them explicitly.
            return os.environ.get(name, "")
        return _ENV_RE.sub(repl, value)
    if isinstance(value, dict):
        return {k: _interpolate(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_interpolate(v) for v in value]
    return value


def load_config(path: str | Path | None = None) -> dict:
    path = Path(path or Path(__file__).resolve().parents[1] / "config.yaml")
    _load_dotenv(Path.cwd() / ".env", Path(__file__).resolve().parents[1] / ".env")
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return _interpolate(raw)


class Config:
    """Thin typed accessor over the loaded config dict."""

    def __init__(self, data: dict):
        self.data = data

    @classmethod
    def from_yaml(cls, path: str | Path | None = None) -> "Config":
        return cls(load_config(path))

    def get(self, key: str, default=None):
        node = self.data
        for part in key.split("."):
            if not isinstance(node, dict):
                return default
            node = node.get(part)
            if node is None:
                return default
        return node

    @property
    def account(self) -> dict:
        return self.data.get("account", {})

    @property
    def market(self) -> dict:
        return self.data.get("market", {})

    @property
    def strategy(self) -> dict:
        return self.data.get("strategy", {})

    @property
    def risk(self) -> dict:
        return self.data.get("risk", {})

    @property
    def scheduler(self) -> dict:
        return self.data.get("scheduler", {})

    @property
    def logging(self) -> dict:
        return self.data.get("logging", {})

    @property
    def learning(self) -> dict:
        return self.data.get("learning", {})
