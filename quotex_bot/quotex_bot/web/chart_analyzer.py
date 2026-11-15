"""Chart photo analyzer.

Reads candles from chart image pixels (green=up, red=down), summarizes
trend/momentum/S-R, and returns a detailed UP/DOWN/NO TRADE view with a
trade suggestion (direction, expiry, timing/entry note). Best-effort only,
not guaranteed.
"""

from __future__ import annotations

import cv2
import numpy as np

GREEN_LO = (30, 120, 0)
GREEN_HI = (90, 255, 90)
RED_LO = (0, 0, 110)
RED_HI = (80, 90, 255)
MAX_WIDTH = 1600


def _decode(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image (use PNG/JPG/WEBP).")
    h, w = img.shape[:2]
    if w > MAX_WIDTH:
        scale = MAX_WIDTH / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _candles_from_mask(mask: np.ndarray, bullish: bool, h: int, w: int) -> list[dict]:
    num, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    candles = []
    for i in range(1, num):
        x, y, cw, ch, area = stats[i]
        if cw < 2 or ch < 3 or area < 6:
            continue
        if y <= 2 or y + ch >= h - 2 or x <= 2 or x + cw >= w - 2:
            continue
        center_y = y + ch / 2.0
        candles.append({
            "x": float(x + cw / 2.0),
            "height": float(ch),
            "bullish": bullish,
            "bearish": not bullish,
            "close": float(-center_y),
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
    if not values:
        return []
    k = 2.0 / (period + 1)
    prev = values[0]
    out = []
    for v in values:
        prev = v * k + prev * (1 - k)
        out.append(prev)
    return out


def _candle_label(c: dict) -> str:
    size = c["height"]
    if size < 6:
        strength = "small"
    elif size < 14:
        strength = "medium"
    else:
        strength = "strong"
    return f"{'Bullish (green)' if c['bullish'] else 'Bearish (red)'} {strength}"


def analyze(data: bytes) -> dict:
    img = _decode(data)
    h, w = img.shape[:2]
    green_mask = cv2.inRange(img, GREEN_LO, GREEN_HI)
    red_mask = cv2.inRange(img, RED_LO, RED_HI)

    candles = _candles_from_mask(green_mask, True, h, w) + _candles_from_mask(red_mask, False, h, w)
    if not candles:
        return {"ok": False, "error": "No candlesticks found. Use a clear chart image with green/red candles."}
    candles.sort(key=lambda c: c["x"])

    last = candles[-12:]
    closes = [c["close"] for c in candles]
    recent = [c["close"] for c in last]
    up = sum(1 for c in last if c["bullish"])
    down = len(last) - up
    slope = _slope(list(range(len(recent))), recent)
    ema_series = _ema(closes)
    ema_now = ema_series[-1]
    ema_prev = ema_series[-3] if len(ema_series) >= 3 else ema_now
    ema_slope = ema_now - ema_prev
    last_c = last[-1]
    last_bull = last_c["bullish"]

    heights = [c["height"] for c in last]
    avg_h = float(np.mean(heights)) if heights else 0.0
    momentum = "strong" if avg_h >= 12 else ("medium" if avg_h >= 6 else "weak")
    support = min(recent) if recent else None
    resistance = max(recent) if recent else None

    s_ratio = up / max(1, len(last))
    s_slope = 1 if slope > 0 else (0 if slope < 0 else 0.5)
    s_ema = 1 if ema_slope > 0 else (0 if ema_slope < 0 else 0.5)
    s_last = 1 if last_bull else 0
    up_score = 0.4 * s_ratio + 0.3 * s_slope + 0.2 * s_ema + 0.1 * s_last

    if up_score >= 0.60:
        direction = "UP"
    elif up_score <= 0.40:
        direction = "DOWN"
    else:
        direction = "NO_TRADE"

    agree_dir = 1 if up_score >= 0.5 else 0
    agreements = sum(1 for s in (s_ratio, s_slope, s_ema, s_last)
                     if (agree_dir == 1 and s >= 0.5) or (agree_dir == 0 and s < 0.5))
    confidence = min(89, int(45 + agreements * 11))
    if direction == "NO_TRADE":
        confidence = min(confidence, 55)

    last5 = last[-5:]
    candle_details = []
    for idx, c in enumerate(last5, 1):
        pos = "last" if idx == len(last5) else f"-{len(last5)-idx}"
        candle_details.append(f"Candle {pos}: {_candle_label(c)}")

    reasons = [
        f"Last {len(last)} candles: {up} bullish (green), {down} bearish (red).",
        f"Trend slope: {'up' if slope > 0 else 'down' if slope < 0 else 'flat'}.",
        f"EMA: {'rising' if ema_slope > 0 else 'falling' if ema_slope < 0 else 'flat'}.",
        f"Last candle: {'bullish (green)' if last_bull else 'bearish (red)'}, momentum {momentum}.",
    ]
    if support is not None and resistance is not None:
        reasons.append(f"Recent zone: support near lower range, resistance near upper range (image-based).")

    if direction == "UP":
        action = "BUY (CALL / UP)"
        expiry = "15-30s" if momentum == "strong" and agreements >= 3 else "30-60s"
        entry = "Enter after the current candle closes bullish and stays above recent support/EMA."
        timing = f"If momentum holds at candle close, take a {expiry} UP trade (15s only if your platform/chart timing is exact)."
    elif direction == "DOWN":
        action = "SELL (PUT / DOWN)"
        expiry = "15-30s" if momentum == "strong" and agreements >= 3 else "30-60s"
        entry = "Enter after the current candle closes bearish and stays below recent resistance/EMA."
        timing = f"If momentum holds at candle close, take a {expiry} DOWN trade (15s only if your platform/chart timing is exact)."
    else:
        action = "NO TRADE"
        expiry = "-"
        entry = "Wait for a clear bullish or bearish candle with trend agreement."
        timing = "No timing signal: market looks mixed/flat from this image."

    return {
        "ok": True,
        "direction": direction,
        "action": action,
        "confidence": confidence,
        "candles_detected": len(candles),
        "momentum": momentum,
        "reasons": reasons,
        "candle_details": candle_details,
        "trade_plan": {
            "action": action,
            "suggested_expiry": expiry,
            "entry": entry,
            "timing": timing,
        },
        "disclaimer": "Best-effort image analysis, not 100% accurate and not financial advice. Always manage risk.",
    }
