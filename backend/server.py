"""
NumMelee Backend — server.py

Three medals awarded per round.

Responsibilities
────────────────
- Serve GET /api/commitment → generate secret, return commitment bytes32 for
  the frontend to pass into join() on-chain (first joiner only).
- Watch RoundOpened events → confirm commitment is tracked correctly.
- Watch PlayerJoined / CompetitiveModeActivated events → cancel solo timer
  when 2nd player joins.
- Serve POST /api/guess → instant hint oracle (no gas, 5 s cooldown).
  Tracks all guesses in-memory for proximity scoring.
- Solo timer: abort after 5 min if still solo.
- Solo win: call reveal_win(winner, number_scaled, salt) → medal from time.
- Competitive win: score all guesses by proximity, call
  reveal_win_competitive(winner, medal, number_scaled, salt).
- Serve GET /api/history, GET /api/round, GET /api/leaderboard.
- Admin: POST /admin/abort, GET /admin/status.

Install
───────
  pip install flask flask-cors web3 eth-abi python-dotenv

.env
────
  PRIVATE_KEY=0x...
  CONTRACT_ADDRESS=0x...
  RPC_URL=https://forno.celo.org
  ADMIN_API_KEY=changeme
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

app = Flask(__name__)
CORS(app)

# ─── Web3 ─────────────────────────────────────────────────────────────────────

RPC_URL          = os.getenv("RPC_URL")
PRIVATE_KEY      = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = Web3.to_checksum_address(os.getenv("CONTRACT_ADDRESS"))
PORT             = int(os.getenv("PORT", 3001))

w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
op = w3.eth.account.from_key(PRIVATE_KEY)

# ─── ABI ──────────────────────────────────────────────────────────────────────

ABI = [
    # Write
    {
        "name": "join", "type": "function",
        "inputs": [{"name": "commitment", "type": "bytes32"}],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "name": "reveal_win", "type": "function",
        "inputs": [
            {"name": "winner",        "type": "address"},
            {"name": "number_scaled", "type": "uint256"},
            {"name": "salt",          "type": "bytes32"},
        ],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "name": "reveal_win_competitive", "type": "function",
        "inputs": [
            {"name": "winner",        "type": "address"},
            {"name": "medal",         "type": "uint8"},
            {"name": "number_scaled", "type": "uint256"},
            {"name": "salt",          "type": "bytes32"},
        ],
        "outputs": [], "stateMutability": "nonpayable",
    },
    {
        "name": "abort_round", "type": "function",
        "inputs": [], "outputs": [], "stateMutability": "nonpayable",
    },
    # View
    {
        "name": "get_round", "type": "function", "inputs": [],
        "outputs": [
            {"type": "uint256"},  # round_id
            {"type": "uint8"},    # phase
            {"type": "uint256"},  # player_count
            {"type": "uint256"},  # opened_at
            {"type": "uint256"},  # started_at
        ],
        "stateMutability": "view",
    },
    {
        "name": "get_medals", "type": "function",
        "inputs": [{"name": "player", "type": "address"}],
        "outputs": [{"type": "uint256"}, {"type": "uint256"}, {"type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "name": "is_joined", "type": "function",
        "inputs": [{"name": "player", "type": "address"}],
        "outputs": [{"type": "bool"}], "stateMutability": "view",
    },
    {
        "name": "solo_time_remaining", "type": "function",
        "inputs": [],
        "outputs": [{"type": "uint256"}], "stateMutability": "view",
    },
    # Events
    {
        "name": "RoundOpened", "type": "event",
        "inputs": [
            {"name": "round_id",   "type": "uint256", "indexed": True},
            {"name": "opener",     "type": "address",  "indexed": False},
            {"name": "commitment", "type": "bytes32",  "indexed": False},
        ],
    },
    {
        "name": "PlayerJoined", "type": "event",
        "inputs": [
            {"name": "round_id", "type": "uint256", "indexed": True},
            {"name": "player",   "type": "address",  "indexed": True},
            {"name": "count",    "type": "uint256",  "indexed": False},
        ],
    },
    {
        "name": "CompetitiveModeActivated", "type": "event",
        "inputs": [
            {"name": "round_id", "type": "uint256", "indexed": True},
            {"name": "count",    "type": "uint256",  "indexed": False},
        ],
    },
    {
        "name": "RoundWon", "type": "event",
        "inputs": [
            {"name": "round_id",      "type": "uint256", "indexed": True},
            {"name": "winner",        "type": "address",  "indexed": True},
            {"name": "medal",         "type": "uint8",    "indexed": False},
            {"name": "number_scaled", "type": "uint256",  "indexed": False},
            {"name": "salt",          "type": "bytes32",  "indexed": False},
            {"name": "total_players", "type": "uint256",  "indexed": False},
        ],
    },
    {
        "name": "MedalAwarded", "type": "event",
        "inputs": [
            {"name": "player",  "type": "address", "indexed": True},
            {"name": "medal",   "type": "uint8",   "indexed": True},
            {"name": "silver",  "type": "uint256", "indexed": False},
            {"name": "gold",    "type": "uint256", "indexed": False},
            {"name": "diamond", "type": "uint256", "indexed": False},
        ],
    },
    {
        "name": "RoundAborted", "type": "event",
        "inputs": [
            {"name": "round_id", "type": "uint256", "indexed": True},
        ],
    },
]

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=ABI)

# ─── Constants ────────────────────────────────────────────────────────────────

NUM_MIN      = 1000    # 10.00 scaled ×100
NUM_MAX      = 9999    # 99.99 scaled ×100
COOLDOWN     = 5       # seconds between guesses per player
SOLO_TIMEOUT = 300     # 5 minutes
SOLO_DIAMOND = 60      # ≤ 1 min → Diamond
SOLO_GOLD    = 180     # ≤ 3 min → Gold

MEDAL_SILVER  = 0
MEDAL_GOLD    = 1
MEDAL_DIAMOND = 2

MEDAL_NAMES = {0: "Silver", 1: "Gold", 2: "Diamond"}

# ─── In-memory game state ─────────────────────────────────────────────────────

# All fields reset when a new round opens.
game_state = {
    "number_scaled":  None,    # int | None — None until commitment generated
    "salt":           None,    # hex str | None
    "commitment":     None,    # hex str | None
    "round_id":       0,
    "opened_at":      None,    # float (time.time()) when round opened
    "is_competitive": False,
    "history":        [],      # list of guess records (all players)
    # { player_lower → [guess_scaled, ...] } for proximity scoring
    "player_guesses": {},
}

# (player_lower) → last_guess_timestamp
cooldowns: dict = {}
lock = threading.Lock()
_solo_timer_thread = None   # reference to cancel solo timer

# ─── Helpers ──────────────────────────────────────────────────────────────────

def gen_commitment(number_scaled: int, salt_hex: str) -> bytes:
    salt_bytes = bytes.fromhex(salt_hex)
    encoded    = abi_encode(["uint256", "bytes32"], [number_scaled, salt_bytes])
    return w3.keccak(encoded)

def gen_secret() -> tuple[int, str, bytes]:
    number_scaled = secrets.randbelow(NUM_MAX - NUM_MIN + 1) + NUM_MIN
    salt_hex      = secrets.token_hex(32)
    commitment    = gen_commitment(number_scaled, salt_hex)
    return number_scaled, salt_hex, commitment

def send_tx(fn):
    nonce = w3.eth.get_transaction_count(op.address)
    tx = fn.build_transaction({
        "from":     op.address,
        "nonce":    nonce,
        "gasPrice": w3.eth.gas_price,
        "gas":      300_000,
    })
    signed  = op.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    return w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

def sc2f(s: int) -> str:
    return f"{int(s) / 100:.2f}"

def reset_state(round_id: int = 0):
    game_state.update({
        "number_scaled":  None,
        "salt":           None,
        "commitment":     None,
        "round_id":       round_id,
        "opened_at":      None,
        "is_competitive": False,
        "history":        [],
        "player_guesses": {},
    })

# ─── Solo timeout logic ───────────────────────────────────────────────────────

def _solo_timer(round_id: int, opened_at: float):
    """Sleep 5 min, then abort if the round is still solo and open."""
    time.sleep(SOLO_TIMEOUT + 2)   # +2 s buffer for block finality
    with lock:
        st = game_state
        if st["round_id"] != round_id or st["is_competitive"]:
            return   # round already over or went competitive
        if st["number_scaled"] is None:
            return   # no secret — nothing to do
    try:
        info = contract.functions.get_round().call()
        phase = info[1]
        if phase < 2:
            receipt = send_tx(contract.functions.abort_round())
            print(f"[solo-timer] Round #{round_id} timed out. abort_round tx: "
                  f"{receipt['transactionHash'].hex()[:16]}…")
            with lock:
                reset_state(round_id)
    except Exception as e:
        print(f"[solo-timer] abort failed: {e}")

def start_solo_timer(round_id: int, opened_at: float):
    global _solo_timer_thread
    t = threading.Thread(target=_solo_timer, args=[round_id, opened_at], daemon=True)
    _solo_timer_thread = t
    t.start()

# ─── Win logic ────────────────────────────────────────────────────────────────

def do_reveal_win_solo(winner_addr: str):
    """Solo mode: contract computes medal from elapsed time."""
    with lock:
        st = game_state
        if not st["number_scaled"]:
            return
        number_scaled = st["number_scaled"]
        salt          = st["salt"]

    try:
        receipt = send_tx(contract.functions.reveal_win(
            Web3.to_checksum_address(winner_addr),
            number_scaled,
            bytes.fromhex(salt),
        ))
        print(f"[solo] reveal_win tx: {receipt['transactionHash'].hex()[:16]}…")
    except Exception as e:
        print(f"[solo] reveal_win FAILED: {e}")

def do_reveal_win_competitive(winner_addr: str, medal: int):
    """Competitive mode: backend passes explicit medal."""
    with lock:
        st = game_state
        if not st["number_scaled"]:
            return
        number_scaled = st["number_scaled"]
        salt          = st["salt"]

    try:
        receipt = send_tx(contract.functions.reveal_win_competitive(
            Web3.to_checksum_address(winner_addr),
            medal,
            number_scaled,
            bytes.fromhex(salt),
        ))
        print(f"[competitive] reveal_win_competitive medal={MEDAL_NAMES[medal]} "
              f"tx: {receipt['transactionHash'].hex()[:16]}…")
    except Exception as e:
        print(f"[competitive] reveal_win_competitive FAILED: {e}")

def score_proximity(secret: int, player_guesses: dict) -> list[tuple[str, int]]:
    """
    Return list of (player_lower, best_distance) sorted ascending.
    Best distance = min |guess - secret| across all guesses by that player.
    """
    results = []
    for player, guesses in player_guesses.items():
        if not guesses:
            continue
        best = min(abs(g - secret) for g in guesses)
        results.append((player, best))
    return sorted(results, key=lambda x: x[1])

def handle_correct_guess(player_lower: str):
    """Called from /api/guess when a correct guess is submitted."""
    st = game_state
    if st["is_competitive"]:
        # Competitive: Diamond for exact, Gold for closest, Silver for 2nd closest
        ranking = score_proximity(st["number_scaled"], st["player_guesses"])
        # The correct guesser always gets Diamond
        threading.Thread(
            target=do_reveal_win_competitive,
            args=[player_lower, MEDAL_DIAMOND],
            daemon=True,
        ).start()
    else:
        # Solo: medal derived from elapsed time in the contract
        threading.Thread(
            target=do_reveal_win_solo,
            args=[player_lower],
            daemon=True,
        ).start()

# ─── Event polling ────────────────────────────────────────────────────────────

_last_block = 0

def poll_events():
    global _last_block
    while True:
        try:
            latest = w3.eth.block_number
            if _last_block == 0:
                _last_block = max(0, latest - 300)

            if latest > _last_block:
                _handle_round_opened(_last_block + 1, latest)
                _handle_player_joined(_last_block + 1, latest)
                _handle_competitive_activated(_last_block + 1, latest)
                _handle_round_won(_last_block + 1, latest)
                _last_block = latest
        except Exception as e:
            print(f"[poll] error: {e}")
        time.sleep(3)

def _handle_round_opened(from_block, to_block):
    try:
        logs = contract.events.RoundOpened().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            rid        = log["args"]["round_id"]
            opener     = log["args"]["opener"]
            commitment = log["args"]["commitment"].hex()
            with lock:
                # Verify we generated this commitment (sanity check)
                if game_state["commitment"] and game_state["commitment"] == commitment:
                    game_state["round_id"]  = rid
                    game_state["opened_at"] = time.time()
                    print(f"[event] Round #{rid} opened by {opener[:10]}…  "
                          f"commitment confirmed ✓")
                    start_solo_timer(rid, game_state["opened_at"])
                else:
                    # Opened by someone else or stale state — reset and track
                    reset_state(rid)
                    game_state["opened_at"] = time.time()
                    print(f"[event] Round #{rid} opened by {opener[:10]}… "
                          f"(commitment not from us — tracking only)")
    except Exception as e:
        print(f"[handle_round_opened] {e}")

def _handle_player_joined(from_block, to_block):
    try:
        logs = contract.events.PlayerJoined().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            rid    = log["args"]["round_id"]
            player = log["args"]["player"]
            count  = log["args"]["count"]
            print(f"[event] PlayerJoined round #{rid}  player={player[:10]}…  count={count}")
    except Exception as e:
        print(f"[handle_player_joined] {e}")

def _handle_competitive_activated(from_block, to_block):
    try:
        logs = contract.events.CompetitiveModeActivated().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            rid   = log["args"]["round_id"]
            count = log["args"]["count"]
            with lock:
                if game_state["round_id"] == rid:
                    game_state["is_competitive"] = True
            print(f"[event] CompetitiveModeActivated round #{rid}  players={count}  "
                  f"solo timer cancelled ✓")
    except Exception as e:
        print(f"[handle_competitive_activated] {e}")

def _handle_round_won(from_block, to_block):
    try:
        logs = contract.events.RoundWon().get_logs(
            from_block=from_block, to_block=to_block)
        for log in logs:
            rid    = log["args"]["round_id"]
            winner = log["args"]["winner"]
            medal  = log["args"]["medal"]
            num    = log["args"]["number_scaled"]
            print(f"[event] RoundWon #{rid}  winner={winner[:10]}…  "
                  f"medal={MEDAL_NAMES[medal]}  number={sc2f(num)}")
            with lock:
                if game_state["round_id"] == rid:
                    reset_state(rid)
    except Exception as e:
        print(f"[handle_round_won] {e}")

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/api/commitment", methods=["GET"])
def api_commitment():
    """
    GET /api/commitment

    Called by the frontend BEFORE the first join() tx.
    Generates a new secret + commitment for the round.
    The commitment bytes32 is passed into join() on-chain by the first player.

    Returns: { commitment: "0x…", expires_in: 120 }

    The secret is held in memory. If no join() fires within 2 min, the secret
    is discarded on next request. This prevents stale commitments accumulating.
    """
    with lock:
        # If a round is already live, don't regenerate
        info = contract.functions.get_round().call()
        phase = info[1]
        if phase == 0 or phase == 1:
            # Round already open — return existing commitment if we have it
            if game_state["commitment"]:
                return jsonify({
                    "commitment": "0x" + game_state["commitment"],
                    "already_open": True,
                    "phase": phase,
                })

        number_scaled, salt_hex, commitment_bytes = gen_secret()
        commitment_hex = commitment_bytes.hex()

        # Store tentatively (overwrite any stale pre-round secret)
        game_state.update({
            "number_scaled": number_scaled,
            "salt":          salt_hex,
            "commitment":    commitment_hex,
        })

    print(f"[commitment] Generated secret={sc2f(number_scaled)}  "
          f"commitment=0x{commitment_hex[:16]}…")
    return jsonify({
        "commitment":  "0x" + commitment_hex,
        "already_open": False,
    })

@app.route("/api/round", methods=["GET"])
def api_round():
    """GET /api/round — current round state from chain."""
    info = contract.functions.get_round().call()
    # (round_id, phase, player_count, opened_at, started_at)
    with lock:
        solo_remaining = max(0, SOLO_TIMEOUT - (time.time() - game_state["opened_at"])) \
            if game_state["opened_at"] and info[1] == 0 else 0
    return jsonify({
        "round_id":       info[0],
        "phase":          info[1],
        "player_count":   info[2],
        "opened_at":      info[3],
        "started_at":     info[4],
        "max_players":    100,
        "solo_remaining": int(solo_remaining),
        "is_competitive": info[1] == 1,
    })

@app.route("/api/guess", methods=["POST"])
def api_guess():
    """
    POST /api/guess
    Body: { address: "0x…", guess: "42.75" }
    Returns: { hint: "higher"|"lower"|"correct", idx: N }
    No gas. 5-second cooldown per player.
    """
    data      = request.json or {}
    player    = (data.get("address") or "").lower()
    guess_str = str(data.get("guess", ""))

    try:
        player_addr = Web3.to_checksum_address(player)
    except Exception:
        return jsonify({"error": "invalid address"}), 400

    # Must have joined on-chain
    if not contract.functions.is_joined(player_addr).call():
        return jsonify({"error": "join the round on-chain first"}), 403

    # Round must be open (phase 0 solo or phase 1 competitive)
    info = contract.functions.get_round().call()
    phase = info[1]
    if phase not in (0, 1):
        return jsonify({"error": "round not active"}), 400

    # Solo timeout guard
    if phase == 0 and game_state["opened_at"]:
        elapsed = time.time() - game_state["opened_at"]
        if elapsed >= SOLO_TIMEOUT:
            return jsonify({"error": "solo window expired"}), 400

    # Cooldown
    now     = time.time()
    last_ts = cooldowns.get(player, 0)
    wait    = COOLDOWN - (now - last_ts)
    if wait > 0:
        return jsonify({"error": "cooldown", "wait_seconds": round(wait, 1)}), 429

    # Parse guess
    try:
        guess_float  = float(guess_str)
        guess_scaled = round(guess_float * 100)
    except ValueError:
        return jsonify({"error": "invalid guess format"}), 400

    if guess_scaled < NUM_MIN or guess_scaled > NUM_MAX:
        return jsonify({"error": f"guess out of range ({sc2f(NUM_MIN)}–{sc2f(NUM_MAX)})"}), 400

    with lock:
        st = game_state
        if st["number_scaled"] is None:
            return jsonify({"error": "game not started yet — please wait"}), 400

        cooldowns[player] = now
        secret = st["number_scaled"]
        hint   = ("correct" if guess_scaled == secret
                  else ("higher" if guess_scaled < secret else "lower"))

        record = {
            "idx":          len(st["history"]),
            "player":       player,
            "guess_scaled": guess_scaled,
            "hint":         hint,
            "timestamp":    now,
        }
        st["history"].append(record)

        # Track per-player guesses for proximity scoring
        if player not in st["player_guesses"]:
            st["player_guesses"][player] = []
        st["player_guesses"][player].append(guess_scaled)

        is_correct = hint == "correct"

    print(f"[guess] {player[:10]}… → {guess_float:.2f}  hint={hint}")

    if is_correct:
        threading.Thread(
            target=handle_correct_guess, args=[player], daemon=True
        ).start()

    return jsonify({"hint": hint, "guess_scaled": guess_scaled, "idx": record["idx"]})

@app.route("/api/history")
def api_history():
    """GET /api/history?since=N — guess feed since record index N."""
    since   = int(request.args.get("since", 0))
    history = game_state["history"]
    return jsonify({"total": len(history), "items": history[since:]})

@app.route("/api/cooldown")
def api_cooldown():
    """GET /api/cooldown?address=0x… — seconds remaining on cooldown."""
    player = (request.args.get("address") or "").lower()
    last   = cooldowns.get(player, 0)
    return jsonify({"remaining": round(max(0, COOLDOWN - (time.time() - last)), 2)})

@app.route("/api/leaderboard")
def api_leaderboard():
    """
    GET /api/leaderboard — top 50 by diamond→gold→silver.
    Reads MedalAwarded events (cumulative totals) from last 50k blocks.
    """
    try:
        from_block = max(0, w3.eth.block_number - 50_000)
        logs = contract.events.MedalAwarded().get_logs(
            from_block=from_block, to_block="latest")

        player_medals: dict = {}
        for log in logs:
            addr  = log["args"]["player"].lower()
            medal = log["args"]["medal"]
            # Each MedalAwarded carries cumulative totals — just keep the latest
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
    """GET /api/medals/0x… — medal counts for a single player."""
    try:
        addr   = Web3.to_checksum_address(address)
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

def _require_admin():
    key = request.headers.get("X-Admin-Key", "")
    if key != os.getenv("ADMIN_API_KEY", ""):
        return jsonify({"error": "unauthorized"}), 401
    return None

@app.route("/admin/abort", methods=["POST"])
def admin_abort():
    err = _require_admin()
    if err:
        return err
    try:
        receipt = send_tx(contract.functions.abort_round())
        with lock:
            reset_state(game_state["round_id"])
        return jsonify({"ok": True, "tx": receipt["transactionHash"].hex()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/admin/status")
def admin_status():
    err = _require_admin()
    if err:
        return err
    info = contract.functions.get_round().call()
    with lock:
        st = game_state
        return jsonify({
            "round_id":       info[0],
            "phase":          info[1],
            "player_count":   info[2],
            "is_competitive": st["is_competitive"],
            "has_secret":     st["number_scaled"] is not None,
            "history_len":    len(st["history"]),
            "solo_remaining": contract.functions.solo_time_remaining().call(),
        })

# ─── Startup ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"NumberGuess backend")
    print(f"Operator : {op.address}")
    print(f"Contract : {CONTRACT_ADDRESS}")
    print(f"Network  : {RPC_URL}")
    threading.Thread(target=poll_events, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)
