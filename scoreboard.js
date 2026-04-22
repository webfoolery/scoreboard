/* TNC Scoreboard (no frameworks)
   - Round row headers show only number (1,2,3...) for space
   - Sticky, narrow left column for round numbers while horizontal scrolling
   - Totals row shows team name + total value in each cell
   - Reset confirmation clears localStorage
   - After adding score, team selector advances to next team
*/

const $ = (sel) => document.querySelector(sel);

const els = {
  teamsPanel: $("#teamsPanel"),
  teamSelect: $("#teamSelect"),
  exprInput: $("#exprInput"),
  addScoreBtn: $("#addScoreBtn"),
  addTeamBtn: $("#addTeamBtn"),
  undoBtn: $("#undoBtn"),
  resetBtn: $("#resetBtn"),
  scoreTable: $("#scoreTable"),
  toast: $("#toast"),
  teamCount: $("#teamCount"),
  roundCount: $("#roundCount"),
  // modal
  overrideModal: $("#overrideModal"),
  overrideSub: $("#overrideSub"),
  overrideInput: $("#overrideInput"),
  saveOverrideBtn: $("#saveOverrideBtn"),
  clearCellBtn: $("#clearCellBtn"),
};

const STORAGE_KEY = "scoreboard.v6";

let state = loadState() ?? defaultState();

/**
 * state structure
 * teams: [{id, name}]
 * rounds: [{ id, label: "1", "2"... , scoresByTeam: { [teamId]: Cell } }]
 * history: stack of actions for undo
 *
 * Cell: { expr: string, value: number, isOverride: boolean, isExpr: boolean }
 */
function defaultState(){
  return {
    teams: [
      { id: crypto.randomUUID(), name: "Team 1" },
      { id: crypto.randomUUID(), name: "Team 2" },
    ],
    rounds: [],
    history: [],
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.teams) || !Array.isArray(parsed.rounds)) return null;
    parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
    return parsed;
  }catch{
    return null;
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------------- Toast ----------------
function showToast(msg, kind="warn"){
  els.toast.style.display = "block";
  els.toast.textContent = msg;

  if(kind === "bad"){
    els.toast.style.borderColor = "rgba(255,107,138,.35)";
    els.toast.style.background = "rgba(255,107,138,.10)";
  }else if(kind === "good"){
    els.toast.style.borderColor = "rgba(62,231,200,.35)";
    els.toast.style.background = "rgba(62,231,200,.10)";
  }else{
    els.toast.style.borderColor = "rgba(255,204,102,.35)";
    els.toast.style.background = "rgba(255,204,102,.10)";
  }

  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.style.display = "none";
  }, 2400);
}

// ---------------- Expression parser (safe, no eval) ----------------
function parseAndEval(expr){
  const s = (expr ?? "").trim();
  if(!s) throw new Error("Enter a score or expression.");

  if(!/^[0-9+\-*/().\s]+$/.test(s)){
    throw new Error("Only digits and + - * / ( ) . are allowed.");
  }

  const tokens = tokenize(s);
  const rpn = toRPN(tokens);
  const val = evalRPN(rpn);

  if(!Number.isFinite(val)) throw new Error("Result is not a finite number.");
  return val;
}

function tokenize(s){
  const out = [];
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";

  while(i < s.length){
    const c = s[i];
    if(c === " " || c === "\t" || c === "\n"){ i++; continue; }

    if(isDigit(c) || c === "."){
      let j = i, dot = 0;
      while(j < s.length && (isDigit(s[j]) || s[j] === ".")){
        if(s[j] === ".") dot++;
        j++;
      }
      const numStr = s.slice(i, j);
      if(dot > 1) throw new Error("Invalid number format.");
      const n = Number(numStr);
      if(!Number.isFinite(n)) throw new Error("Invalid number.");
      out.push({ type:"num", value:n });
      i = j;
      continue;
    }

    if(c === "(" || c === ")"){
      out.push({ type:"paren", value:c });
      i++;
      continue;
    }

    if(c === "+" || c === "-" || c === "*" || c === "/"){
      out.push({ type:"op", value:c });
      i++;
      continue;
    }

    throw new Error("Invalid character.");
  }

  // unary +/-
  const normalized = [];
  for(const t of out){
    if(t.type === "op" && (t.value === "+" || t.value === "-")){
      const prev = normalized[normalized.length - 1];
      const isUnary = !prev || prev.type === "op" || (prev.type === "paren" && prev.value === "(");
      if(isUnary) normalized.push({ type:"num", value: 0 });
    }
    normalized.push(t);
  }
  return normalized;
}

