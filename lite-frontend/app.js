// app.js — NumMelee (vanilla ES module)
import {
  createPublicClient, createWalletClient, custom, http,
} from "https://esm.sh/viem@2.21.0";
import { celo, celoAlfajores } from "https://esm.sh/viem@2.21.0/chains";

// ── Config ────────────────────────────────────────────────────────────────────
const IS_TESTNET       = false;   // flip to false for mainnet
const CHAIN            = IS_TESTNET ? celoAlfajores : celo;
const CONTRACT_ADDRESS = "0x9fb6412ef05a69026fDfE0F267E3e85F9A0eB937"; // ← your contract
const CUSD             = IS_TESTNET
  ? "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
  : "0x765DE816845861e75A25fCA122bb6898B8B1282a";

const POLL_ROUND_MS   = 4000;
const POLL_HISTORY_MS = 3000;
const SOLO_TIMEOUT    = 300;

const ABI = [
  { name:"join",      type:"function", stateMutability:"nonpayable",
    inputs:[{name:"commitment",type:"bytes32"}], outputs:[] },
  { name:"get_round", type:"function", stateMutability:"view", inputs:[],
    outputs:[
      {name:"round_id",    type:"uint256"},
      {name:"phase",       type:"uint8"},
      {name:"player_count",type:"uint256"},
      {name:"opened_at",   type:"uint256"},
      {name:"started_at",  type:"uint256"},
    ]},
  { name:"is_joined", type:"function", stateMutability:"view",
    inputs:[{name:"player",type:"address"}],
    outputs:[{name:"",type:"bool"}] },
];

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  address: null, isMiniPay: false,
  roundId: 0, phase: 2, playerCount: 0,
  openedAt: 0, soloRemaining: 0,
  joined: false, isCompetitive: false,
  lastHint: null, lastGuess: null, guessCount: 0,
  cooldownEnd: 0,
  medals: { silver:0, gold:0, diamond:0 },
  historyIdx: 0,
  activeTab: "play",
  serverOnline: true,
  isJoining: false, isGuessing: false,
  // Input state — 4 digit slots, auto-decimal
  digits: ["","","",""],  // each slot: "" or "0"-"9"
};

// ── viem (lazy) ───────────────────────────────────────────────────────────────
let _pub = null;
function pubClient() {
  if (!_pub) _pub = createPublicClient({ chain:CHAIN, transport:http() });
  return _pub;
}
function walClient() {
  return createWalletClient({ chain:CHAIN, transport:custom(window.ethereum) });
}

