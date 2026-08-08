"""Chart photo analyzer.

Takes a photo/screenshot of a trading chart and reads the candles
straight from the pixels: green candles = up, red candles = down. It then
computes the recent trend (EMA + slope + up/down count) and returns an
UP / DOWN / FLAT call with an honest confidence score.

No model is 100% accurate — this is a best-effort read of what the chart
shows. Confidence reflects how strongly the measured signals agree.
"""

from __future__ import annotations

import io

import cv2
import numpy as np

GREEN_LO = (30, 120, 0)      # BGR lower bound for green candle bodies
GREEN_HI = (90, 255, 90)
RED_LO = (0, 0, 110)         # BGR lower bound for red candle bodies
RED_HI = (80, 90, 255)

MAX_WIDTH = 1600


def _decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image (use PNG/JPG).")
    h, w = img.shape[:2]
    if w > MAX_WIDTH:
        scale = MAX_WIDTH / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)),
                         interpolation=cv2.INTER_AREA)
    return img


def _candles_from_mask(mask: np.ndarray, bullish: bool,
                       h: int, w: int) -> list[dict]:
    """Find candle bodies in a single-color mask via connected components."""
    num, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask, connectivity=8)
    candles = []
    for i in range(1, num):
        x, y, cw, ch, area = stats[i]
        if cw < 2 or ch < 3 or area < 6:
            continue
        if y <= 2 or y + ch >= h - 2 or x <= 2 or x + cw >= w - 2:
            continue  # touches edge -> chart border / axis, not a candle
        center_y = y + ch / 2.0
        candles.append({
            "x": x + cw / 2.0,
            "top": y,
            "bottom": y + ch,
            "height": ch,
            "bullish": bullish,
            "close": -center_y,   # higher on screen = higher price
        })
    return candles


def _slope(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)
    m, _ = np.polyfit(x, y, 1)
    return float(m)


def _ema(values: list[float], period: int = 3) -> list[float]:
    out: list[float] = []
    k = 2.0 / (period + 1)
    prev = values[0] if values else 0.0
    for v in values:
        prev = v if prev is None else (v * k + prev * (1 - k))
        out.append(prev)
    return out


def analyze(data: bytes) -> dict:
    """Analyze chart image bytes -> direction verdict + confidence."""
    img = _decode(data)
    h, w = img.shape[:2]
    green_mask = cv2.inRange(img, GREEN_LO, GREEN_HI)
    red_mask = cv2.inRange(img, RED_LO, RED_HI)

    candles = (_candles_from_mask(green_mask, True, h, w)
               + _candles_from_mask(red_mask, False, h, w))
    if not candles:
        return {
            "ok": False,
            "error": ("No candlesticks found. Make sure the photo shows a "
                      "colored candle chart (green/red candles)."),
        }
    candles.sort(key=lambda c: c["x"])

    last = candles[-12:]
    closes = [c["close"] for c in candles]
    recent = [c["close"] for c in last]

    up = sum(1 for c in last if c["bullish"])
    down = len(last) - up
    xs = list(range(len(recent)))
    slope = _slope(xs, recent)
    ema_now = _ema(closes)[-1]
    ema_prev = _ema(closes)[-3] if len(closes) >= 3 else ema_now
    ema_slope = ema_now - ema_prev
    last_bull = last[-1]["bullish"]

    # Score signals: 0 = down, 1 = up, 0.5 = neutral
    s_ratio = up / max(1, len(last))          # candle balance (heaviest)
    s_slope = 1 if slope > 0 else (0 if slope < 0 else 0.5)
    s_ema = 1 if ema_slope > 0 else (0 if ema_slope < 0 else 0.5)
    s_last = 1 if last_bull else 0            # tie-breaker only

    up_score = 0.4 * s_ratio + 0.3 * s_slope + 0.2 * s_ema + 0.1 * s_last

    if up_score >= 0.60:
        direction = "UP"
    elif up_score <= 0.40:
        direction = "DOWN"
    else:
        direction = "FLAT"

    agree_dir = (1 if up_score >= 0.5 else 0)
    agreements = sum(
        1 for s in (s_ratio, s_slope, s_ema, s_last)
        if (agree_dir == 1 and s >= 0.5) or (agree_dir == 0 and s < 0.5)
    )
    confidence = int(45 + agreements * 11)   # 45%..89%
    confidence = min(confidence, 89)
    if direction == "FLAT":
        confidence = min(confidence, 55)

    reasons = [
        (f"{up}/{down} of the last {len(last)} candles are "
         f"{'green (up)' if up >= down else 'red (down)'}"),
        ("trend slope is "
         f"{'up' if slope > 0 else 'down' if slope < 0 else 'flat'}"),
        ("EMA line is "
         f"{'rising' if ema_slope > 0 else 'falling' if ema_slope < 0 else 'flat'}"),
        (f"last candle closed {'up' if last_bull else 'down'}"),
    ]

    return {
        "ok": True,
        "direction": direction,
        "confidence": confidence,
        "candles_detected": len(candles),
        "reasons": reasons,
        "disclaimer": ("Image analysis is a best-effort read of the chart "
                       "photo. It is NOT 100% accurate - always manage risk."),
    }
