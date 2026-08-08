import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "quotex_bot"))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

import pyquotex.api as api_mod
from quotex_bot.connector.quotex import QuotexConnector

orig_on_message = api_mod.QuotexAPI._on_message

async def hooked_on_message(self, msg):
    text = msg.decode("utf-8", errors="ignore") if isinstance(msg, bytes) else str(msg)
    if any(k in text for k in ("orders", "f_orders", "trade", "result", "balance")):
        print(">> MSG:", text[:500])
    return await orig_on_message(self, msg)

api_mod.QuotexAPI._on_message = hooked_on_message

conn = QuotexConnector(
    email=os.environ["QUOTEX_EMAIL"],
    password=os.environ["QUOTEX_PASSWORD"],
    is_demo=True,
    host=os.environ.get("QUOTEX_HOST", "market-qx.trade"),
    max_retries=2,
    backoff=1.0,
)
conn.connect()
print("balance:", conn.get_balance())

print("\n--- attempting conn.buy(EURUSD, 1, 15) via patched fast path ---")
t0 = time.time()
try:
    order = conn.buy("EURUSD", 1, 15)
    print("buy returned:", order)
except Exception as e:
    print("buy raised after %.1fs:" % (time.time() - t0), e)

time.sleep(3)

print("\n--- raw f_orders/open attempt on connector loop ---")
from pyquotex import expiration
from pyquotex.utils import json_utils as json
payload = {
    "asset": "EURUSD",
    "amount": 1.0,
    "time": 15,
    "action": "call",
    "isDemo": True,
    "tournamentId": conn._client.api.tournament_id,
    "requestId": expiration.get_timestamp(),
    "optionType": 3,
}
conn._loop.run(conn._client.api.send_websocket_request(
    f'42["f_orders/open",{json.dumps_str(payload)}]'
))
print("sent f_orders/open; waiting 18s...")
time.sleep(18)
print("buy_id:", getattr(conn._client.api, "buy_id", None),
      "buy_successful:", getattr(conn._client.api, "buy_successful", None))

conn.close()
print("done")