// ── sessionStorage ────────────────────────────────────────────────────────────
// Key includes a server-restart token stored in sessionStorage itself.
// When the backend sends a fresh commitment (new secret), that token changes,
// invalidating any stale "joined" flags from old rounds.
function jKey(addr, rid)  { return `ng_j_${addr}_${rid}`; }
function loadJoined(addr, rid) {
  try { return sessionStorage.getItem(jKey(addr,rid)) === "1"; } catch { return false; }
}
function saveJoined(addr, rid) {
  try { sessionStorage.setItem(jKey(addr,rid),"1"); } catch {}
}
function clearJoined(addr, rid) {
  try { sessionStorage.removeItem(jKey(addr,rid)); } catch {}
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(path, opts={}) {
  const res  = await fetch(path, opts);
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw Object.assign(new Error(json.error??"api error"),{status:res.status,body:json});
  return json;
}
const getRound      = ()          => api("/api/round");
const getCommitment = ()          => api("/api/commitment");
const getHistory    = (s)         => api(`/api/history?since=${s}`);
const getCooldown   = (a)         => api(`/api/cooldown?address=${encodeURIComponent(a)}`);
const getMedals     = (a)         => api(`/api/medals/${a}`);
const getLeaderboard= ()          => api("/api/leaderboard");
const postGuess     = (addr,guess)=> api("/api/guess",{
  method:"POST", headers:{"Content-Type":"application/json"},
  body: JSON.stringify({address:addr,guess}),
});

// ── DOM ───────────────────────────────────────────────────────────────────────
const $   = (id) => document.getElementById(id);
const txt = (id,v) => { const e=$(id); if(e) e.textContent=v; };
const htm = (id,v) => { const e=$(id); if(e) e.innerHTML=v; };

// ── Auto-decimal digit input ──────────────────────────────────────────────────
// digits[0..3] map to XX.XX — index 0,1 = integer part, 2,3 = decimal part
// User types 4 digits, decimal is always after index 1

function digitValue() {
  // Return "XX.YY" string or null if fewer than 4 digits entered
  const d = S.digits;
  const filled = d.filter(x=>x!=="").length;
  if (filled === 0) return null;
  // Build value from what's filled, left-aligned
  const int1 = d[0] || "0";
  const int2 = d[1] || "0";
  const dec1 = d[2] || "0";
  const dec2 = d[3] || "0";
  return `${int1}${int2}.${dec1}${dec2}`;
}

function cursorPos() {
  // First empty slot = cursor position
  return S.digits.findIndex(x => x === "");
}

function renderDigitBoxes() {
  const boxes   = ["d0","d1","d2","d3"];
  const hint    = S.lastHint;
  const cursor  = S.joined ? cursorPos() : -1;

  boxes.forEach((id, i) => {
    const el = $(id);
    if (!el) return;
    el.className = "db";

    if (hint) {
      el.classList.add(`db--${hint}`);
      el.textContent = "?";
      return;
    }

    const dig = S.digits[i];
    if (dig !== "") {
      el.textContent = dig;
      el.classList.add("db--filled");
    } else if (S.joined && i === cursor) {
      el.textContent = "_";
      el.classList.add("db--cursor");
    } else {
      el.textContent = "?";
    }
  });
}

function pushDigit(ch) {
  // Find first empty slot and fill it
  const idx = S.digits.findIndex(x => x === "");
  if (idx === -1) return; // all 4 filled
  S.digits[idx] = ch;
  renderDigitBoxes();
  renderSendBtn();
  // Animate the box
  const el = $(`d${idx}`);
  if (el) {
    el.classList.remove("db--pop");
    void el.offsetWidth; // reflow
    el.classList.add("db--pop");
  }
}

function popDigit() {
  // Remove last filled digit
  for (let i = 3; i >= 0; i--) {
    if (S.digits[i] !== "") {
      S.digits[i] = "";
      renderDigitBoxes();
      renderSendBtn();
      return;
    }
  }
}

function clearDigits() {
  S.digits = ["","","",""];
  renderDigitBoxes();
  renderSendBtn();
}

function allFilled() {
  return S.digits.every(x => x !== "");
}

function renderSendBtn() {
  const btn = $("btn-send");
  if (!btn) return;
  const hasDigits = S.digits.some(x => x !== "");
  if (S.joined && hasDigits && !S.isGuessing) {
    btn.style.display = "";
    btn.disabled = S.isGuessing;
    btn.textContent = S.isGuessing ? "Sending…" : (allFilled() ? "Send ↑" : "⌫ Clear");
  } else if (S.joined && S.isGuessing) {
    btn.style.display = "";
    btn.disabled = true;
    btn.textContent = "Sending…";
  } else {
    btn.style.display = "none";
  }
}

// ── Capture keyboard / tel input ──────────────────────────────────────────────
function setupDigitCapture() {
  const cap = $("digit-capture");
  const ns  = $("number-stage");
  if (!cap || !ns) return;

  // Click anywhere on stage → focus capture input
  ns.addEventListener("click", () => {
    if (S.joined && !S.lastHint) cap.focus();
  });

  cap.addEventListener("keydown", (e) => {
    if (!S.joined) return;
    e.preventDefault();

    if (e.key === "Backspace" || e.key === "Delete") {
      popDigit();
    } else if (e.key === "Enter") {
      handleGuess();
    } else if (/^[0-9]$/.test(e.key)) {
      if (allFilled()) return; // ignore if full
      pushDigit(e.key);
    }
    // Keep capture value empty (we manage display ourselves)
    cap.value = "";
  });

  // Mobile: input event from tel keyboard
  cap.addEventListener("input", (e) => {
    const val = cap.value.replace(/\D/g,"");
    cap.value = "";
    if (!S.joined) return;
    for (const ch of val) {
      if (!allFilled()) pushDigit(ch);
    }
  });
}

// ── Render: header ────────────────────────────────────────────────────────────
function renderWallet() {
  const sec = $("wallet-section");
  if (!sec) return;
  if (!S.address) {
    sec.innerHTML = `<span class="hdr-nowallet">No wallet</span>`;
    return;
  }
  const short = `${S.address.slice(0,6)}…${S.address.slice(-4)}`;
  sec.innerHTML =
    `<span class="hdr-dot"></span>
     <span class="hdr-addr">${short}</span>
     ${S.isMiniPay?`<span class="hdr-mp">MiniPay</span>`:""}`;
}
function renderMedals() {
  txt("med-diamond", S.medals.diamond);
  txt("med-gold",    S.medals.gold);
  txt("med-silver",  S.medals.silver);
}

// ── Render: stat chips (inside feed header) ───────────────────────────────────
function renderChips() {
  const modeEl    = $("chip-mode");
  const playersEl = $("chip-players");
  const timerEl   = $("chip-timer");
  const guessesEl = $("chip-guesses");

  if (!modeEl) return;

  const live = S.roundId > 0 && S.phase !== 2;

  if (live) {
    // Mode
    modeEl.style.display = "";
    modeEl.className = `stat-chip ${S.phase===0?"stat-chip--solo":"stat-chip--comp"}`;
    modeEl.textContent = S.phase === 0 ? "Solo" : "⚔️ Compet.";

    // Players
    playersEl.style.display = "";
    playersEl.textContent = `👥 ${S.playerCount}/100`;

    // Timer (solo only)
    if (S.phase === 0) {
      timerEl.style.display = "";
      timerEl.className = `stat-chip stat-chip--timer${S.soloRemaining<=0?" ns-timer--expired":""}`;
    } else {
      timerEl.style.display = "none";
    }

    // Guesses
    guessesEl.style.display = "";
    guessesEl.textContent = `${S.guessCount} guess${S.guessCount===1?"":"es"}`;
  } else {
    modeEl.style.display = playersEl.style.display =
    timerEl.style.display = "none";
    guessesEl.style.display = "";
    guessesEl.textContent = `${S.guessCount} guess${S.guessCount===1?"":"es"}`;
  }
}

// ── Render: stage top row ─────────────────────────────────────────────────────
function renderStageTop() {
  const row = $("ns-top-row");
  if (!row) return;

  const live = S.roundId > 0 && S.phase !== 2;
  if (!live) { row.style.display = "none"; return; }
  row.style.display = "";

  const pill = $("ns-pill");
  if (pill) {
    pill.className = `ns-pill${S.phase===1?" ns-pill--comp":""}`;
    pill.textContent = S.phase===0 ? "Solo" : "⚔️ Competitive";
  }
  txt("ns-players", `${S.playerCount}/100`);
}

// ── Render: hint strip ────────────────────────────────────────────────────────
function renderHintStrip() {
  const sh = $("stage-hint");
  if (!sh) return;

  if (!S.lastHint) { sh.style.display="none"; return; }
  sh.style.display = "";
  sh.className = `sh sh--${S.lastHint}`;
  const arrows = {higher:"↑",lower:"↓",correct:"✓"};
  const labels = {higher:"Go higher",lower:"Go lower",correct:"Correct!"};
  txt("sh-arrow", arrows[S.lastHint]??"");
  txt("sh-label", labels[S.lastHint]??"");
  txt("sh-guess", S.lastGuess ? `your guess: ${S.lastGuess}` : "");
}

// ── Render: stage ─────────────────────────────────────────────────────────────
function renderStage() {
  const ns = $("number-stage");
  if (!ns) return;

  // Border accent
  ns.className = "ns" + (S.phase===1?" ns--comp":"") + (S.joined&&!S.lastHint?" ns--active":"");

  // Sublabel
  const sub = $("ns-sublabel");
  if (sub) sub.style.display = S.lastHint ? "none" : "";

  renderStageTop();
  renderHintStrip();
  renderDigitBoxes();
  renderSendBtn();

  // Focus capture input when joined and no hint showing
  const cap = $("digit-capture");
  if (S.joined && !S.lastHint && cap) {
    // Small delay so render completes first
    setTimeout(() => cap.focus(), 50);
  }
}

// ── Render: timer chip ────────────────────────────────────────────────────────
let _timerBase = {ts:0,secs:0};
let _timerInt  = null;

function startTimer(secs) {
  clearInterval(_timerInt);
  _timerBase = {ts:Date.now(), secs};
  tick();
  _timerInt = setInterval(tick, 500);
}
function stopTimer() {
  clearInterval(_timerInt);
  _timerInt = null;
  const el = $("chip-timer");
  if (el) { el.style.display="none"; }
  const ns = $("ns-timer");
  if (ns) { ns.style.display="none"; }
}
function tick() {
  const elapsed   = (Date.now()-_timerBase.ts)/1000;
  const remaining = Math.max(0, _timerBase.secs-elapsed);
  const m = Math.floor(remaining/60);
  const s = Math.ceil(remaining%60);
  const str = `${m}:${String(s).padStart(2,"0")}`;
  const expired = remaining<=0;

  // Stat chip timer
  const chip = $("chip-timer");
  if (chip) {
    chip.textContent = str;
    chip.className = `stat-chip stat-chip--timer${expired?" ns-timer--expired":""}`;
  }
  // Stage top-row timer
  const nsTimer = $("ns-timer");
  if (nsTimer) {
    nsTimer.style.display = S.phase===0 ? "" : "none";
    nsTimer.textContent = str;
    nsTimer.className = `ns-timer${expired?" ns-timer--expired":""}`;
  }
}

// ── Render: cooldown bar ──────────────────────────────────────────────────────
let _cdRaf = null;
function renderCooldown() {
  cancelAnimationFrame(_cdRaf);
  function cd() {
    const rem = Math.max(0, (S.cooldownEnd-Date.now())/1000);
    const wrap=$("cd-wrap"), fill=$("cd-fill"), lbl=$("cd-label");
    if (!wrap) return;
    if (rem<=0) { wrap.style.display="none"; return; }
    wrap.style.display="";
    if (fill) fill.style.width=`${(rem/5)*100}%`;
    if (lbl)  lbl.textContent=`${rem.toFixed(1)} s`;
    _cdRaf = requestAnimationFrame(cd);
  }
  cd();
}

// ── Render: action panel ──────────────────────────────────────────────────────
function renderAction() {
  const panel = $("action-panel");
  if (!panel) return;

  // No wallet
  if (!S.address) {
    panel.className="ap ap--notice";
    panel.innerHTML=`<p class="ap-notice">Connect a wallet to play.</p><p class="ap-sub">Open inside MiniPay.</p>`;
    return;
  }

  // Joined — panel is hidden; guess is handled inside the stage
  if (S.joined) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "";

  // No active round → Open Round
  if (!S.roundId || S.phase===2) {
    panel.className="ap";
    panel.innerHTML=
      `<button class="btn-join" id="btn-open" ${S.isJoining?"disabled":""}>
         ${S.isJoining?"Opening round…":"Open Round"}
       </button>
       <p id="ap-err" class="ap-err" style="display:none"></p>`;
    $("btn-open")?.addEventListener("click", handleJoin);
    return;
  }

  // Active round, not joined
  panel.className="ap";
  panel.innerHTML=
    `<button class="btn-join" id="btn-join-r" ${S.isJoining?"disabled":""}>
       ${S.isJoining?"Joining…":"Join Round"}
     </button>
     <p class="ap-sub" style="text-align:center">Pure gas tx — no payment required</p>
     <p id="ap-err" class="ap-err" style="display:none"></p>`;
  $("btn-join-r")?.addEventListener("click", handleJoin);
}

function apErr(msg) {
  const e=$("ap-err");
  if (!e) return;
  e.textContent=msg; e.style.display=msg?"":"none";
}
function nsErr(msg) {
  // Show error inside stage
  let e=document.querySelector(".ns-err");
  if (!msg) { e?.remove(); return; }
  if (!e) {
    e=document.createElement("p");
    e.className="ns-err";
    $("number-stage")?.appendChild(e);
  }
  e.textContent=msg;
  setTimeout(()=>e?.remove(), 3000);
}

// ── Feed ──────────────────────────────────────────────────────────────────────
function addFeedRow(html, cls="") {
  const list = $("feed-rows");
  if (!list) return;
  // Remove placeholder
  list.querySelector(".feed-placeholder")?.remove();

  const li = document.createElement("li");
  li.className = `feed-row ${cls}`;
  li.innerHTML = html;
  list.prepend(li);
  // Keep max 30 rows
  while (list.children.length > 30) list.lastElementChild?.remove();
}

function addGuessFeed(player, guess, hint) {
  const short = `${player.slice(0,6)}…`;
  const val   = parseFloat(guess).toFixed(2);
  const arrow = hint==="higher"?"↑":hint==="lower"?"↓":"✓";
  const arrowCls = `feed-arrow feed-arrow--${hint}`;
  const isMe  = player===S.address;
  addFeedRow(
    `<span class="feed-dot">${isMe?"●":"·"}</span>
     <span>${isMe?"You":short}</span>
     <span class="feed-val">${val}</span>
     <span class="${arrowCls}">${arrow}</span>`,
    `feed-row--hint`
  );
}

// ── Join ──────────────────────────────────────────────────────────────────────
async function handleJoin() {
  if (S.isJoining || !S.address) return;
  S.isJoining = true;
  renderAction();

  try {
    const needsCmt = S.roundId===0 || S.phase===2;
    let commitment = "0x" + "00".repeat(32);

    if (needsCmt) {
      const { commitment:hex } = await getCommitment();
      commitment = hex;
    }

    const wc = walClient();
    await wc.writeContract({
      address:CONTRACT_ADDRESS, abi:ABI,
      functionName:"join", args:[commitment],
      account:S.address, feeCurrency:CUSD,
    });

    S.joined = true;
    saveJoined(S.address, S.roundId||1);
    addFeedRow(
      `<span class="feed-dot">👤</span><span>You joined the round</span>`,
      "feed-row--join"
    );

  } catch(err) {
    console.error("[join]", err);
    S.isJoining = false;
    renderAction();
    apErr(err.shortMessage ?? err.message ?? "Transaction failed");
    return;
  }

  S.isJoining = false;
  clearDigits();
  renderAction(); // hides panel
  renderStage();
  renderChips();
}

// ── Guess ─────────────────────────────────────────────────────────────────────
window.handleGuess = async function() {
  if (S.isGuessing || !S.joined) return;

  // If not all filled, use what we have (treat missing as 0)
  const raw = digitValue();
  if (!raw || raw === "00.00") { nsErr("Enter at least one digit"); return; }

  const val = parseFloat(raw);
  if (isNaN(val) || val < 10 || val > 99.99) {
    nsErr("Range: 10.00 – 99.99");
    clearDigits();
    return;
  }

  nsErr("");
  S.isGuessing = true;
  renderSendBtn();

  try {
    const res = await postGuess(S.address, raw);

    S.lastHint  = res.hint;
    S.lastGuess = raw;
    S.guessCount += 1;
    clearDigits();

    addGuessFeed(S.address, raw, res.hint);
    renderStage();
    renderChips();

    if (res.hint !== "correct") {
      try {
        const cd = await getCooldown(S.address);
        S.cooldownEnd = Date.now() + cd.remaining*1000;
        renderCooldown();
        // Auto-clear hint after cooldown so player can guess again
        setTimeout(() => {
          S.lastHint  = null;
          S.lastGuess = null;
          renderStage();
          const cap=$("digit-capture");
          cap?.focus();
        }, Math.max(0, cd.remaining*1000));
      } catch {}
    } else {
      // Correct — show celebration briefly then lock
      setTimeout(() => renderStage(), 100);
    }

  } catch(err) {
    if (err.status===429 && err.body?.wait_seconds) {
      S.cooldownEnd = Date.now() + err.body.wait_seconds*1000;
      renderCooldown();
      nsErr(`Wait ${err.body.wait_seconds.toFixed(1)} s`);
    } else if (err.body?.error === "join the round first") {
      // Server thinks we haven't joined — stale state
      S.joined = false;
      clearJoined(S.address, S.roundId);
      nsErr("Session expired — please rejoin");
      renderAction();
    } else {
      nsErr(err.body?.error ?? err.message ?? "Guess failed");
    }
  } finally {
    S.isGuessing = false;
    renderSendBtn();
  }
};

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  htm("lb-content", `<p class="lb-msg">Loading…</p>`);
  try {
    const { players } = await getLeaderboard();
    if (!players?.length) {
      htm("lb-content", `<p class="lb-msg">No medals yet.</p>`); return;
    }
    const rows = players.map(p => {
      const r = p.rank===1?"🥇":p.rank===2?"🥈":p.rank===3?"🥉":p.rank;
      const c = p.rank<=3?` class="lb-top${p.rank}"`:"";
      return `<tr${c}>
        <td class="lb-rank">${r}</td>
        <td class="lb-addr">${p.address.slice(0,6)}…${p.address.slice(-4)}</td>
        <td class="lb-d">${p.diamond||"—"}</td>
        <td class="lb-g">${p.gold||"—"}</td>
        <td class="lb-s">${p.silver||"—"}</td>
      </tr>`;
    }).join("");
    htm("lb-content",
      `<table class="lb-table">
         <thead><tr><th>#</th><th>Player</th><th>💎</th><th>🥇</th><th>🥈</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`);
  } catch(err) {
    htm("lb-content", `<p class="lb-msg lb-err">${err.message}</p>`);
  }
}

