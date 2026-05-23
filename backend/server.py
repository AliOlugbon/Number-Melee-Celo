"""
NumMelee — server.py
Serves index.html + style.css + app.js AND all /api/* routes.

Key fix: on startup, if a round is active on-chain but we have no secret
(server was restarted mid-round), we abort that round so players can start
fresh. Without this, /api/guess always returns "game not ready" after restart.

Run:     python server.py
Open:    http://localhost:3001

Install: pip install flask flask-cors web3 eth-abi python-dotenv

.env:
  PRIVATE_KEY=0x...
  CONTRACT_ADDRESS=0x...
  RPC_URL=https://forno.celo.org
  ADMIN_API_KEY=changeme
  PORT=3001
"""

import os, secrets, time, threading
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv
from eth_abi import encode as abi_encode

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app      = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
CORS(app)

# ── Static files ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    if filename in {"index.html", "style.css", "app.js"}:
        return send_from_directory(BASE_DIR, filename)
    return jsonify({"error": "not found"}), 404

# ── Web3 ──────────────────────────────────────────────────────────────────────

RPC_URL          = os.getenv("RPC_URL", "https://alfajores-forno.celo-testnet.org")
PRIVATE_KEY      = os.getenv("PRIVATE_KEY")
CONTRACT_ADDRESS = Web3.to_checksum_address(
    os.getenv("CONTRACT_ADDRESS", "0x" + "00" * 20))
PORT             = int(os.getenv("PORT", 3001))

w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
op = w3.eth.account.from_key(PRIVATE_KEY) if PRIVATE_KEY else None

# ── ABI ───────────────────────────────────────────────────────────────────────

ABI = [
    {"name":"join","type":"function",
     "inputs":[{"name":"commitment","type":"bytes32"}],
     "outputs":[],"stateMutability":"nonpayable"},
    {"name":"reveal_win","type":"function",
     "inputs":[{"name":"winner","type":"address"},
               {"name":"number_scaled","type":"uint256"},
               {"name":"salt","type":"bytes32"}],
     "outputs":[],"stateMutability":"nonpayable"},
    {"name":"reveal_win_competitive","type":"function",
     "inputs":[{"name":"winner","type":"address"},
               {"name":"medal","type":"uint8"},
               {"name":"number_scaled","type":"uint256"},
               {"name":"salt","type":"bytes32"}],
     "outputs":[],"stateMutability":"nonpayable"},
    {"name":"abort_round","type":"function",
     "inputs":[],"outputs":[],"stateMutability":"nonpayable"},
    {"name":"get_round","type":"function","inputs":[],
     "outputs":[{"name":"round_id","type":"uint256"},
                {"name":"phase","type":"uint8"},
                {"name":"player_count","type":"uint256"},
                {"name":"opened_at","type":"uint256"},
                {"name":"started_at","type":"uint256"}],
     "stateMutability":"view"},
    {"name":"get_medals","type":"function",
     "inputs":[{"name":"player","type":"address"}],
     "outputs":[{"name":"silver","type":"uint256"},
                {"name":"gold","type":"uint256"},
                {"name":"diamond","type":"uint256"}],
     "stateMutability":"view"},
    {"name":"is_joined","type":"function",
     "inputs":[{"name":"player","type":"address"}],
     "outputs":[{"name":"","type":"bool"}],
     "stateMutability":"view"},
    # Events
    {"name":"RoundOpened","type":"event",
     "inputs":[{"name":"round_id","type":"uint256","indexed":True},
               {"name":"opener","type":"address","indexed":False},
               {"name":"commitment","type":"bytes32","indexed":False}]},
    {"name":"PlayerJoined","type":"event",
     "inputs":[{"name":"round_id","type":"uint256","indexed":True},
               {"name":"player","type":"address","indexed":True},
               {"name":"count","type":"uint256","indexed":False}]},
    {"name":"CompetitiveModeActivated","type":"event",
     "inputs":[{"name":"round_id","type":"uint256","indexed":True},
               {"name":"count","type":"uint256","indexed":False}]},
    {"name":"RoundWon","type":"event",
     "inputs":[{"name":"round_id","type":"uint256","indexed":True},
               {"name":"winner","type":"address","indexed":True},
               {"name":"medal","type":"uint8","indexed":False},
               {"name":"number_scaled","type":"uint256","indexed":False},
               {"name":"salt","type":"bytes32","indexed":False},
               {"name":"total_players","type":"uint256","indexed":False}]},
    {"name":"MedalAwarded","type":"event",
     "inputs":[{"name":"player","type":"address","indexed":True},
               {"name":"medal","type":"uint8","indexed":True},
               {"name":"silver","type":"uint256","indexed":False},
               {"name":"gold","type":"uint256","indexed":False},
               {"name":"diamond","type":"uint256","indexed":False}]},
    {"name":"RoundAborted","type":"event",
     "inputs":[{"name":"round_id","type":"uint256","indexed":True}]},
]

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=ABI)

