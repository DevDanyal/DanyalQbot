"""Collect real candles for all configured pairs into data/real_<PAIR>.csv."""
import sys, csv, time
sys.path.insert(0, '.')
from pathlib import Path
from quotex_bot.config import Config
from quotex_bot.connector.quotex import QuotexConnector
from quotex_bot.utils.logging import setup_logger

cfg = Config.from_yaml('config.yaml')
setup_logger('collect', cfg.logging.get('level', 'INFO'), None)

pairs = cfg.market.get('pairs') or [cfg.market.get('pair', 'EURUSD')]
tf = int(cfg.strategy.get('entry_timeframe', 5))
count = int(sys.argv[1]) if len(sys.argv) > 1 else 12000

conn = QuotexConnector(
    email=cfg.account.get('email', ''),
    password=cfg.account.get('password', ''),
    is_demo=cfg.account.get('mode') != 'live',
    host=cfg.get('connector.host', 'market-qx.trade'),
    proxy=cfg.get('connector.proxy', ''),
)
conn.connect()
print('Connected. Balance:', conn.get_balance())
outdir = Path('data')
outdir.mkdir(exist_ok=True)
for pair in pairs:
    t0 = time.time()
    candles = conn.get_candles(pair, tf, count)
    out = outdir / f"real_{pair}.csv"
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=['time', 'open', 'high', 'low', 'close', 'volume'])
        w.writeheader()
        for c in candles:
            w.writerow(c.as_dict())
    print(f'{pair}: {len(candles)} candles in {time.time()-t0:.1f}s -> {out}')
conn.close()
print('done')