// ── Tab ───────────────────────────────────────────────────────────────────────
window.setTab = function(tab) {
  S.activeTab = tab;
  $("tab-play").style.display        = tab==="play"?"":"none";
  $("tab-leaderboard").style.display = tab==="leaderboard"?"":"none";
  $("btn-play").classList.toggle("nav-btn--on",  tab==="play");
  $("btn-board").classList.toggle("nav-btn--on", tab==="leaderboard");
  if (tab==="leaderboard") loadLeaderboard();
};

// ── Round poll ────────────────────────────────────────────────────────────────
let _prevRound = -1;
let _prevPhase = 2;
let _medalTick = 0;

async function pollRound() {
  try {
    const data = await getRound();
    const {
      round_id:roundId, phase, player_count:playerCount,
      opened_at:openedAt, solo_remaining:soloRemaining, is_competitive:isComp,
    } = data;

    S.serverOnline = true;
    $("offline-banner").style.display = "none";

    // ── New round ─────────────────────────────────────────────────────────────
    if (_prevRound !== -1 && roundId !== _prevRound) {
      // Reset all round-local state
      S.joined = false; S.lastHint=null; S.lastGuess=null;
      S.guessCount=0; S.historyIdx=0; S.cooldownEnd=0;
      clearDigits();
      stopTimer();
      addFeedRow(
        `<span class="feed-dot">🆕</span><span>Round #${roundId} opened</span>`,
        "feed-row--opened"
      );
    }

    // ── Transitions ───────────────────────────────────────────────────────────
    if (phase===1 && _prevPhase===0) {
      addFeedRow(
        `<span class="feed-dot">⚔️</span><span>Competitive mode — ${playerCount} players</span>`,
        "feed-row--comp"
      );
      stopTimer();
    }
    if (phase===2 && _prevPhase!==2) {
      addFeedRow(
        `<span class="feed-dot">🏁</span><span>Round #${roundId} ended</span>`,
        "feed-row--done"
      );
      stopTimer();
      // Force re-join next round
      S.joined = false;
      if (S.address) clearJoined(S.address, roundId);
    }

    _prevRound = roundId;
    _prevPhase = phase;

    // ── Restore joined from sessionStorage (survives page refresh) ────────────
    if (S.address && !S.joined && roundId>0 && phase!==2) {
      if (loadJoined(S.address, roundId)) {
        S.joined = true;
      }
    }

    // ── Confirm joined on-chain if still unknown ──────────────────────────────
    if (S.address && !S.joined && roundId>0 && phase!==2) {
      try {
        const ok = await pubClient().readContract({
          address:CONTRACT_ADDRESS, abi:ABI,
          functionName:"is_joined", args:[S.address],
        });
        if (ok) { S.joined=true; saveJoined(S.address, roundId); }
      } catch {}
    }

    // ── Update state ──────────────────────────────────────────────────────────
    S.roundId=roundId; S.phase=phase; S.playerCount=playerCount;
    S.openedAt=openedAt; S.soloRemaining=soloRemaining;
    S.isCompetitive=isComp;

    // ── Solo timer ────────────────────────────────────────────────────────────
    if (phase===0 && soloRemaining>0) {
      const localRem = Math.max(0, _timerBase.secs - (Date.now()-_timerBase.ts)/1000);
      if (!_timerInt || Math.abs(localRem-soloRemaining)>2) startTimer(soloRemaining);
      const nsTimer = $("ns-timer");
      if (nsTimer) nsTimer.style.display = "";
    } else if (phase!==0 && _timerInt) {
      stopTimer();
    }

    // ── Medals (every 3 polls) ────────────────────────────────────────────────
    _medalTick++;
    if (S.address && _medalTick%3===1) {
      try {
        const m = await getMedals(S.address);
        S.medals = {silver:m.silver, gold:m.gold, diamond:m.diamond};
        renderMedals();
      } catch {}
    }

    // ── Full render ───────────────────────────────────────────────────────────
    renderChips();
    renderStage();
    renderAction();

  } catch(err) {
    console.warn("[pollRound]", err.message??err);
    S.serverOnline = false;
    $("offline-banner").style.display = "";
  }
}