function toRPN(tokens){
  const prec = { "+":1, "-":1, "*":2, "/":2 };
  const out = [];
  const stack = [];

  for(const t of tokens){
    if(t.type === "num"){ out.push(t); continue; }

    if(t.type === "op"){
      while(stack.length){
        const top = stack[stack.length - 1];
        if(top.type === "op" && prec[top.value] >= prec[t.value]){
          out.push(stack.pop());
        }else break;
      }
      stack.push(t);
      continue;
    }

    if(t.type === "paren" && t.value === "("){ stack.push(t); continue; }

    if(t.type === "paren" && t.value === ")"){
      let found = false;
      while(stack.length){
        const top = stack.pop();
        if(top.type === "paren" && top.value === "("){ found = true; break; }
        out.push(top);
      }
      if(!found) throw new Error("Mismatched parentheses.");
    }
  }

  while(stack.length){
    const top = stack.pop();
    if(top.type === "paren") throw new Error("Mismatched parentheses.");
    out.push(top);
  }

  return out;
}

function evalRPN(rpn){
  const st = [];
  for(const t of rpn){
    if(t.type === "num"){ st.push(t.value); continue; }
    if(t.type === "op"){
      if(st.length < 2) throw new Error("Invalid expression.");
      const b = st.pop();
      const a = st.pop();
      let r = 0;
      switch(t.value){
        case "+": r = a + b; break;
        case "-": r = a - b; break;
        case "*": r = a * b; break;
        case "/": r = a / b; break;
      }
      st.push(r);
    }
  }
  if(st.length !== 1) throw new Error("Invalid expression.");
  return st[0];
}

// ---------------- Helpers ----------------
function fmt(n){
  const v = Math.round(n * 10000) / 10000;
  return v.toString();
}
function isExpression(expr){
  const s = (expr ?? "").trim();
  return /[+\-*/()]/.test(s);
}
function teamById(id){ return state.teams.find(t => t.id === id) ?? null; }

function ensureRoundsTo(indexInclusive){
  while(state.rounds.length <= indexInclusive){
    const idx = state.rounds.length;
    state.rounds.push({
      id: crypto.randomUUID(),
      label: `${idx + 1}`,          // ✅ only the number
      scoresByTeam: {}
    });
  }
}

function computeTotals(){
  const totals = Object.fromEntries(state.teams.map(t => [t.id, 0]));
  for(const round of state.rounds){
    for(const t of state.teams){
      const cell = round.scoresByTeam[t.id];
      if(cell && Number.isFinite(cell.value)){
        totals[t.id] += cell.value;
      }
    }
  }
  return totals;
}

function nextTeamId(currentId){
  const idx = state.teams.findIndex(t => t.id === currentId);
  if(idx === -1) return state.teams[0]?.id ?? "";
  return state.teams[(idx + 1) % state.teams.length].id;
}

function trimTrailingEmptyRounds(){
  const isRoundEmpty = (round) => state.teams.every(t => !round.scoresByTeam[t.id]);
  while(state.rounds.length > 0 && isRoundEmpty(state.rounds[state.rounds.length - 1])){
    state.rounds.pop();
  }
}

// ---------------- Render ----------------
function render(){
  saveState();

  // Teams panel (editable + reorder)
  els.teamsPanel.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "teams";

  state.teams.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = "team-row";

    const left = document.createElement("div");
    left.className = "team-left";

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = `#${idx + 1}`;

    const input = document.createElement("input");
    input.value = t.name;
    input.setAttribute("aria-label", "Team name");
    input.addEventListener("change", () => {
      t.name = input.value.trim() || `Team ${idx + 1}`;
      render();
    });

    left.appendChild(pill);
    left.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "team-actions";

    const up = document.createElement("button");
    up.className = "btn tiny";
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = idx === 0;
    up.addEventListener("click", () => moveTeam(t.id, -1));

    const down = document.createElement("button");
    down.className = "btn tiny";
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = idx === state.teams.length - 1;
    down.addEventListener("click", () => moveTeam(t.id, +1));

    const rm = document.createElement("button");
    rm.className = "btn tiny";
    rm.textContent = "✕";
    rm.title = rm.disabled ? "Need at least 2 teams" : "Remove team";
    rm.disabled = state.teams.length <= 2;
    rm.addEventListener("click", () => removeTeam(t.id));

    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(rm);

    row.appendChild(left);
    row.appendChild(actions);
    wrap.appendChild(row);
  });

  els.teamsPanel.appendChild(wrap);
  els.teamCount.textContent = `${state.teams.length} team${state.teams.length === 1 ? "" : "s"}`;

  // Team select
  const current = els.teamSelect.value;
  els.teamSelect.innerHTML = "";
  for(const t of state.teams){
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    els.teamSelect.appendChild(opt);
  }
  if(current && state.teams.some(t => t.id === current)){
    els.teamSelect.value = current;
  }else{
    els.teamSelect.value = state.teams[0]?.id ?? "";
  }

  // Table
  renderTable();

  // Meta
  els.roundCount.textContent = `${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}`;
}

