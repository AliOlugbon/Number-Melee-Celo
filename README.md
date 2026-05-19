# NumberMelee — Celo MiniPay Number-Guessing Game

Number-guessing game on **Celo**, built for **MiniPay**.
No funds collected — MiniPay uses USDT/cUSD only as the gas-fee token.

---

## How It Works

One live round at a time. Three medals per round.

### Solo Mode _(1 player, phase = 0)_

First player joins → 5-minute window opens. Backend locks a secret number commitment on-chain at join time. Player guesses via API (no gas). Medal awarded by elapsed time:

| Time elapsed  | Medal                    |
| ------------- | ------------------------ |
| ≤ 1 minute    | 💎 Diamond               |
| 1 – 3 minutes | 🥇 Gold                  |
| 3 – 5 minutes | 🥈 Silver                |
| > 5 minutes   | No medal — round aborted |

### Competitive Mode _(≥ 2 players, phase = 1)_

When a second player joins, the solo timer cancels and the round becomes a live competition. Backend tracks all guesses off-chain by proximity:

| Result              | Medal      |
| ------------------- | ---------- |
| Exact correct guess | 💎 Diamond |
| Closest guess       | 🥇 Gold    |
| 2nd closest         | 🥈 Silver  |

---

## Round Lifecycle

```
GET /api/commitment          ← frontend fetches before join tx
     │
     ▼
join(commitment)             ← first player tx, phase=0 (solo)
     │
     ├── 2nd player join() → CompetitiveModeActivated, phase=1
     │        │
     │   reveal_win_competitive(winner, medal, num, salt) → phase=2
     │
     ├── solo correct guess → reveal_win(winner, num, salt) → phase=2
     │
     └── 5 min timeout → abort_round() → phase=2
              │
         next join() opens fresh round (round_id++)
```

---

## Contract API

### Player

```
join(commitment: bytes32)
```

First caller passes commitment from `GET /api/commitment`. Subsequent callers pass anything (ignored).

### Backend / Owner

```
reveal_win(winner, number_scaled, salt)
```

Solo-mode reveal — medal computed on-chain from elapsed time.

```
reveal_win_competitive(winner, medal, number_scaled, salt)
```

Competitive-mode reveal — backend passes medal (0=Silver, 1=Gold, 2=Diamond).

```
abort_round()
transfer_ownership(new_owner)
```

### Read

```
get_round()            → (round_id, phase, player_count, opened_at, started_at)
get_medals(player)     → (silver, gold, diamond)
is_joined(player)      → bool
solo_time_remaining()  → uint256  (seconds)
get_constants()        → (MAX_PLAYERS, SOLO_DIAMOND, SOLO_GOLD, SOLO_TIMEOUT)
```

---

## Backend API

| Method | Route              | Description                                   |
| ------ | ------------------ | --------------------------------------------- |
| GET    | `/api/commitment`  | Generate secret, return commitment for join() |
| GET    | `/api/round`       | Current round state                           |
| POST   | `/api/guess`       | Submit a guess (no gas, 5 s cooldown)         |
| GET    | `/api/history`     | Guess feed (`?since=N`)                       |
| GET    | `/api/cooldown`    | Remaining cooldown (`?address=0x…`)           |
| GET    | `/api/leaderboard` | Top 50 by diamond→gold→silver                 |
| GET    | `/api/medals/0x…`  | Medal counts for one player                   |
| GET    | `/health`          | Health check                                  |
| POST   | `/admin/abort`     | Force-abort round (X-Admin-Key header)        |
| GET    | `/admin/status`    | Internal state dump                           |

---

## Frontend Join Flow

```js
// 1. Fetch commitment from backend (backend holds the secret)
const { commitment } = await fetch("/api/commitment").then((r) => r.json());

// 2. Call join() on-chain with MiniPay
await walletClient.writeContract({
  address: CONTRACT_ADDRESS,
  abi: ABI,
  functionName: "join",
  args: [commitment],
});
```

Subsequent players call `join(commitment)` with any bytes32 — the value is ignored on-chain after the first join.

---

## Commitment Encoding

**Python (backend)**

```python
from eth_abi import encode
from eth_utils import keccak
commitment = keccak(encode(["uint256", "bytes32"], [number_scaled, salt_bytes]))
```

**JS (viem)**

```js
import { encodeAbiParameters, keccak256 } from "viem";
const commitment = keccak256(
  encodeAbiParameters(
    [{ type: "uint256" }, { type: "bytes32" }],
    [numberScaled, salt]
  )
);
```

## Commands

```bash
# Deploy local
mox run script/deploy.py

# Deploy testnet
mox run script/deploy.py --network alfajores

# Deploy mainnet
mox run script/deploy.py --network celo

# Test
mox test
# or
pytest tests/ -v

# Backend
pip install flask flask-cors web3 eth-abi python-dotenv
python server.py
```

---

## .env

```
PRIVATE_KEY=0x...
CONTRACT_ADDRESS=0x...
RPC_URL=https://forno.celo.org
ADMIN_API_KEY=changeme
PORT=3001
```