// ── History poll ──────────────────────────────────────────────────────────────
async function pollHistory() {
  if (S.phase===2 || !S.joined) return;
  try {
    const { items } = await getHistory(S.historyIdx);
    if (!items?.length) return;
    S.historyIdx += items.length;
    // Add other players' guesses to the feed (skip our own — already added on submit)
    items.forEach(r => {
      if (r.player !== S.address) {
        addGuessFeed(r.player, (r.guess_scaled/100).toFixed(2), r.hint);
      }
    });
  } catch {}
}

// ── Particles ─────────────────────────────────────────────────────────────────
function initParticles() {
  const c = $("particles"); if(!c) return;
  const ctx = c.getContext("2d");
  const N=30, SPD=0.18;
  let w,h,ps,raf;
  const mk=()=>({
    x:Math.random()*w, y:Math.random()*h,
    r:Math.random()*1.4+0.4,
    vx:(Math.random()-.5)*SPD, vy:(Math.random()-.5)*SPD,
    a:Math.random()*0.2+0.04
  });
  function resize(){ w=c.width=innerWidth; h=c.height=innerHeight; ps=Array.from({length:N},mk); }
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(const p of ps){
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(80,140,220,${p.a})`; ctx.fill();
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
    }
    raf=requestAnimationFrame(draw);
  }
  resize(); draw();
  addEventListener("resize", resize);
}

// ── Wallet ────────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({method:"eth_requestAccounts"});
    if (accounts?.[0]) {
      S.address   = accounts[0].toLowerCase();
      S.isMiniPay = !!window.ethereum.isMiniPay;
      renderWallet();
    }
  } catch(err) { console.warn("[wallet]", err); }

  window.ethereum.on?.("accountsChanged", accs => {
    S.address   = accs?.[0]?.toLowerCase()??null;
    S.isMiniPay = !!window.ethereum.isMiniPay;
    S.joined    = false;
    clearDigits();
    renderWallet(); renderAction(); renderStage();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initParticles();
  setupDigitCapture();
  await connectWallet();

  // Initial render
  renderWallet(); renderMedals();
  renderChips(); renderStage(); renderAction();

  // Polls
  await pollRound();
  setInterval(pollRound,   POLL_ROUND_MS);
  setInterval(pollHistory, POLL_HISTORY_MS);
}

init();
