"""
NumMelee Backend — server.py

Responsibilities:
  - Watch PlayerJoined events; when count==2 generate secret + call start_round()
  - Serve hints via POST /api/guess (no gas, instant, 5-sec cooldown)
  - Serve guess history via GET /api/history/:tier
  - Call reveal_win() on-chain when correct guess
  - Serve leaderboard via GET /api/leaderboard (aggregated from on-chain events)
  - Re-open rounds automatically (next join() call does it on-chain; backend just
    needs to reset its in-memory secret when a new RoundOpened event fires)

NO MONEY LOGIC: no cUSD, no pot, no fees. Pure hint oracle.

Install:
  pip install flask flask-cors web3 eth-abi python-dotenv

.env:
  PRIVATE_KEY=0x...
  CONTRACT_ADDRESS=0x...
  RPC_URL=https://alfajores-forno.celo-testnet.org
  PORT=3001
"""

import os, secrets, time, threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv
from eth_abi import encode as abi_encode

load_dotenv()

app  = Flask(__name__)
CORS(app)

# ─── Web3 ─────────────────────────────────────────────────────────────────────
RPC_URL          = os.getenv("RPC_URL")
PRIVATE_KEY      = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = Web3.to_checksum_address(os.getenv("CONTRACT_ADDRESS"))
PORT             = int(os.getenv("PORT", 3001))

w3  = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
op  = w3.eth.account.from_key(PRIVATE_KEY)

ABI = [
    {"name":"start_round","type":"function","inputs":[
        {"name":"tier","type":"uint8"},{"name":"commitment","type":"bytes32"}
    ],"outputs":[],"stateMutability":"nonpayable"},
    {"name":"reveal_win","type":"function","inputs":[
        {"name":"tier","type":"uint8"},{"name":"winner","type":"address"},
        {"name":"number_scaled","type":"uint256"},{"name":"salt","type":"bytes32"}
    ],"outputs":[],"stateMutability":"nonpayable"},
    {"name":"abort_round","type":"function","inputs":[
        {"name":"tier","type":"uint8"}
    ],"outputs":[],"stateMutability":"nonpayable"},
    {"name":"get_round","type":"function","inputs":[{"name":"tier","type":"uint8"}],
     "outputs":[{"type":"uint256"},{"type":"uint8"},{"type":"uint256"},{"type":"uint256"}],
     "stateMutability":"view"},
    {"name":"get_medals","type":"function","inputs":[{"name":"player","type":"address"}],
     "outputs":[{"type":"uint256"},{"type":"uint256"},{"type":"uint256"}],
     "stateMutability":"view"},
    {"name":"is_joined","type":"function","inputs":[
        {"name":"tier","type":"uint8"},{"name":"player","type":"address"}
    ],"outputs":[{"type":"bool"}],"stateMutability":"view"},
    # Events
    {"name":"RoundOpened","type":"event","inputs":[
        {"name":"tier","type":"uint8","indexed":True},
        {"name":"round_id","type":"uint256","indexed":True},
        {"name":"opener","type":"address","indexed":False}
    ]},
    {"name":"PlayerJoined","type":"event","inputs":[
        {"name":"tier","type":"uint8","indexed":True},
        {"name":"round_id","type":"uint256","indexed":True},
        {"name":"player","type":"address","indexed":True},
        {"name":"count","type":"uint256","indexed":False}
    ]},
    {"name":"RoundWon","type":"event","inputs":[
        {"name":"tier","type":"uint8","indexed":True},
        {"name":"round_id","type":"uint256","indexed":True},
        {"name":"winner","type":"address","indexed":True},
        {"name":"number_scaled","type":"uint256","indexed":False},
        {"name":"salt","type":"bytes32","indexed":False},
        {"name":"total_players","type":"uint256","indexed":False}
    ]},
    {"name":"MedalAwarded","type":"event","inputs":[
        {"name":"player","type":"address","indexed":True},
        {"name":"tier","type":"uint8","indexed":True},
        {"name":"silver","type":"uint256","indexed":False},
        {"name":"gold","type":"uint256","indexed":False},
        {"name":"diamond","type":"uint256","indexed":False}
    ]},
]

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=ABI)