# ── Constants ─────────────────────────────────────────────────────────────────

NUM_MIN      = 1000   # 10.00 × 100
NUM_MAX      = 9999   # 99.99 × 100
COOLDOWN     = 5
SOLO_TIMEOUT = 300
MEDAL_NAMES  = {0:"Silver", 1:"Gold", 2:"Diamond"}

# ── State ─────────────────────────────────────────────────────────────────────

game = {
    "number_scaled": None, "salt": None, "commitment": None,
    "round_id": 0, "opened_at": None,
    "is_competitive": False, "history": [], "player_guesses": {},
}
cooldowns: dict = {}
lock = threading.Lock()

# ── Helpers ───────────────────────────────────────────────────────────────────

def gen_secret():
    ns       = secrets.randbelow(NUM_MAX - NUM_MIN + 1) + NUM_MIN
    salt_hex = secrets.token_hex(32)
    encoded  = abi_encode(["uint256","bytes32"], [ns, bytes.fromhex(salt_hex)])
    cmt      = w3.keccak(encoded).hex()
    return ns, salt_hex, cmt

def send_tx(fn):
    if not op: raise RuntimeError("No PRIVATE_KEY set")
    nonce = w3.eth.get_transaction_count(op.address)
    tx    = fn.build_transaction({
        "from": op.address, "nonce": nonce,
        "gasPrice": w3.eth.gas_price, "gas": 300_000,
    })
    signed  = op.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    return w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

def sc2f(s): return f"{int(s)/100:.2f}"

def reset_game(round_id=0):
    game.update({
        "number_scaled": None, "salt": None, "commitment": None,
        "round_id": round_id, "opened_at": None,
        "is_competitive": False, "history": [], "player_guesses": {},
    })

# ── Startup: abort stale round ────────────────────────────────────────────────
# FIX: if server restarted mid-round, we have no secret but the round is still
# open on-chain. abort_round() closes it so the next join() starts fresh.

def abort_stale_round_on_startup():
    """Called once at startup in a background thread."""
    if not op:
        print("[startup] No PRIVATE_KEY — cannot abort stale round")
        return
    try:
        time.sleep(2)  # let Flask start first
        info  = contract.functions.get_round().call()
        phase = info[1]
        rid   = info[0]
        if phase in (0, 1):
            print(f"[startup] Stale round #{rid} detected (phase={phase}) — aborting…")
            receipt = send_tx(contract.functions.abort_round())
            print(f"[startup] Aborted → {receipt['transactionHash'].hex()[:16]}…")
            with lock:
                reset_game(rid)
        else:
            print(f"[startup] No stale round (phase={phase}) ✓")
    except Exception as e:
        print(f"[startup] abort_stale check failed: {e}")

# ── Solo timer ────────────────────────────────────────────────────────────────

def _solo_timer(round_id, chain_opened_at):
    sleep_secs = max(0, chain_opened_at + SOLO_TIMEOUT - time.time()) + 3
    time.sleep(sleep_secs)
    with lock:
        if game["round_id"] != round_id or game["is_competitive"]: return
        if game["number_scaled"] is None: return
    try:
        info = contract.functions.get_round().call()
        if info[1] < 2:
            receipt = send_tx(contract.functions.abort_round())
            print(f"[timer] Round #{round_id} aborted "
                  f"→ {receipt['transactionHash'].hex()[:14]}…")
            with lock: reset_game(round_id)
    except Exception as e:
        print(f"[timer] abort failed: {e}")

def start_solo_timer(round_id, chain_opened_at):
    threading.Thread(
        target=_solo_timer, args=[round_id, chain_opened_at], daemon=True
    ).start()

# ── Win ───────────────────────────────────────────────────────────────────────

def _reveal_solo(winner):
    with lock:
        if not game["number_scaled"]: return
        ns, salt = game["number_scaled"], game["salt"]
    try:
        send_tx(contract.functions.reveal_win(
            Web3.to_checksum_address(winner), ns, bytes.fromhex(salt)))
        print(f"[solo] reveal_win → {winner[:10]}…")
    except Exception as e:
        print(f"[solo] reveal FAILED: {e}")

def _reveal_competitive(winner, medal):
    with lock:
        if not game["number_scaled"]: return
        ns, salt = game["number_scaled"], game["salt"]
    try:
        send_tx(contract.functions.reveal_win_competitive(
            Web3.to_checksum_address(winner), medal, ns, bytes.fromhex(salt)))
        print(f"[competitive] reveal medal={MEDAL_NAMES[medal]} → {winner[:10]}…")
    except Exception as e:
        print(f"[competitive] reveal FAILED: {e}")

