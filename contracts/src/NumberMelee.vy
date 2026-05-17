# @version ^0.4.0

# ─── Constants ─────────────────────────────────────────────────────────────────

MAX_PLAYERS: constant(uint256[3]) = [25, 18, 10]   # Silver, Gold, Diamond

# ─── Events ────────────────────────────────────────────────────────────────────

event RoundOpened:
    tier:     indexed(uint8)
    round_id: indexed(uint256)
    opener:   address

event PlayerJoined:
    tier:     indexed(uint8)
    round_id: indexed(uint256)
    player:   indexed(address)
    count:    uint256

event RoundStarted:
    tier:       indexed(uint8)
    round_id:   indexed(uint256)
    commitment: bytes32

event RoundWon:
    tier:          indexed(uint8)
    round_id:      indexed(uint256)
    winner:        indexed(address)
    number_scaled: uint256
    salt:          bytes32
    total_players: uint256

event MedalAwarded:
    player:   indexed(address)
    tier:     indexed(uint8)    # 0=Silver 1=Gold 2=Diamond
    silver:   uint256
    gold:     uint256
    diamond:  uint256

event RoundAborted:
    tier:     indexed(uint8)
    round_id: indexed(uint256)

# ─── Structs ───────────────────────────────────────────────────────────────────

struct Round:
    commitment:    bytes32
    player_count:  uint256
    phase:         uint8     # 0=lobby 1=active 2=done
    winner:        address
    number_scaled: uint256   # 0 while hidden, revealed on win
    salt:          bytes32
    opened_at:     uint256
    started_at:    uint256

struct MedalRecord:
    silver:  uint256
    gold:    uint256
    diamond: uint256

# ─── Storage ───────────────────────────────────────────────────────────────────

owner:     public(address)

# One live round per tier
rounds:    public(HashMap[uint8, Round])
round_ids: public(HashMap[uint8, uint256])   # monotonic counter per tier

# Player membership per round: tier → round_id → player → bool
has_joined: public(HashMap[uint8, HashMap[uint256, HashMap[address, bool]]])

# Leaderboard: player → medal counts
medals: public(HashMap[address, MedalRecord])

# ─── Constructor ───────────────────────────────────────────────────────────────

@deploy
def __init__():
    self.owner = msg.sender

# ─── Join (first joiner opens the round) ──────────────────────────────────────

@external
def join(tier: uint8):
    """
    Join the current round for a tier. No payment required — pure gas tx.

    - If no round is open (phase 0 or 1), this call opens a fresh lobby
      and the caller is the first player.
    - If a lobby (phase 0) or active round (phase 1) is open and not full,
      the caller joins it.
    - When the second player joins a lobby, the backend detects PlayerJoined
      with count==2 and calls start_round() to lock the commitment.

    tier: 0=Silver 1=Gold 2=Diamond
    """
    assert tier < 3, "invalid tier"

    r:   Round   = self.rounds[tier]
    rid: uint256 = self.round_ids[tier]

    # ── Case 1: no open round → open a new lobby ──────────────────────────────
    if r.phase == 2 or (rid == 0):
        self.round_ids[tier] += 1
        rid = self.round_ids[tier]

        self.rounds[tier] = Round(
            commitment    = empty(bytes32),
            player_count  = 1,
            phase         = 0,
            winner        = empty(address),
            number_scaled = 0,
            salt          = empty(bytes32),
            opened_at     = block.timestamp,
            started_at    = 0,
        )
        self.has_joined[tier][rid][msg.sender] = True

        log RoundOpened(tier=tier, round_id=rid, opener=msg.sender)
        log PlayerJoined(tier=tier, round_id=rid, player=msg.sender, count=1)
        return

    # ── Case 2: lobby or active round is open ─────────────────────────────────
    assert r.phase == 0 or r.phase == 1, "no open round"
    assert not self.has_joined[tier][rid][msg.sender], "already joined"
    assert r.player_count < MAX_PLAYERS[tier], "round full"

    self.rounds[tier].player_count += 1
    self.has_joined[tier][rid][msg.sender] = True
    new_count: uint256 = self.rounds[tier].player_count

    log PlayerJoined(tier=tier, round_id=rid, player=msg.sender, count=new_count)