# ─── Constants ────────────────────────────────────────────────────────────────
TIER_NAMES  = {0: "Silver", 1: "Gold", 2: "Diamond"}
TIER_MAX    = {0: 25,       1: 18,     2: 10}
NUM_MIN     = 1000   # 10.00
NUM_MAX     = 9999   # 99.99
COOLDOWN    = 5      # seconds between guesses per player

# ─── In-memory state ──────────────────────────────────────────────────────────
# Per-tier: secret lives here only while round is active
# { tier: { number_scaled, salt, commitment, history: [], round_id } }
tier_state = {
    i: {"number_scaled": None, "salt": None, "commitment": None,
        "history": [], "round_id": 0}
    for i in range(3)
}

# Cooldowns: (tier, address_lower) → last_guess_timestamp
cooldowns = {}
lock = threading.Lock()

# ─── Helpers ──────────────────────────────────────────────────────────────────
def gen_commitment(number_scaled: int, salt_hex: str) -> bytes:
    salt_bytes = bytes.fromhex(salt_hex)
    encoded    = abi_encode(["uint256", "bytes32"], [number_scaled, salt_bytes])
    return w3.keccak(encoded)

def gen_secret():
    number_scaled = secrets.randbelow(NUM_MAX - NUM_MIN + 1) + NUM_MIN
    salt_hex      = secrets.token_hex(32)
    commitment    = gen_commitment(number_scaled, salt_hex)
    return number_scaled, salt_hex, commitment

def send_tx(fn):
    nonce = w3.eth.get_transaction_count(op.address)
    tx = fn.build_transaction({
        "from": op.address, "nonce": nonce,
        "gasPrice": w3.eth.gas_price, "gas": 300_000,
    })
    signed  = op.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    return w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

def sc2display(s): return f"{int(s)/100:.2f}"

# ─── On-chain event listener ──────────────────────────────────────────────────
_last_block = 0

def poll_events():
    global _last_block
    while True:
        try:
            latest = w3.eth.block_number
            if _last_block == 0:
                _last_block = max(0, latest - 300)

            if latest > _last_block:
                handle_player_joined_events(_last_block + 1, latest)
                handle_round_won_events(_last_block + 1, latest)
                handle_round_opened_events(_last_block + 1, latest)
                _last_block = latest
        except Exception as e:
            print(f"[poll] error: {e}")
        time.sleep(3)

def handle_round_opened_events(from_block, to_block):
    try:
        logs = contract.events.RoundOpened().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            tier     = log["args"]["tier"]
            round_id = log["args"]["round_id"]
            opener   = log["args"]["opener"]
            with lock:
                # New round opened — reset secret (fresh state)
                tier_state[tier].update({
                    "number_scaled": None, "salt": None,
                    "commitment": None, "history": [], "round_id": round_id,
                })
            print(f"[T{tier}/{TIER_NAMES[tier]}] Round #{round_id} opened by {opener[:10]}…")
    except Exception as e:
        print(f"[handle_round_opened] {e}")

def handle_player_joined_events(from_block, to_block):
    try:
        logs = contract.events.PlayerJoined().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            tier   = log["args"]["tier"]
            count  = log["args"]["count"]
            player = log["args"]["player"]
            print(f"[T{tier}/{TIER_NAMES[tier]}] {player[:10]}… joined (count={count})")

            # 2nd player joins → generate secret and start round
            if count == 2:
                threading.Thread(
                    target=do_start_round, args=[tier], daemon=True
                ).start()
    except Exception as e:
        print(f"[handle_player_joined] {e}")

def handle_round_won_events(from_block, to_block):
    """Clear state after a win is confirmed on-chain."""
    try:
        logs = contract.events.RoundWon().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            tier   = log["args"]["tier"]
            winner = log["args"]["winner"]
            num    = log["args"]["number_scaled"]
            print(f"[T{tier}/{TIER_NAMES[tier]}] WON by {winner[:10]}…  number={sc2display(num)}")
            with lock:
                tier_state[tier].update({
                    "number_scaled": None, "salt": None, "commitment": None,
                })
    except Exception as e:
        print(f"[handle_round_won] {e}")