def handle_correct_guess(player):
    with lock: comp = game["is_competitive"]
    if comp:
        threading.Thread(target=_reveal_competitive, args=[player, 2], daemon=True).start()
    else:
        threading.Thread(target=_reveal_solo,        args=[player],    daemon=True).start()

# ── Events ────────────────────────────────────────────────────────────────────

_last_block = 0

def poll_events():
    global _last_block
    while True:
        try:
            latest = w3.eth.block_number
            if _last_block == 0:
                _last_block = max(0, latest - 300)
            if latest > _last_block:
                fb, tb = _last_block + 1, latest
                _evt_opened(fb, tb)
                _evt_joined(fb, tb)
                _evt_competitive(fb, tb)
                _evt_won(fb, tb)
                _last_block = latest
        except Exception as e:
            print(f"[poll] {e}")
        time.sleep(3)

def _evt_opened(fb, tb):
    try:
        for log in contract.events.RoundOpened().get_logs(from_block=fb, to_block=tb):
            rid = log["args"]["round_id"]
            cmt = log["args"]["commitment"].hex()
            co  = w3.eth.get_block(log["blockNumber"])["timestamp"]
            with lock:
                if game["commitment"] and game["commitment"] == cmt:
                    game["round_id"]  = rid
                    game["opened_at"] = time.time()
                    print(f"[event] RoundOpened #{rid} ✓")
                else:
                    reset_game(rid)
                    game["opened_at"] = time.time()
                    print(f"[event] RoundOpened #{rid} (external)")
            start_solo_timer(rid, co)
    except Exception as e: print(f"[evt_opened] {e}")

def _evt_joined(fb, tb):
    try:
        for log in contract.events.PlayerJoined().get_logs(from_block=fb, to_block=tb):
            print(f"[event] PlayerJoined #{log['args']['round_id']} "
                  f"count={log['args']['count']}")
    except Exception as e: print(f"[evt_joined] {e}")

def _evt_competitive(fb, tb):
    try:
        for log in contract.events.CompetitiveModeActivated().get_logs(
                from_block=fb, to_block=tb):
            rid = log["args"]["round_id"]
            with lock:
                if game["round_id"] == rid:
                    game["is_competitive"] = True
            print(f"[event] Competitive #{rid} ✓")
    except Exception as e: print(f"[evt_competitive] {e}")

def _evt_won(fb, tb):
    try:
        for log in contract.events.RoundWon().get_logs(from_block=fb, to_block=tb):
            rid = log["args"]["round_id"]
            print(f"[event] RoundWon #{rid} "
                  f"medal={MEDAL_NAMES.get(log['args']['medal'],'?')} "
                  f"number={sc2f(log['args']['number_scaled'])}")
            with lock:
                if game["round_id"] == rid: reset_game(rid)
    except Exception as e: print(f"[evt_won] {e}")

# ── API ───────────────────────────────────────────────────────────────────────

@app.route("/api/commitment")
def api_commitment():
    with lock:
        info  = contract.functions.get_round().call()
        phase = info[1]
        if phase in (0, 1) and game["commitment"]:
            return jsonify({
                "commitment": "0x" + game["commitment"],
                "already_open": True,
            })
        ns, salt, cmt = gen_secret()
        game.update({"number_scaled": ns, "salt": salt, "commitment": cmt})
    print(f"[commitment] secret={sc2f(ns)}")
    return jsonify({"commitment": "0x" + cmt, "already_open": False})

@app.route("/api/round")
def api_round():
    info = contract.functions.get_round().call()
    round_id, phase, player_count, chain_opened_at, started_at = info
    solo_remaining = 0
    if phase == 0 and chain_opened_at > 0:
        solo_remaining = max(0, SOLO_TIMEOUT - (int(time.time()) - chain_opened_at))
    with lock:
        is_comp = game["is_competitive"]
    return jsonify({
        "round_id": round_id, "phase": phase,
        "player_count": player_count,
        "opened_at": chain_opened_at, "started_at": started_at,
        "max_players": 100, "solo_remaining": solo_remaining,
        "is_competitive": is_comp,
    })

