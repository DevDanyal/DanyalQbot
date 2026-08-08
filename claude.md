# Quotex Trading Bot — Specifications

Automated binary-options trading bot for Quotex. Connects to the Quotex
platform, reads candle data, decides buy/sell, and trades automatically.
Demo account first, real money later.

---

## 1. Goal

- Take a trade on the Quotex platform that automatically buys (call) or
  sells (put) based on candle analysis.
- Target amounts like $10 or $1000 are implemented as **profit targets /
  daily loss limits**, not as a "guaranteed earn" — the bot cannot
  guarantee profit. It follows a strategy + risk rules and trades
  consistently.
- Start with **5-second scalping**, then widen to 15s / 30s / 1m.
- Bot must **run every day, automatically**, unattended.

---

## 2. Phases (strict order)

| Phase | Account | Expiry | Bet size | Goal |
|-------|---------|--------|----------|------|
| 1 | Quotex official **demo** | 5s | 1-2% of balance | Backtest + run 2-4 weeks of demo trades. Go live only if win rate holds above ~53% (break-even for 85-92% payout). |
| 2 | **Real money (tiny)** | 15-30s | $0.10-0.50 | Survive 1-2 weeks without hitting the daily loss limit. |
| 3 | Real money (scale) | 30s-1m | Raise only on proven edge | Grow gradually. |

Rules:
- Never start live before demo results prove the edge.
- Same code / strategy for demo and live — only account + risk settings differ.

---

## 3. Connection Layer

- **Method:** WebSocket reverse-engineered connection (community `quotexapi`
  style) to the Quotex platform. Fast execution, supports demo and live.
- Fallback (if WebSocket route fails): Playwright browser automation
  controlling the real Quotex site UI. Slower and more fragile.
- Must support: candle history (`get_candles`), buy/sell with amount +
  expiry, balance read, open/closed trade status.
- Unofficial API — can break when Quotex updates. Code must handle that
  gracefully (reconnect + retry, log error, keep running).

---

## 4. Strategy — Trend-Filtered Momentum (v1)

### 4.1 Direction filter (trend)
- Compute **EMA-50 on the 1-minute candles** for the pair.
- Price above EMA → only **buy (call)** trades allowed.
- Price below EMA → only **sell (put)** trades allowed.
- This keeps all trades on the right side of the overall flow.

### 4.2 Entry trigger (strength)
- Look at the last **closed 5-second candle**.
- Enter only if the candle has a **strong body**:
  - Body size greater than a threshold X (e.g., X pips / X% of recent
    average candle range).
  - Candle closed fully above (for buy) or below (for sell) the EMA line.
- **No signal → no trade.** Skipping trades is part of the strategy.

### 4.3 Trade parameters
- Expiry: 5 seconds (demo phase).
- One pair to start: **EUR/USD**.
- One timeframe to start: 5s candles + 1m trend filter.
- Fixed bet: **1-2% of balance per trade**.
- **No martingale / no doubling** — ever. A loss is a loss; bet size does
  not increase after a loss.

### 4.4 Strategy variants to consider later
- Engulfing candle pattern (1m/5m).
- Breakout of recent N-period high/low.
- Momentum scalping with volume.
All variants must be backtested before use.

---

## 5. Risk Management (non-negotiable)

- Fixed % bet per trade: 1-2% of balance.
- **Daily loss limit:** stop trading for the day after losing 10% of the
  day's bankroll. Auto-resume next day.
- **Daily profit target:** optional stop after reaching target (e.g., $10
  or $1000) — prevents giving profits back.
- **Total max loss guard:** absolute stop in case daily limit fails.
- **Kill-switch:** manual + automatic (both limits). When triggered, the
  bot goes idle until the next trading day.
- No martingale. No revenge trading. No increasing bet size on loss.

---

## 6. Daily Runner / Operations (runs every day)

- **Market-hours guard:** only trade when the market for the pair is open.
  Idle on weekends/holidays. Prevents burning signals on closed markets.
- **Crash-proof loop:** any error (connection drop, API change, timeout)
  → reconnect + retry, never a dead process. Log every error.
- **Supervisor:** run as a persistent background process.
  - Windows: Task Scheduler or NSSM (auto-start on boot, restart on crash).
  - Linux: systemd service or Docker with `restart=always`.
- **Daily reset:** profit/loss counters reset at 00:00 or market open.
  Daily history appended to CSV/DB.
- **Logging:** every signal, trade, balance change, error, and daily
  summary logged so results can be reviewed each morning.

---

## 7. Project Structure (target)

```
quotex_bot/
├── main.py              # entry point, runs the loop
├── config.yaml          # pair, timeframe, expiry, bet %, limits
├── connector/           # WebSocket wrapper to Quotex (demo/live)
├── strategy/            # signal engine (EMA + candle strength)
├── risk/                # bet sizing, daily limits, kill-switch
├── scheduler/           # market hours, daily reset, reconnect loop
├── backtest/            # replay historical candles against strategy
├── data/                # candle dumps + trade logs (CSV)
└── requirements.txt     # dependencies
```

---

## 8. Data & Backtesting

- Pull historical candles from Quotex (demo) via the API and dump to CSV.
- Run the strategy over the historical data BEFORE any live trading.
- Measure: win rate, avg payout, net P/L, max drawdown, streak of losses.
- Only proceed to live if backtest + demo results show a sustainable edge.

---

## 9. How to Run

```bash
pip install -r requirements.txt
python main.py
```

- The bot connects to Quotex and runs 24/7 by itself.
- To keep it running when the laptop is closed: configure as a
  scheduled task / background service so it auto-starts on boot and
  restarts after a crash.
- Review yesterday's trade log each morning; do not intervene mid-day
  unless a limit trips.

---

## 10. Constraints & Warnings

- Binary options have negative expected value long-term. The bot manages
  risk; it cannot guarantee profit.
- Quotex has **no official public trading API**. Connection is
  reverse-engineered and may break on platform updates.
- Automated trading on real accounts can be **flagged/banned**. Use demo
  for experimentation; keep live activity conservative.
- 5-second trades are the highest-risk mode (mostly noise). Expect thin
  margin: at 85-92% payout the break-even win rate is ~53%.
- Never commit credentials or secrets to the repository.