def do_start_round(tier: int):
    """Generate secret, commit on-chain."""
    with lock:
        if tier_state[tier]["commitment"] is not None:
            return  # already started
        number_scaled, salt_hex, commitment = gen_secret()
        receipt = send_tx(contract.functions.start_round(tier, commitment))
        tier_state[tier].update({
            "number_scaled": number_scaled,
            "salt": salt_hex,
            "commitment": commitment.hex(),
        })
        print(f"[T{tier}/{TIER_NAMES[tier]}] Started. Secret={sc2display(number_scaled)}")

def do_reveal_win(tier: int, winner_addr: str):
    """Verify commitment, record winner, award medal."""
    with lock:
        st = tier_state[tier]
        if not st["number_scaled"]:
            return
        try:
            receipt = send_tx(contract.functions.reveal_win(
                tier,
                Web3.to_checksum_address(winner_addr),
                st["number_scaled"],
                bytes.fromhex(st["salt"]),
            ))
            print(f"[T{tier}] reveal_win tx: {receipt['transactionHash'].hex()[:16]}…")
        except Exception as e:
            print(f"[T{tier}] reveal_win FAILED: {e}")

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/api/round/<int:tier>")
def api_round(tier):
    if tier < 0 or tier > 2:
        return jsonify({"error": "invalid tier"}), 400
    info = contract.functions.get_round(tier).call()
    # (round_id, phase, player_count, started_at)
    return jsonify({
        "tier":         tier,
        "tier_name":    TIER_NAMES[tier],
        "max_players":  TIER_MAX[tier],
        "round_id":     info[0],
        "phase":        info[1],
        "player_count": info[2],
        "started_at":   info[3],
    })

@app.route("/api/guess", methods=["POST"])
def api_guess():
    """
    POST /api/guess
    Body: { tier: 0|1|2, address: "0x…", guess: "42.75" }
    Returns: { hint: "higher"|"lower"|"correct" }
    No gas. No signing. Instant. 5-second cooldown enforced.
    """
    data   = request.json or {}
    tier   = int(data.get("tier", -1))
    player = (data.get("address") or "").lower()
    guess_str = str(data.get("guess", ""))

    if tier < 0 or tier > 2:
        return jsonify({"error": "invalid tier"}), 400

    try:
        player_addr = Web3.to_checksum_address(player)
    except Exception:
        return jsonify({"error": "invalid address"}), 400

    # Must have joined on-chain
    if not contract.functions.is_joined(tier, player_addr).call():
        return jsonify({"error": "join the round on-chain first"}), 403

    # Round must be active
    info = contract.functions.get_round(tier).call()
    if info[1] != 1:
        return jsonify({"error": "round not active"}), 400

    # Cooldown
    cd_key  = (tier, player)
    last_ts = cooldowns.get(cd_key, 0)
    now     = time.time()
    wait    = COOLDOWN - (now - last_ts)
    if wait > 0:
        return jsonify({"error": "cooldown", "wait_seconds": round(wait, 1)}), 429

    # Validate guess
    try:
        guess_float  = float(guess_str)
        guess_scaled = round(guess_float * 100)
    except ValueError:
        return jsonify({"error": "invalid guess format"}), 400

    if guess_scaled < NUM_MIN or guess_scaled > NUM_MAX:
        return jsonify({"error": "guess out of range (10.00–99.99)"}), 400

    # Secret check
    st = tier_state[tier]
    if not st["number_scaled"]:
        return jsonify({"error": "game not started yet — please wait"}), 400

    cooldowns[cd_key] = now
    secret = st["number_scaled"]
    hint   = "correct" if guess_scaled == secret else ("higher" if guess_scaled < secret else "lower")

    record = {
        "idx":          len(st["history"]),
        "player":       player,
        "guess_scaled": guess_scaled,
        "hint":         hint,
        "timestamp":    now,
    }
    st["history"].append(record)

    print(f"[T{tier}] {player[:10]}… guessed {guess_float:.2f} → {hint}")

    if hint == "correct":
        threading.Thread(target=do_reveal_win, args=[tier, player], daemon=True).start()

    return jsonify({"hint": hint, "guess_scaled": guess_scaled, "idx": record["idx"]})