# ─── Owner: Lock commitment (called when 2nd player joins) ────────────────────

@external
def start_round(tier: uint8, commitment: bytes32):
    """
    Backend calls this once the 2nd player joins.
    Locks the keccak256(number_scaled, salt) commitment on-chain.
    From this point guessing begins (via HTTP API — no gas).
    """
    assert msg.sender == self.owner, "only owner"
    assert tier < 3, "invalid tier"
    assert self.rounds[tier].phase == 0,        "not in lobby"
    assert self.rounds[tier].player_count >= 2, "need 2 players"

    self.rounds[tier].commitment = commitment
    self.rounds[tier].phase      = 1
    self.rounds[tier].started_at = block.timestamp

    log RoundStarted(tier=tier, round_id=self.round_ids[tier], commitment=commitment)

# ─── Owner: Reveal winner, award medal ────────────────────────────────────────

@external
def reveal_win(tier: uint8, winner: address, number_scaled: uint256, salt: bytes32):
    """
    Backend calls when someone guesses correctly.
    1. Verifies the commitment (proves number was never changed).
    2. Records winner on-chain.
    3. Increments the winner's medal count.
    4. Emits MedalAwarded for leaderboard indexers.
    Round auto-resets: next join() call opens a fresh lobby.
    """
    assert msg.sender == self.owner, "only owner"
    assert tier < 3, "invalid tier"

    r:   Round   = self.rounds[tier]
    rid: uint256 = self.round_ids[tier]

    assert r.phase == 1, "round not active"
    assert self.has_joined[tier][rid][winner], "winner not in round"

    # Verify commitment — number cannot have been changed after round start
    assert keccak256(abi_encode(number_scaled, salt)) == r.commitment, "commitment mismatch"

    # Record winner
    self.rounds[tier].phase         = 2
    self.rounds[tier].winner        = winner
    self.rounds[tier].number_scaled = number_scaled
    self.rounds[tier].salt          = salt

    # Award medal
    if tier == 0:
        self.medals[winner].silver += 1
    elif tier == 1:
        self.medals[winner].gold += 1
    else:
        self.medals[winner].diamond += 1

    m: MedalRecord = self.medals[winner]
    log RoundWon(tier=tier, round_id=rid, winner=winner, number_scaled=number_scaled, salt=salt, total_players=r.player_count)
    log MedalAwarded(player=winner, tier=tier, silver=m.silver, gold=m.gold, diamond=m.diamond)

# ─── Owner: Abort ─────────────────────────────────────────────────────────────

@external
def abort_round(tier: uint8):
    """
    Abort a lobby or active round (e.g. backend went down mid-round).
    No refunds needed — no money was collected.
    Next join() call opens a fresh lobby automatically.
    """
    assert msg.sender == self.owner, "only owner"
    assert tier < 3, "invalid tier"
    assert self.rounds[tier].phase < 2, "already done"

    self.rounds[tier].phase = 2
    log RoundAborted(tier=tier, round_id=self.round_ids[tier])

# ─── Owner transfer ────────────────────────────────────────────────────────────

@external
def transfer_ownership(new_owner: address):
    assert msg.sender == self.owner,    "only owner"
    assert new_owner != empty(address), "zero address"
    self.owner = new_owner

# ─── Views ─────────────────────────────────────────────────────────────────────

@view
@external
def get_round(tier: uint8) -> (uint256, uint8, uint256, uint256):
    """(round_id, phase, player_count, started_at)"""
    r: Round = self.rounds[tier]
    return self.round_ids[tier], r.phase, r.player_count, r.started_at

@view
@external
def get_medals(player: address) -> (uint256, uint256, uint256):
    """(silver, gold, diamond)"""
    m: MedalRecord = self.medals[player]
    return m.silver, m.gold, m.diamond

@view
@external
def is_joined(tier: uint8, player: address) -> bool:
    rid: uint256 = self.round_ids[tier]
    return self.has_joined[tier][rid][player]

@view
@external
def max_players(tier: uint8) -> uint256:
    assert tier < 3, "invalid tier"
    return MAX_PLAYERS[tier]
