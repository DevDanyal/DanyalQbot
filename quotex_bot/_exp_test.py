import csv
import sys
import time
sys.path.insert(0, '.')

from quotex_bot.models import Candle
from quotex_bot.backtest.engine import simulate

PAIRS = ('EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD')
EXPS = (30, 60)

print(f'{"pair":8s} {"exp":>4s} {"mode":>9s} {"wins/trades":>12s} {"win%":>6s} {"streak":>7s}')
for pair in PAIRS:
    candles = []
    with open(f'data/real_{pair}.csv', 'r', encoding='utf-8') as fh:
        for row in csv.DictReader(fh):
            candles.append(Candle(time=float(row['time']), open=float(row['open']),
                                  high=float(row['high']), low=float(row['low']),
                                  close=float(row['close'])))
    for exp in EXPS:
        for rev, label in ((False, 'momentum'), (True, 'reversal')):
            t0 = time.time()
            stats = simulate(candles_5s=candles, direction_timeframe=60, direction_ema_period=50,
                             expiry=exp, payout=0.85, bet_percent=0.01, min_body_pips=0.00001,
                             body_vs_avg_ratio=1.5, initial_balance=10000.0,
                             entry_window=25, min_dir_candles=60, ema_slope_bars=3, reversal=rev)
            print(f'{pair:8s} {exp:4d} {label:>9s} {stats["wins"]:>5d}/{stats["trades"]:<6d} '
                  f'{stats["win_rate"]*100:5.2f}%  {stats["worst_loss_streak"]:>5d}')