@app.route("/api/history/<int:tier>")
def api_history(tier):
    since = int(request.args.get("since", 0))
    if tier < 0 or tier > 2:
        return jsonify({"error": "invalid tier"}), 400
    history = tier_state[tier]["history"]
    return jsonify({"total": len(history), "items": history[since:]})

@app.route("/api/cooldown")
def api_cooldown():
    tier   = int(request.args.get("tier", 0))
    player = (request.args.get("address") or "").lower()
    last   = cooldowns.get((tier, player), 0)
    return jsonify({"remaining": round(max(0, COOLDOWN - (time.time() - last)), 2)})

@app.route("/api/leaderboard")
def api_leaderboard():
    """
    Aggregate MedalAwarded events to build the leaderboard.
    Returns top 50 players sorted by: diamond desc, gold desc, silver desc.
    """
    try:
        # Scan all MedalAwarded events from block 0
        # In production: replace with a DB cache updated by event listener
        from_block = max(0, w3.eth.block_number - 50000)  # last ~50k blocks
        logs = contract.events.MedalAwarded().get_logs(
            from_block=from_block, to_block="latest")

        # Most recent MedalAwarded per player has their cumulative total
        # (contract emits cumulative counts, not deltas)
        player_medals = {}
        for log in logs:
            addr = log["args"]["player"].lower()
            player_medals[addr] = {
                "address": log["args"]["player"],
                "silver":  log["args"]["silver"],
                "gold":    log["args"]["gold"],
                "diamond": log["args"]["diamond"],
            }

        ranked = sorted(
            player_medals.values(),
            key=lambda x: (x["diamond"], x["gold"], x["silver"]),
            reverse=True,
        )[:50]

        for i, p in enumerate(ranked):
            p["rank"] = i + 1

        return jsonify({"players": ranked, "total": len(ranked)})
    except Exception as e:
        return jsonify({"error": str(e), "players": []}), 500

@app.route("/api/medals/<address>")
def api_medals(address):
    """Get medal counts for a specific player."""
    try:
        addr = Web3.to_checksum_address(address)
        result = contract.functions.get_medals(addr).call()
        return jsonify({
            "address": addr,
            "silver":  result[0],
            "gold":    result[1],
            "diamond": result[2],
        })
    except Exception:
        return jsonify({"error": "invalid address"}), 400

@app.route("/health")
def health():
    return jsonify({"ok": True, "block": w3.eth.block_number})

# ─── Admin ─────────────────────────────────────────────────────────────────────

@app.route("/admin/abort/<int:tier>", methods=["POST"])
def admin_abort(tier):
    api_key = request.headers.get("X-Admin-Key", "")
    if api_key != os.getenv("ADMIN_API_KEY", ""):
        return jsonify({"error": "unauthorized"}), 401
    try:
        receipt = send_tx(contract.functions.abort_round(tier))
        tier_state[tier].update({"number_scaled": None, "salt": None, "commitment": None})
        return jsonify({"ok": True, "tx": receipt["transactionHash"].hex()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/admin/status")
def admin_status():
    api_key = request.headers.get("X-Admin-Key", "")
    if api_key != os.getenv("ADMIN_API_KEY", ""):
        return jsonify({"error": "unauthorized"}), 401
    status = {}
    for tier in range(3):
        info = contract.functions.get_round(tier).call()
        st   = tier_state[tier]
        status[TIER_NAMES[tier].lower()] = {
            "round_id":     info[0],
            "phase":        info[1],
            "player_count": info[2],
            "has_secret":   st["number_scaled"] is not None,
            "history_len":  len(st["history"]),
        }
    return jsonify(status)

# ─── Startup ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"NumDuel Lite backend")
    print(f"Operator : {op.address}")
    print(f"Contract : {CONTRACT_ADDRESS}")
    print(f"Network  : {RPC_URL}")
    # Start event polling thread
    threading.Thread(target=poll_events, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)