@app.route("/api/guess", methods=["POST"])
def api_guess():
    data      = request.json or {}
    player    = (data.get("address") or "").lower()
    guess_str = str(data.get("guess", ""))

    try:
        player_addr = Web3.to_checksum_address(player)
    except Exception:
        return jsonify({"error": "invalid address"}), 400

    if not contract.functions.is_joined(player_addr).call():
        return jsonify({"error": "join the round first"}), 403

    info  = contract.functions.get_round().call()
    phase = info[1]
    if phase not in (0, 1):
        return jsonify({"error": "round not active"}), 400
    if phase == 0 and info[3] > 0:
        if int(time.time()) - info[3] >= SOLO_TIMEOUT:
            return jsonify({"error": "solo window expired"}), 400

    now  = time.time()
    wait = COOLDOWN - (now - cooldowns.get(player, 0))
    if wait > 0:
        return jsonify({"error": "cooldown", "wait_seconds": round(wait, 1)}), 429

    try:
        guess_scaled = round(float(guess_str) * 100)
    except ValueError:
        return jsonify({"error": "invalid guess"}), 400

    if not (NUM_MIN <= guess_scaled <= NUM_MAX):
        return jsonify({
            "error": f"out of range ({sc2f(NUM_MIN)}–{sc2f(NUM_MAX)})"
        }), 400

    with lock:
        if game["number_scaled"] is None:
            return jsonify({"error": "game not ready — server restarted, please wait"}), 400
        cooldowns[player] = now
        secret = game["number_scaled"]
        hint   = ("correct" if guess_scaled == secret
                  else "higher" if guess_scaled < secret else "lower")
        rec = {
            "idx": len(game["history"]), "player": player,
            "guess_scaled": guess_scaled, "hint": hint, "timestamp": now,
        }
        game["history"].append(rec)
        game["player_guesses"].setdefault(player, []).append(guess_scaled)
        is_correct = hint == "correct"

    print(f"[guess] {player[:10]}… → {float(guess_str):.2f}  hint={hint}")
    if is_correct:
        threading.Thread(
            target=handle_correct_guess, args=[player], daemon=True
        ).start()

    return jsonify({"hint": hint, "guess_scaled": guess_scaled, "idx": rec["idx"]})

@app.route("/api/history")
def api_history():
    since = int(request.args.get("since", 0))
    return jsonify({"total": len(game["history"]), "items": game["history"][since:]})

@app.route("/api/cooldown")
def api_cooldown():
    player = (request.args.get("address") or "").lower()
    return jsonify({
        "remaining": round(max(0, COOLDOWN - (time.time() - cooldowns.get(player, 0))), 2)
    })

@app.route("/api/leaderboard")
def api_leaderboard():
    try:
        from_block = max(0, w3.eth.block_number - 50_000)
        logs = contract.events.MedalAwarded().get_logs(
            from_block=from_block, to_block="latest")
        pm = {}
        for log in logs:
            addr = log["args"]["player"].lower()
            pm[addr] = {
                "address": log["args"]["player"],
                "silver":  log["args"]["silver"],
                "gold":    log["args"]["gold"],
                "diamond": log["args"]["diamond"],
            }
        ranked = sorted(
            pm.values(),
            key=lambda x: (x["diamond"], x["gold"], x["silver"]),
            reverse=True,
        )[:50]
        for i, p in enumerate(ranked): p["rank"] = i + 1
        return jsonify({"players": ranked, "total": len(ranked)})
    except Exception as e:
        return jsonify({"error": str(e), "players": []}), 500

@app.route("/api/medals/<address>")
def api_medals(address):
    try:
        addr = Web3.to_checksum_address(address)
        r    = contract.functions.get_medals(addr).call()
        return jsonify({"address": addr, "silver": r[0], "gold": r[1], "diamond": r[2]})
    except Exception:
        return jsonify({"error": "invalid address"}), 400

@app.route("/health")
def health():
    return jsonify({"ok": True, "block": w3.eth.block_number})

# ── Admin ─────────────────────────────────────────────────────────────────────

def _check_admin():
    if request.headers.get("X-Admin-Key","") != os.getenv("ADMIN_API_KEY",""):
        return jsonify({"error": "unauthorized"}), 401

@app.route("/admin/abort", methods=["POST"])
def admin_abort():
    err = _check_admin()
    if err: return err
    try:
        receipt = send_tx(contract.functions.abort_round())
        with lock: reset_game(game["round_id"])
        return jsonify({"ok": True, "tx": receipt["transactionHash"].hex()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/admin/status")
def admin_status():
    err = _check_admin()
    if err: return err
    info = contract.functions.get_round().call()
    with lock:
        return jsonify({
            "round_id": info[0], "phase": info[1], "player_count": info[2],
            "is_competitive": game["is_competitive"],
            "has_secret": game["number_scaled"] is not None,
            "history_len": len(game["history"]),
        })

# ── Start ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"NumMelee  |  {CONTRACT_ADDRESS}  |  {RPC_URL}")
    print(f"Open:  http://localhost:{PORT}")
    if op: print(f"Operator: {op.address}")
    else:  print("WARNING: No PRIVATE_KEY — owner txs disabled")

    # Abort any stale round from a previous server run
    threading.Thread(target=abort_stale_round_on_startup, daemon=True).start()
    # Event polling
    threading.Thread(target=poll_events, daemon=True).start()

    app.run(host="0.0.0.0", port=PORT, debug=False)
