# Number Melee

Free-to-play on-chain number guessing game. No deposits. No pot. Just medals.

## Tiers

| Tier    | Medal | Max Players |
|---------|-------|-------------|
| Silver  | 🥈    | 25          |
| Gold    | 🥇    | 18          |
| Diamond | 💎    | 10          |

## How It Works

1. First player to `join(tier)` opens the lobby
2. Second player joins → backend generates secret number + locks commitment on-chain
3. All players guess via free HTTP API (no gas, no signing per guess)
4. 5-second cooldown between guesses per player
5. Correct guess → backend calls `reveal_win()` → winner gets a medal minted on-chain
6. Late joiners welcome until max players or round won
7. Next round opens automatically when someone calls `join()` again

## Leaderboard

Scores: 💎 = 3 pts · 🥇 = 2 pts · 🥈 = 1 pt  
All medals stored permanently on-chain via `MedalAwarded` events.

## Setup

### 1. Deploy Contract

```bash
cd deploy
pip install web3 vyper python-dotenv
# Set PRIVATE_KEY in backend/.env
python deploy.py --network alfajores
```

### 2. Start Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill CONTRACT_ADDRESS + PRIVATE_KEY
python server.py
```

### 3. Start Frontend

```bash
# project root
cp .env.example .env   # fill VITE_CONTRACT_ADDRESS
npm install
npm run dev
```

## MiniPay

- Auto-detects `window.ethereum.isMiniPay` on load → silent connect, no popup
- `join()` tx has no `feeCurrency` — it's a pure gas tx, no cUSD needed
- Guesses are free HTTP calls — zero wallet interaction per guess