function renderTable(){
  const totals = computeTotals();

  const table = els.scoreTable;
  table.innerHTML = "";

  // THEAD
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const corner = document.createElement("th");
  corner.className = "corner";
  corner.textContent = "";
  trh.appendChild(corner);

  for(const t of state.teams){
    const th = document.createElement("th");
    th.textContent = t.name;
    trh.appendChild(th);
  }

  thead.appendChild(trh);
  table.appendChild(thead);

  // TBODY
  const tbody = document.createElement("tbody");

  for(let rIndex = 0; rIndex < state.rounds.length; rIndex++){
    const round = state.rounds[rIndex];
    const tr = document.createElement("tr");

    const rowHead = document.createElement("th");
    rowHead.className = "rowhead";
    rowHead.textContent = round.label; // ✅ just "1", "2", ...
    tr.appendChild(rowHead);

    for(const t of state.teams){
      const td = document.createElement("td");
      const cell = round.scoresByTeam[t.id];

      const box = document.createElement("div");
      box.className = "cell" + (cell ? "" : " empty");

      if(cell){
        const big = document.createElement("div");
        big.className = "big";
        big.textContent = fmt(cell.value);

        if(cell.isExpr){
          const small = document.createElement("div");
          small.className = "small";
          small.textContent = cell.expr;
          box.appendChild(big);
          box.appendChild(small);
        }else{
          box.appendChild(big);
        }

        const flags = document.createElement("div");
        flags.className = "flags";
        if(cell.isOverride){
          const f = document.createElement("span");
          f.className = "flag override";
          f.textContent = "override";
          flags.appendChild(f);
        }
        if(flags.childNodes.length) box.appendChild(flags);
      }else{
        const big = document.createElement("div");
        big.className = "big";
        big.textContent = "—";
        const small = document.createElement("div");
        small.className = "small";
        // small.textContent = "tap to add/override";
        small.textContent = "";
        box.appendChild(big);
        box.appendChild(small);
      }

      box.addEventListener("click", () => openOverrideModal(rIndex, t.id));
      td.appendChild(box);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  // Totals row
  const trTot = document.createElement("tr");
  trTot.className = "totals-row";

  const thTot = document.createElement("th");
  thTot.className = "rowhead";
  thTot.textContent = "T";
  trTot.appendChild(thTot);

  for(const t of state.teams){
    const td = document.createElement("td");

    const name = document.createElement("div");
    name.className = "total-team";
    name.textContent = t.name;

    const v = totals[t.id] ?? 0;
    const total = document.createElement("div");
    total.className = "total-pill";
    total.textContent = fmt(v);

    td.appendChild(name);
    td.appendChild(total);

    trTot.appendChild(td);
  }

  tbody.appendChild(trTot);
  table.appendChild(tbody);
}

// ---------------- Actions ----------------
function addTeam(){
  state.teams.push({ id: crypto.randomUUID(), name: `Team ${state.teams.length + 1}` });
  render();
  showToast("Team added.", "good");
}

function moveTeam(teamId, delta){
  const idx = state.teams.findIndex(t => t.id === teamId);
  if(idx === -1) return;

  const nextIdx = idx + delta;
  if(nextIdx < 0 || nextIdx >= state.teams.length) return;

  const [moved] = state.teams.splice(idx, 1);
  state.teams.splice(nextIdx, 0, moved);

  render();
  showToast("Play order updated.", "good");
}

function removeTeam(teamId){
  if(state.teams.length <= 2) return;

  for(const round of state.rounds){
    delete round.scoresByTeam[teamId];
  }
  state.teams = state.teams.filter(t => t.id !== teamId);

  if(els.teamSelect.value === teamId){
    els.teamSelect.value = state.teams[0]?.id ?? "";
  }

  render();
  showToast("Team removed.", "warn");
}

function addEntry(teamId, expr){
  const value = parseAndEval(expr);
  const cleanExpr = expr.trim();

  const cell = {
    expr: cleanExpr,
    value,
    isOverride: false,
    isExpr: isExpression(cleanExpr) && !/^\s*\d+(\.\d+)?\s*$/.test(cleanExpr),
  };

  // Find first round where this team has no score; else create new round
  let targetRoundIndex = -1;
  for(let i=0; i<state.rounds.length; i++){
    const round = state.rounds[i];
    if(!round.scoresByTeam[teamId]){
      targetRoundIndex = i;
      break;
    }
  }
  if(targetRoundIndex === -1){
    targetRoundIndex = state.rounds.length;
    ensureRoundsTo(targetRoundIndex);
  }

  const round = state.rounds[targetRoundIndex];

  state.history.push({
    type: "setCell",
    roundIndex: targetRoundIndex,
    teamId,
    prev: round.scoresByTeam[teamId] ? structuredClone(round.scoresByTeam[teamId]) : null
  });

  round.scoresByTeam[teamId] = cell;

  render();
  showToast(`Added ${fmt(value)} to ${teamById(teamId)?.name ?? "team"}.`, "good");

  const wrap = document.querySelector(".table-wrap");
  wrap.scrollTop = wrap.scrollHeight;
}

function undoLast(){
  const action = state.history.pop();
  if(!action){
    showToast("Nothing to undo.", "warn");
    return;
  }

  if(action.type === "setCell"){
    const r = state.rounds[action.roundIndex];
    if(!r){
      showToast("Undo failed (missing round).", "bad");
      return;
    }
    if(action.prev){
      r.scoresByTeam[action.teamId] = action.prev;
    }else{
      delete r.scoresByTeam[action.teamId];
    }

    trimTrailingEmptyRounds();

    render();
    showToast("Undid last entry.", "good");
  }
}

function resetAll(){
  const ok = window.confirm(
    "Reset everything?\n\nThis will clear all teams, rounds, and saved data (localStorage)."
  );
  if(!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  render();
  showToast("Reset complete.", "warn");
}

// ---------------- Manual override modal ----------------
let modalCtx = null; // {roundIndex, teamId}

function openOverrideModal(roundIndex, teamId){
  ensureRoundsTo(roundIndex);

  modalCtx = { roundIndex, teamId };
  const team = teamById(teamId);
  const round = state.rounds[roundIndex];
  const existing = round.scoresByTeam[teamId];

  // Keep modal explicit even though table rowhead is just the number
  els.overrideSub.textContent = `Round ${round.label} • ${team?.name ?? "Team"}`;

  els.overrideInput.value = existing ? existing.expr : "";
  els.overrideModal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.overrideInput.focus(), 0);
}

function closeOverrideModal(){
  els.overrideModal.setAttribute("aria-hidden", "true");
  modalCtx = null;
}

function saveOverride(){
  if(!modalCtx) return;
  const { roundIndex, teamId } = modalCtx;
  const round = state.rounds[roundIndex];

  const expr = els.overrideInput.value.trim();
  if(!expr){
    showToast("Enter a value, or use Clear cell.", "warn");
    return;
  }

  let value;
  try{
    value = parseAndEval(expr);
  }catch(err){
    showToast(err.message || "Invalid expression.", "bad");
    return;
  }

  const prev = round.scoresByTeam[teamId] ? structuredClone(round.scoresByTeam[teamId]) : null;

  state.history.push({
    type: "setCell",
    roundIndex,
    teamId,
    prev
  });

  round.scoresByTeam[teamId] = {
    expr,
    value,
    isOverride: true,
    isExpr: isExpression(expr) && !/^\s*\d+(\.\d+)?\s*$/.test(expr),
  };

  render();
  showToast("Cell overridden.", "good");
  closeOverrideModal();
}

function clearCell(){
  if(!modalCtx) return;
  const { roundIndex, teamId } = modalCtx;
  const round = state.rounds[roundIndex];

  const prev = round.scoresByTeam[teamId] ? structuredClone(round.scoresByTeam[teamId]) : null;
  if(!prev){
    showToast("Cell already empty.", "warn");
    closeOverrideModal();
    return;
  }

  state.history.push({
    type: "setCell",
    roundIndex,
    teamId,
    prev
  });

  delete round.scoresByTeam[teamId];
  trimTrailingEmptyRounds();

  render();
  showToast("Cell cleared.", "warn");
  closeOverrideModal();
}

// Modal close handlers
els.overrideModal.addEventListener("click", (e) => {
  const target = e.target;
  if(target && target.dataset && target.dataset.close === "1"){
    closeOverrideModal();
  }
});
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && els.overrideModal.getAttribute("aria-hidden") === "false"){
    closeOverrideModal();
  }
});

// ---------------- Wire up UI ----------------
els.addTeamBtn.addEventListener("click", addTeam);

els.addScoreBtn.addEventListener("click", () => {
  const teamId = els.teamSelect.value;
  if(!teamId){
    showToast("Pick a team first.", "warn");
    return;
  }

  const expr = els.exprInput.value;

  try{
    addEntry(teamId, expr);

    // Advance selector to next team in order of play
    els.teamSelect.value = nextTeamId(teamId);

    els.exprInput.value = "";
    els.exprInput.focus();
  }catch(err){
    showToast(err.message || "Invalid entry.", "bad");
  }
});

els.exprInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    e.preventDefault();
    els.addScoreBtn.click();
  }
});

els.undoBtn.addEventListener("click", undoLast);
els.resetBtn.addEventListener("click", resetAll);

els.saveOverrideBtn.addEventListener("click", saveOverride);
els.clearCellBtn.addEventListener("click", clearCell);

// Initial render
render();
