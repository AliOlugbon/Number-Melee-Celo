# @version ^0.4.0
# @title   NumberMelee
# @license MIT
# @author  Ali Malik - aliolugbon@gmail.com

# ─── Constants ─────────────────────────────────────────────────────────────────

MAX_PLAYERS:  constant(uint256) = 100

SOLO_TIMEOUT: constant(uint256) = 300   # 5 min in seconds
SOLO_DIAMOND: constant(uint256) = 60    # ≤ 1 min → Diamond
SOLO_GOLD:    constant(uint256) = 180   # ≤ 3 min → Gold
                                        # > 3 and ≤ 5 min → Silver

MEDAL_SILVER:  constant(uint8) = 0
MEDAL_GOLD:    constant(uint8) = 1
MEDAL_DIAMOND: constant(uint8) = 2

# ─── Events ────────────────────────────────────────────────────────────────────

event RoundOpened:
    round_id:   indexed(uint256)
    opener:     address
    commitment: bytes32

event PlayerJoined:
    round_id: indexed(uint256)
    player:   indexed(address)
    count:    uint256

event CompetitiveModeActivated:
    round_id: indexed(uint256)
    count:    uint256

event RoundWon:
    round_id:      indexed(uint256)
    winner:        indexed(address)
    medal:         uint8
    number_scaled: uint256
    salt:          bytes32
    total_players: uint256

event MedalAwarded:
    player:  indexed(address)
    medal:   indexed(uint8)
    silver:  uint256
    gold:    uint256
    diamond: uint256

event RoundAborted:
    round_id: indexed(uint256)

# ─── Structs ───────────────────────────────────────────────────────────────────

struct Round:
    commitment:    bytes32
    player_count:  uint256
    phase:         uint8     # 0=solo-lobby  1=competitive  2=done
    winner:        address
    medal:         uint8
    number_scaled: uint256   # 0 until revealed
    salt:          bytes32
    opened_at:     uint256   # block.timestamp of first join (solo timer starts)
    started_at:    uint256   # block.timestamp when phase→1 (competitive)

struct MedalRecord:
    silver:  uint256
    gold:    uint256
    diamond: uint256

# ─── Storage ───────────────────────────────────────────────────────────────────

owner:    public(address)

round:    public(Round)
round_id: public(uint256)   # monotonic counter; 0 = no round ever opened

# round_id → player → joined
has_joined: public(HashMap[uint256, HashMap[address, bool]])

medals: public(HashMap[address, MedalRecord])

# ─── Constructor ───────────────────────────────────────────────────────────────

@deploy
def __init__():
    self.owner = msg.sender

# ─── Join ──────────────────────────────────────────────────────────────────────

@external
def join(commitment: bytes32):
    """
    Join (or open) the current round. Pure gas tx — no payment.

    Frontend flow before calling this:
      1. GET /api/commitment  — backend generates secret, returns commitment
      2. Call join(commitment) on-chain (only for the first joiner)
      3. Subsequent joiners call join(empty(bytes32)) — ignored on-chain

    First caller
    ────────────
    Opens a new round in phase=0 (solo lobby). Commitment is locked.
    Emits RoundOpened + PlayerJoined. Solo 5-min timer starts.

    2nd caller  (still within 5 min solo window)
    ─────────────────────────────────────────────
    Upgrades round to phase=1 (competitive). Solo timer cancelled.
    Emits PlayerJoined + CompetitiveModeActivated.

    3rd+ callers  (phase=1 competitive)
    ─────────────────────────────────────
    Joins ongoing competitive round up to MAX_PLAYERS.
    """
    r: Round = self.round

    # ── Case 1: no live round → open fresh ───────────────────────────────────
    if self.round_id == 0 or r.phase == 2:
        assert commitment != empty(bytes32), "commitment required"

        self.round_id += 1
        rid: uint256 = self.round_id

        self.round = Round(
            commitment    = commitment,
            player_count  = 1,
            phase         = 0,
            winner        = empty(address),
            medal         = 0,
            number_scaled = 0,
            salt          = empty(bytes32),
            opened_at     = block.timestamp,
            started_at    = 0,
        )
        self.has_joined[rid][msg.sender] = True

        log RoundOpened(round_id=rid, opener=msg.sender, commitment=commitment)
        log PlayerJoined(round_id=rid, player=msg.sender, count=1)
        return

    # ── Case 2: live round (phase 0 or 1) ────────────────────────────────────
    rid: uint256 = self.round_id

    assert r.phase == 0 or r.phase == 1, "no open round"
    assert not self.has_joined[rid][msg.sender], "already joined"
    assert r.player_count < MAX_PLAYERS,         "round full"

    # Cannot join a solo window that has already timed out
    if r.phase == 0:
        assert block.timestamp < r.opened_at + SOLO_TIMEOUT, "solo window expired"

    self.round.player_count += 1
    self.has_joined[rid][msg.sender] = True
    new_count: uint256 = self.round.player_count

    log PlayerJoined(round_id=rid, player=msg.sender, count=new_count)

    # Transition to competitive on 2nd player
    if new_count == 2:
        self.round.phase      = 1
        self.round.started_at = block.timestamp
        log CompetitiveModeActivated(round_id=rid, count=new_count)

# ─── Owner: Solo reveal ────────────────────────────────────────────────────────

@external
def reveal_win(winner: address, number_scaled: uint256, salt: bytes32):
    """
    Solo-mode reveal. Backend calls when the sole player guesses correctly.
    Medal derived on-chain from elapsed time:
      ≤ SOLO_DIAMOND (60 s)  → Diamond
      ≤ SOLO_GOLD   (180 s)  → Gold
      ≤ SOLO_TIMEOUT(300 s)  → Silver
    Reverts if > 5 min (backend must have already called abort_round()).
    """
    assert msg.sender == self.owner, "only owner"

    r:   Round   = self.round
    rid: uint256 = self.round_id

    assert r.phase == 0, "not solo phase"
    assert self.has_joined[rid][winner],                           "winner not in round"
    assert block.timestamp <= r.opened_at + SOLO_TIMEOUT,          "solo window expired"
    assert keccak256(abi_encode(number_scaled, salt)) == r.commitment, "commitment mismatch"

    elapsed: uint256 = block.timestamp - r.opened_at
    medal: uint8 = MEDAL_SILVER
    if elapsed <= SOLO_DIAMOND:
        medal = MEDAL_DIAMOND
    elif elapsed <= SOLO_GOLD:
        medal = MEDAL_GOLD

    self._finalize(winner, medal, number_scaled, salt)

# ─── Owner: Competitive reveal ────────────────────────────────────────────────

@external
def reveal_win_competitive(winner: address, medal: uint8, number_scaled: uint256, salt: bytes32):
    """
    Competitive-mode reveal. Backend resolves proximity off-chain:
      Exact correct → medal=2 (Diamond)
      Closest       → medal=1 (Gold)
      2nd closest   → medal=0 (Silver)
    Commitment verified on-chain before finalizing.
    """
    assert msg.sender == self.owner, "only owner"
    assert medal < 3,                "invalid medal"

    r:   Round   = self.round
    rid: uint256 = self.round_id

    assert r.phase == 1, "not competitive phase"
    assert self.has_joined[rid][winner],                               "winner not in round"
    assert keccak256(abi_encode(number_scaled, salt)) == r.commitment, "commitment mismatch"

    self._finalize(winner, medal, number_scaled, salt)

# ─── Internal ─────────────────────────────────────────────────────────────────

@internal
def _finalize(winner: address, medal: uint8, number_scaled: uint256, salt: bytes32):
    rid: uint256 = self.round_id

    self.round.phase         = 2
    self.round.winner        = winner
    self.round.medal         = medal
    self.round.number_scaled = number_scaled
    self.round.salt          = salt

    if medal == MEDAL_SILVER:
        self.medals[winner].silver  += 1
    elif medal == MEDAL_GOLD:
        self.medals[winner].gold    += 1
    else:
        self.medals[winner].diamond += 1

    m: MedalRecord = self.medals[winner]
    log RoundWon(
        round_id      = rid,
        winner        = winner,
        medal         = medal,
        number_scaled = number_scaled,
        salt          = salt,
        total_players = self.round.player_count,
    )
    log MedalAwarded(
        player  = winner,
        medal   = medal,
        silver  = m.silver,
        gold    = m.gold,
        diamond = m.diamond,
    )

# ─── Owner: Abort ─────────────────────────────────────────────────────────────

@external
def abort_round():
    """
    Abort solo or competitive round. Called by backend cron on solo timeout
    or on backend failure. No funds to refund.
    Next join() opens a fresh round automatically.
    """
    assert msg.sender == self.owner, "only owner"
    assert self.round.phase < 2,     "already done"

    self.round.phase = 2
    log RoundAborted(round_id=self.round_id)

# ─── Owner transfer ────────────────────────────────────────────────────────────

@external
def transfer_ownership(new_owner: address):
    assert msg.sender == self.owner,    "only owner"
    assert new_owner != empty(address), "zero address"
    self.owner = new_owner

# ─── Views ─────────────────────────────────────────────────────────────────────

@view
@external
def get_round() -> (uint256, uint8, uint256, uint256, uint256):
    """(round_id, phase, player_count, opened_at, started_at)"""
    r: Round = self.round
    return self.round_id, r.phase, r.player_count, r.opened_at, r.started_at

@view
@external
def get_medals(player: address) -> (uint256, uint256, uint256):
    """(silver, gold, diamond)"""
    m: MedalRecord = self.medals[player]
    return m.silver, m.gold, m.diamond

@view
@external
def is_joined(player: address) -> bool:
    return self.has_joined[self.round_id][player]

@view
@external
def solo_time_remaining() -> uint256:
    """Seconds left in solo window. Returns 0 if competitive or done."""
    r: Round = self.round
    if r.phase != 0:
        return 0
    deadline: uint256 = r.opened_at + SOLO_TIMEOUT
    if block.timestamp >= deadline:
        return 0
    return deadline - block.timestamp

@view
@external
def get_constants() -> (uint256, uint256, uint256, uint256):
    """(MAX_PLAYERS, SOLO_DIAMOND_THRESHOLD, SOLO_GOLD_THRESHOLD, SOLO_TIMEOUT)"""
    return MAX_PLAYERS, SOLO_DIAMOND, SOLO_GOLD, SOLO_TIMEOUT
