const SAMPLE = window.SAMPLE_WEEK;
const PLATE_DEFS = [
  {kg:25,c:"--p25",h:100,w:17},{kg:20,c:"--p20",h:100,w:15},{kg:15,c:"--p15",h:88,w:13},
  {kg:10,c:"--p10",h:76,w:11},{kg:5,c:"--p5",h:56,w:9},{kg:2.5,c:"--p2",h:44,w:7},{kg:1.25,c:"--p1",h:36,w:6}];
const LIFTS = {S:"Agachamento",B:"Supino",D:"Terra"};
const SHORT = {S:"Agacho",B:"Supino",D:"Terra"};
const K = "gtm:";

function load(k, d){ try{ const v = localStorage.getItem(K+k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(K+k, JSON.stringify(v)); }catch(e){} }

const S = {
  data: load("data", SAMPLE),
  prs: null,
  settings: Object.assign({bar:20, collar:0, plates:[25,20,15,10,5,2.5,1.25], api:"", token:"", ntfy:"", ntfyOn:false, awake:true}, load("settings", {})),
  queue: load("queue", []),
  sync: {state: "idle", last: load("lastSync", null), error: null},
  log: load("log", []),
  prHist: load("prHist", []),
  lastLoads: load("lastLoads", {}),
  run: load("run", null),
  view: "home",
  editPR: null,
};
S.prs = load("prs", Object.assign({}, S.data.prs));
// quem já usava os avisos antes desta opção: libera o bloqueio da tela para o aviso chegar ao Watch
if (S.settings.ntfyOn && !("awake" in load("settings", {}))) { S.settings.awake = false; save("settings", S.settings); }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => n == null ? "—" : (Math.round(n*100)/100).toLocaleString("pt-BR");
const mround = (x, r) => Math.round(x / r) * r;
const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };
const restLabel = ex => !ex.rest ? "—" : ex.restMax > ex.rest ? `${ex.rest/60}–${ex.restMax/60} min` : (ex.rest >= 60 ? `${ex.rest/60} min` : `${ex.rest}s`);
const isTimeReps = r => typeof r === "string" && /^\d+\s*s$/i.test(r.trim());
const repsLabel = r => typeof r === "number" ? r : String(r).toLowerCase();

/* ---------- Cargas ---------- */
function planned(sess, ei){
  const ex = sess.exercises[ei], L = ex.load, r = S.data.rounding || 5;
  if (L && L.type === "pct") return {kg: mround(S.prs[L.lift]*L.pct, r), src: `${Math.round(L.pct*100)}% do PR de ${LIFTS[L.lift].toLowerCase()} (${fmt(S.prs[L.lift])})`};
  if (L && L.type === "kg") return {kg: L.kg, src: "carga da planilha"};
  if (L && L.type === "bar") return {kg: S.settings.bar, src: "só a barra"};
  if (ex.kind === "warmup") return warmupSuggest(sess, ei);
  if (ex.kind === "accessory") { const k = S.lastLoads[ex.name]; return k ? {kg:k, src:"última carga que você usou"} : {kg:null, src: ex.loadNote || "carga livre"}; }
  return {kg:null, src:""};
}
function warmupSuggest(sess, ei){
  const xs = sess.exercises, lift = xs[ei].lift, r = S.data.rounding || 5, bar = S.settings.bar;
  let a = ei, b = ei;
  while (a > 0 && xs[a-1].kind === "warmup" && xs[a-1].lift === lift) a--;
  while (b < xs.length-1 && xs[b+1].kind === "warmup" && xs[b+1].lift === lift) b++;
  let top = null;
  for (let j = b+1; j < xs.length; j++) if (xs[j].kind === "top" && xs[j].lift === lift) { top = planned(sess, j).kg; break; }
  if (top == null) return {kg:null, src:"aquecimento"};
  const anchors = [];
  for (let j = a; j <= b; j++) { const L = xs[j].load; if (L && L.type === "kg") anchors.push([j-a, L.kg]); else if (L && L.type === "bar") anchors.push([j-a, bar]); }
  if (!anchors.length || anchors[0][0] !== 0) anchors.unshift([0, bar]);
  anchors.push([b-a+1, top]);
  const i = ei - a;
  let p = anchors[0], n = anchors[anchors.length-1];
  for (const an of anchors) { if (an[0] <= i) p = an; }
  for (const an of anchors) { if (an[0] > i) { n = an; break; } }
  const kg = Math.max(bar, mround(p[1] + (n[1]-p[1]) * (i-p[0]) / (n[0]-p[0]), r));
  return {kg, src:`sugestão rumo ao top set de ${fmt(top)} kg`};
}
function plates(kg){
  if (kg == null) return null;
  let side = (kg - S.settings.bar - 2*S.settings.collar) / 2;
  if (side < -0.001) return {list:[], rest:side, under:true};
  const list = [];
  const avail = PLATE_DEFS.filter(p => S.settings.plates.includes(p.kg));
  for (const p of avail) { while (side >= p.kg - 0.001) { list.push(p); side -= p.kg; } }
  return {list, rest: Math.round(side*100)/100};
}
function plateHTML(kg, compact){
  const P = plates(kg);
  if (!P) return "";
  const rig = P.list.map(p => `<span class="plate" style="height:${p.h*(compact?.7:.86)}px;width:${p.w}px;background:var(${p.c})" title="${fmt(p.kg)} kg"></span>`).join("");
  const counts = {}; P.list.forEach(p => counts[p.kg] = (counts[p.kg]||0)+1);
  const txt = P.under ? "Abaixo do peso da barra" :
    P.list.length ? Object.entries(counts).sort((a,b)=>b[0]-a[0]).map(([k,c]) => `${c>1?c+"× ":""}<b>${fmt(+k)}</b>`).join(" + ") + " <span class='muted'>por lado</span>" : "Só a barra";
  const extra = P.rest > 0.001 ? ` <span class="down">· faltam ${fmt(P.rest)} kg/lado</span>` : "";
  return `<div class="plates"><div class="rig" style="height:${compact?62:86}px" aria-hidden="true"><span class="shaft"></span><span class="collar"></span>${rig}<span class="sleeve"></span></div><div class="plist">${txt}${extra}</div></div>`;
}

/* ---------- Áudio, vibração, tela acesa ---------- */
let ac = null, wake = null;
function audioOn(){ try{ ac = ac || new (window.AudioContext||window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); }catch(e){} }
function beep(freq, dur, when){
  if (!ac) return;
  try{ const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + (when||0);
    o.type = "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+dur+0.05); }catch(e){}
}
function buzz(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
// Tela acesa ajuda a ver o timer, mas impede o iPhone de bloquear; sem bloqueio o aviso não vai para o Watch.
function releaseAwake(){ try{ wake && wake.release(); }catch(e){} wake = null; }
async function keepAwake(){ if (S.settings.awake === false) return; try{ if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } }catch(e){} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.view === "play") keepAwake(); });

/* ---------- Execução ---------- */
function sessById(id){ return S.data.sessions.find(s => s.id === id); }
function buildSteps(sess){ const st = []; sess.exercises.forEach((ex, ei) => { for (let s = 1; s <= ex.sets; s++) st.push({ei, set:s}); }); return st; }
function startRun(id){
  audioOn(); keepAwake();
  const sess = sessById(id);
  if (!S.run || S.run.sid !== id || S.run.sheet !== S.data.sheet)
    S.run = {sid:id, sheet:S.data.sheet, steps: buildSteps(sess), i:0, phase:"work", confirm:null, results:[], override:{}};
  S.view = "play"; persistRun(); render();
}
function persistRun(){ save("run", S.run); }
function curEx(){ const s = sessById(S.run.sid); const st = S.run.steps[S.run.i]; return st ? {sess:s, st, ex:s.exercises[st.ei]} : null; }
function loadFor(sess, ei){ const o = S.run && S.run.override[ei]; const p = planned(sess, ei); return o != null ? {kg:o, src:"carga ajustada por você"} : p; }

function finishSet(){
  audioOn();
  const {sess, st, ex} = curEx();
  const lastSet = st.set === ex.sets;
  if (lastSet && ex.kind !== "warmup" && ex.kind !== "mobility") {
    const p = loadFor(sess, st.ei);
    S.run.confirm = {ei: st.ei, planned: p.kg, actual: p.kg ?? S.lastLoads[ex.name] ?? "", stage: p.kg == null ? "edit" : "ask"};
  }
  S.run.workEnd = null;
  if (S.run.i >= S.run.steps.length - 1) { S.run.phase = "done"; S.run.i = S.run.steps.length; }
  else {
    S.run.phase = "rest";
    const dur = ex.rest || 60;
    S.run.restTotal = dur; S.run.restEnd = Date.now() + dur*1000; S.run.a10 = false; S.run.a0 = false;
    S.run.i++;
    scheduleRestPush();
  }
  persistRun(); render();
}
function endRest(){ if (S.run.restEnd && S.run.restEnd > Date.now() + 1500) cancelRestPush(); S.run.phase = "work"; S.run.restEnd = null; persistRun(); render(); }
function addRest(sec){ S.run.restEnd += sec*1000; S.run.restTotal += sec; S.run.a10 = S.run.a0 = false; persistRun(); scheduleRestPush(); tick(); }
function stepNav(d){ if (S.run.phase === "rest") cancelRestPush(); S.run.i = Math.min(Math.max(0, S.run.i + d), S.run.steps.length-1); S.run.phase = "work"; S.run.restEnd = null; S.run.workEnd = null; persistRun(); render(); }
function startWorkTimer(sec){ audioOn(); S.run.workEnd = Date.now() + sec*1000; render(); }

/* confirmação no fim de cada exercício */
function confirmYes(){ recordResult(S.run.confirm.planned); }
function confirmEdit(){ S.run.confirm.stage = "edit"; render(); const i = document.getElementById("actual"); i && i.focus(); }
function confirmStep(d){ const i = document.getElementById("actual"); const v = (parseFloat(String(i.value).replace(",", ".")) || 0) + d; i.value = Math.max(0, v); }
function confirmSave(){ const v = parseFloat(String(document.getElementById("actual").value).replace(",", ".")); if (!(v > 0)) { toast("Informe a carga em kg"); return; } recordResult(v); }
function confirmSkip(){ S.run.confirm = null; persistRun(); render(); }
function recordResult(actual){
  const c = S.run.confirm, sess = sessById(S.run.sid), ex = sess.exercises[c.ei];
  const entry = {id: uid(), ts: Date.now(), week: S.data.week, sheet: S.data.sheet, session: sess.name, ex: ex.name, sets: ex.sets, reps: ex.reps, planned: c.planned, actual};
  S.log.unshift(entry); S.log = S.log.slice(0, 400); save("log", S.log);
  S.run.results.push(entry);
  const evs = [Object.assign({type: "log"}, entry)];
  if (ex.kind === "accessory") { S.lastLoads[ex.name] = actual; save("lastLoads", S.lastLoads); evs.push({id: uid(), type: "load", ts: Date.now(), ex: ex.name, kg: actual}); }
  enqueue(evs);
  const L = ex.load;
  if (L && L.type === "pct" && c.planned != null && Math.abs(actual - c.planned) > 0.01) {
    const implied = mround(actual / L.pct, S.data.rounding || 5);
    if (implied !== S.prs[L.lift]) { S.run.confirm = Object.assign(c, {stage:"pr", actual, lift:L.lift, implied, pct:L.pct}); persistRun(); render(); return; }
  }
  if (c.planned != null && Math.abs(actual - c.planned) > 0.01) { S.run.override[c.ei] = actual; if (S.run.phase === "rest") scheduleRestPush(); }
  S.run.confirm = null; persistRun(); render(); toast("Registrado: " + fmt(actual) + " kg");
}
function prAccept(){
  const c = S.run.confirm, from = S.prs[c.lift];
  S.prs[c.lift] = c.implied; save("prs", S.prs);
  const h = {id: uid(), ts:Date.now(), lift:c.lift, from, to:c.implied, why:`${fmt(c.actual)} kg em ${Math.round(c.pct*100)}%`};
  S.prHist.unshift(h); save("prHist", S.prHist); enqueue([Object.assign({type: "pr"}, h)]);
  S.run.confirm = null; persistRun(); render(); toast(`PR de ${LIFTS[c.lift].toLowerCase()}: ${fmt(c.implied)} kg`);
  if (S.run.phase === "rest") scheduleRestPush(); // a próxima carga mudou
}
function prKeep(){ S.run.override[S.run.confirm.ei] = S.run.confirm.actual; S.run.confirm = null; persistRun(); render(); if (S.run.phase === "rest") scheduleRestPush(); }

/* ---------- Timer ---------- */
function tick(){
  if (S.view !== "play" || !S.run) return;
  if (S.run.phase === "rest" && S.run.restEnd) {
    const left = (S.run.restEnd - Date.now())/1000;
    const t = document.getElementById("rt"), ring = document.getElementById("ring"), arc = document.getElementById("arc"), lab = document.getElementById("rl");
    if (t) t.textContent = left > 0 ? mmss(left) : "+" + mmss(-left);
    if (arc) arc.style.strokeDashoffset = String((1 - Math.max(0, Math.min(1, left / S.run.restTotal))) * 100);
    if (ring) ring.className = "ring" + (left <= 0 ? " go" : left <= 10 ? " warn" : "");
    if (lab) lab.textContent = left > 0 ? "descanso" : "bora, barra!";
    if (left <= 10 && left > 0 && !S.run.a10) { S.run.a10 = true; beep(660,.12); beep(660,.12,.2); buzz([150,100,150]); }
    if (left <= 0 && !S.run.a0) { S.run.a0 = true; beep(988,.35); beep(988,.35,.45); beep(1319,.6,.9); buzz([400,150,400,150,600]); document.body.classList.remove("flash"); void document.body.offsetWidth; document.body.classList.add("flash"); }
  }
  if (S.run.phase === "work" && S.run.workEnd) {
    const left = (S.run.workEnd - Date.now())/1000, el = document.getElementById("wt");
    if (el) el.textContent = mmss(left);
    if (left <= 0) { S.run.workEnd = null; beep(988,.4); buzz([300,100,300]); finishSet(); }
  }
}
setInterval(tick, 250);

/* ---------- Telas ---------- */
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

function sessDoneThisWeek(s){ return S.log.some(l => l.sheet === S.data.sheet && l.session === s.name); }
function estMinutes(s){ return Math.round(s.exercises.reduce((t, e) => t + e.sets * (40 + (e.rest || 60)), 0) / 60); }

function homeView(){
  const d = S.data, total = (S.prs.S||0) + (S.prs.B||0) + (S.prs.D||0);
  const prTiles = ["S","B","D"].map(l => S.editPR === l
    ? `<div class="pr"><span class="lift">${SHORT[l]}</span><input id="pr-${l}" type="number" inputmode="decimal" step="2.5" value="${S.prs[l]}" aria-label="PR de ${LIFTS[l]}" onkeydown="if(event.key==='Enter')savePR('${l}')" onblur="savePR('${l}')"></div>`
    : `<button class="pr" onclick="editPR('${l}')" aria-label="Editar PR de ${LIFTS[l]}"><span class="lift">${SHORT[l]}</span><span class="v num">${fmt(S.prs[l])}<small>kg</small></span></button>`).join("");
  const sess = d.sessions.map(s => {
    const tops = s.exercises.filter(e => e.kind === "top").map(e => `<span>${esc(LIFTS[e.lift]||e.name)} ${e.sets}×${repsLabel(e.reps)} <b>${fmt(planned(s, s.exercises.indexOf(e)).kg)}</b></span>`).join("");
    const nSets = s.exercises.reduce((t,e)=>t+e.sets,0);
    return `<div class="sess"><div style="min-width:0">
      <h2>${esc(s.name)} ${s.focus ? `<span>${esc(s.focus)}</span>` : ""} ${sessDoneThisWeek(s) ? `<span class="done-chip">FEITO</span>` : ""}</h2>
      ${tops ? `<div class="tops">${tops}</div>` : ""}
      <div class="meta">${s.exercises.length} exercícios · ${nSets} séries · ~${estMinutes(s)} min</div></div>
      <button class="play" onclick="startRun(${s.id})" aria-label="Iniciar ${esc(s.name)}">${ICON_PLAY}</button></div>`;
  }).join("");
  const resume = S.run && S.run.sheet === d.sheet && S.run.phase !== "done" && sessById(S.run.sid)
    ? `<button class="resume" onclick="startRun(${S.run.sid})"><span>Continuar ${esc(sessById(S.run.sid).name)} · série ${Math.min(S.run.i+1, S.run.steps.length)} de ${S.run.steps.length}</span>${ICON_PLAY.replace('<svg','<svg width="18" height="18"')}</button>` : "";
  const hist = [...S.prHist.slice(0,3).map(h => ({ts:h.ts, html:`<span>PR ${LIFTS[h.lift].toLowerCase()} <span class="${h.to>h.from?'up':'down'}">${fmt(h.from)} → ${fmt(h.to)}</span><br><span class="d">${esc(h.why)}</span></span>`})),
    ...S.log.slice(0,6).map(l => ({ts:l.ts, html:`<span>${esc(l.ex)}<br><span class="d">${esc(l.session)} · ${l.sets}×${esc(repsLabel(l.reps))}</span></span><span class="num" style="font-size:18px">${l.planned!=null && Math.abs(l.actual-l.planned)>.01 ? `<span class="${l.actual>l.planned?'up':'down'}">${fmt(l.actual)}</span>` : fmt(l.actual)} kg</span>`}))]
    .sort((a,b)=>b.ts-a.ts).slice(0,7);
  return `
  <header class="top"><div><div class="eyebrow">${esc(d.athlete || "Atleta")} · powerlifting</div><h1>${esc(d.week)}</h1>
    <div class="src">Planilha: aba “${esc(d.sheet)}”</div></div>
    <button class="btn" onclick="openSettings()">Ajustes</button></header>
  ${syncLine()}
  <section><div class="eyebrow">PRs · total ${fmt(total)} kg</div><div class="prs">${prTiles}</div>
    <div class="prnote" style="margin-top:6px"><span>Toque para editar. As cargas de top set recalculam na hora.</span></div></section>
  ${resume}
  <section><div class="eyebrow">Treinos da semana</div><div class="sessions">${sess}</div></section>
  ${hist.length ? `<section><div class="eyebrow">Últimos registros</div><div class="hist">${hist.map(h=>`<div>${h.html}</div>`).join("")}</div></section>` : ""}
  `;
}

function confirmHTML(){
  const c = S.run && S.run.confirm; if (!c) return "";
  const ex = sessById(S.run.sid).exercises[c.ei];
  const head = `<div><div class="eyebrow">Fim do exercício</div><h3>${esc(ex.name)} · ${ex.sets}×${esc(repsLabel(ex.reps))}</h3></div>`;
  if (c.stage === "ask") return `<div class="confirm">${head}
    <div>Fez com a carga da planilha, <b class="num" style="font-size:22px">${fmt(c.planned)} kg</b>?</div>
    <div class="acts"><button class="btn primary" onclick="confirmYes()">Sim, ${fmt(c.planned)} kg</button><button class="btn" onclick="confirmEdit()">Usei outra carga</button></div></div>`;
  if (c.stage === "edit") return `<div class="confirm">${head}
    <div>${c.planned==null ? "Qual carga você usou?" : "Qual carga você usou de fato?"}</div>
    <div class="stepper"><button onclick="confirmStep(-2.5)" aria-label="Menos 2,5 kg">−</button><input id="actual" type="number" inputmode="decimal" step="0.5" value="${c.actual ?? ""}" aria-label="Carga usada em kg"><button onclick="confirmStep(2.5)" aria-label="Mais 2,5 kg">+</button><span class="muted">kg</span></div>
    <div class="acts"><button class="btn primary" onclick="confirmSave()">Salvar</button><button class="btn ghost" onclick="confirmSkip()">Pular</button></div></div>`;
  if (c.stage === "pr") return `<div class="confirm">${head}
    <div>${fmt(c.actual)} kg em ${Math.round(c.pct*100)}% indica um PR de ${LIFTS[c.lift].toLowerCase()} de <b class="num ${c.implied>S.prs[c.lift]?'up':'down'}" style="font-size:22px">${fmt(c.implied)} kg</b> (hoje: ${fmt(S.prs[c.lift])} kg).</div>
    <div class="acts"><button class="btn primary" onclick="prAccept()">Atualizar PR para ${fmt(c.implied)}</button><button class="btn" onclick="prKeep()">Manter ${fmt(S.prs[c.lift])}</button></div></div>`;
  return "";
}

function demoURL(name){
  const base = name.replace(/aquecimento|\d+º|top set\s*\d?|competi?t?t?ivo/gi, "").replace(/\s+/g," ").trim() || name;
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(base + " técnica powerlifting");
}

function playView(){
  const r = S.run, sess = sessById(r.sid), total = r.steps.length, pct = Math.round(Math.min(r.i, total) / total * 100);
  const bar = `<div class="pbar"><button class="x" onclick="goHome()" aria-label="Sair do treino">${ICON_X}</button><div class="prog"><i style="width:${pct}%"></i></div><span class="pcount">${Math.min(r.i+(r.phase==="work"?1:0), total)}/${total}</span></div>`;

  if (r.phase === "done") {
    const rows = r.results.map(e => `<div><span>${esc(e.ex)}<br><span class="muted" style="font-size:12px">${e.sets}×${esc(repsLabel(e.reps))}</span></span><span class="num" style="font-size:20px">${fmt(e.actual)} kg</span></div>`).join("");
    return `${bar}${confirmHTML()}<div><div class="eyebrow">${esc(sess.name)}</div><div class="exname" style="font-size:44px">Treino concluído</div></div>
      ${rows ? `<div class="summary">${rows}</div>` : ""}
      <button class="big" onclick="closeRun()">Voltar para a semana</button>`;
  }

  if (r.phase === "rest") {
    const nst = r.steps[r.i], nex = sess.exercises[nst.ei], np = loadFor(sess, nst.ei);
    const prev = r.steps[r.i-1], pp = prev ? loadFor(sess, prev.ei) : null;
    let delta = "";
    if (np.kg != null && pp && pp.kg != null && nex.kind !== "accessory") {
      const d = (np.kg - pp.kg) / 2;
      delta = Math.abs(d) < .01 ? `<span class="delta muted">Mesma carga</span>` : `<span class="delta ${d>0?'up':'down'}">${d>0?"+":"−"}${fmt(Math.abs(d))} kg por lado</span>`;
    }
    const exChange = !prev || prev.ei !== nst.ei;
    return `${bar}<div class="rest">
      <div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="var(--sunken)" stroke-width="7"/><circle id="arc" class="fg" cx="50" cy="50" r="46" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg>
        <div class="t"><div><span class="num" id="rt">${mmss(r.restTotal)}</span><small id="rl">descanso</small></div></div></div>
      <div class="restbtns"><button class="btn" onclick="addRest(30)">+30 s</button><button class="btn primary" onclick="endRest()">Começar série</button></div>
      <div class="muted" style="font-size:12px">Pausa da planilha: ${restLabel(sess.exercises[prev.ei])}</div>
    </div>
    ${confirmHTML()}
    <div class="next"><div class="eyebrow">${exChange ? "Próximo exercício · monte a barra" : "Próxima série"}</div>
      <div class="row"><div style="min-width:0"><div style="font-weight:600">${esc(nex.name)}</div><div class="muted" style="font-size:13px">Série ${nst.set} de ${nex.sets} · ${esc(repsLabel(nex.reps))} reps</div></div>
      ${np.kg != null ? `<div style="text-align:right"><span class="kg num">${fmt(np.kg)}</span><span class="muted"> kg</span></div>` : ""}</div>
      ${delta}${np.kg != null && nex.kind !== "accessory" ? plateHTML(np.kg, true) : ""}</div>`;
  }

  const {st, ex} = curEx(), p = loadFor(sess, st.ei);
  const kindLabel = {warmup:"Aquecimento", top:"Top set", accessory:"Acessório", mobility:"Mobilidade"}[ex.kind];
  const timeReps = isTimeReps(ex.reps);
  const spec = PixelMoves.specFor(ex);
  const showPlates = p.kg != null && (ex.kind === "top" || ex.kind === "warmup" || /barra/i.test(ex.name));
  const loadBlock = p.kg != null
    ? `<div><div class="load"><span class="kg num">${fmt(p.kg)}</span><span class="u">kg</span></div><div class="loadsrc">${esc(p.src)}</div></div>${showPlates ? plateHTML(p.kg) : ""}`
    : ex.kind === "mobility" ? "" : `<div class="loadsrc">${esc(p.src || "Carga livre")} — você informa no fim do exercício.</div>`;
  return `${bar}
    <div><div class="eyebrow">${esc(sess.name)}${sess.focus ? " · " + esc(sess.focus) : ""}</div>
      <div class="exname" style="margin-top:4px">${esc(ex.name)}</div>
      <div class="tags"><span class="tag k-${ex.kind}">${kindLabel}</span><span class="tag">Série ${st.set} de ${ex.sets}</span><span class="tag">Pausa ${restLabel(ex)}</span></div></div>
    ${spec ? `<div class="anim"><canvas id="fig" width="112" height="64" role="img" aria-label="Animação: ${esc(ex.name)}"></canvas>
      <div class="phases">${spec.phases.filter(p=>p.label).map((p,i)=>`<span data-i="${spec.phases.indexOf(p)}">${esc(p.label)}</span>`).join("")}</div></div>` : ""}
    <div class="hero">
      <div class="reps"><div><span class="l">Reps</span><div class="num">${esc(repsLabel(ex.reps))}</div></div>
        ${r.workEnd ? `<div><span class="l">Tempo</span><div class="num" id="wt">${mmss((r.workEnd-Date.now())/1000)}</div></div>` : ""}</div>
      ${loadBlock}
      ${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ""}
      ${spec ? "" : `<a class="demo" href="${demoURL(ex.name)}" target="_blank" rel="noopener">Ver demonstração do movimento ↗</a>`}
    </div>
    <div class="dock">${timeReps && !r.workEnd ? `<button class="big" onclick="startWorkTimer(${parseInt(ex.reps)})">Iniciar ${parseInt(ex.reps)} s</button>` : `<button class="big ok" onclick="finishSet()">Série feita</button>`}
    <div class="navs"><button onclick="stepNav(-1)">‹ Série anterior</button><button onclick="stepNav(1)">Pular série ›</button></div></div>`;
}

function render(){
  const app = document.getElementById("app");
  app.innerHTML = S.view === "play" && S.run ? playView() : S.view === "settings" ? settingsView() : homeView();
  mountFigure();
  tick();
}

function mountFigure(){
  const el = document.getElementById("fig"); if (!el || !S.run) return;
  const {sess, st, ex} = curEx(), kg = loadFor(sess, st.ei).kg, P = plates(kg);
  const chips = document.querySelectorAll(".phases span");
  PixelMoves.mount(el, ex, P && P.list.length ? P.list[0].kg : null, i => chips.forEach(c => c.classList.toggle("on", +c.dataset.i === i)));
}

/* ---------- Ações da home ---------- */
function editPR(l){ S.editPR = l; render(); const i = document.getElementById("pr-"+l); i && (i.focus(), i.select()); }
function savePR(l){
  if (S.editPR !== l) return;
  const v = parseFloat(String(document.getElementById("pr-"+l).value).replace(",", "."));
  if (v > 0 && v !== S.prs[l]) {
    const h = {id: uid(), ts:Date.now(), lift:l, from:S.prs[l], to:v, why:"editado manualmente"};
    S.prHist.unshift(h); save("prHist", S.prHist); S.prs[l] = v; save("prs", S.prs); enqueue([Object.assign({type: "pr"}, h)]);
  }
  S.editPR = null; render();
}
function setSetting(k, v){ S.settings[k] = v; save("settings", S.settings); render(); }
function togglePlate(kg){ const a = S.settings.plates; S.settings.plates = a.includes(kg) ? a.filter(x=>x!==kg) : [...a, kg]; save("settings", S.settings); render(); }
function goHome(){ S.view = "home"; render(); window.scrollTo(0, 0); }
function closeRun(){ cancelRestPush(); S.run = null; save("run", null); S.view = "home"; render(); }

let toastT;
function toast(msg){ let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role","status"); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

function loadSheetJS(){
  return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
}
async function importXlsx(file){
  if (!file) return;
  try {
    toast("Lendo planilha…");
    await loadSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), {cellFormula:true});
    const name = wb.SheetNames[0];
    const data = TreinoParser.parseSheet(wb.Sheets[name], name);
    if (!data.sessions.length) { toast("Não achei treinos na primeira aba"); return; }
    const kept = [];
    for (const l of ["S","B","D"]) { if (S.prs[l] > data.prs[l]) kept.push(LIFTS[l].toLowerCase()); else S.prs[l] = data.prs[l]; }
    S.data = data; save("data", data); save("prs", S.prs);
    render();
    toast(`Importado: ${data.week}` + (kept.length ? ` · mantive seu PR maior de ${kept.join(", ")}` : ""));
  } catch(e) { toast("Não consegui ler esse arquivo. Exporte a planilha como .xlsx e tente de novo."); }
}

/* ---------- Sincronização com o Apps Script ---------- */
const connected = () => !!(S.settings.api && S.settings.token);
function enqueue(evs){ S.queue.push(...evs); save("queue", S.queue); flush(); }

async function api(method, body){
  const url = new URL(S.settings.api);
  let res;
  if (method === "GET") { url.searchParams.set("action", body || "state"); url.searchParams.set("token", S.settings.token); res = await fetch(url, {cache: "no-store"}); }
  // text/plain evita o preflight de CORS, que o Apps Script não responde
  else res = await fetch(url, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(Object.assign({token: S.settings.token}, body))});
  if (!res.ok) throw new Error("O servidor respondeu " + res.status);
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j;
}

function applyState(st){
  if (st.week && st.week.sessions && st.week.sessions.length) { S.data = st.week; save("data", S.data); }
  if (st.prs && Object.keys(st.prs).length) { S.prs = Object.assign({}, S.data.prs, st.prs); save("prs", S.prs); }
  if (st.lastLoads) { S.lastLoads = Object.assign({}, st.lastLoads); save("lastLoads", S.lastLoads); }
  const pending = new Set(S.queue.map(e => e.id));
  if (st.log) { S.log = S.log.filter(l => pending.has(l.id)).concat(st.log); save("log", S.log); }
  if (st.prHist) { S.prHist = S.prHist.filter(h => pending.has(h.id)).concat(st.prHist); save("prHist", S.prHist); }
  S.sync.last = Date.now(); save("lastSync", S.sync.last);
}

let flushing = null;
async function flush(){
  if (!connected() || flushing) return flushing;
  const batch = S.queue.slice();
  S.sync.state = "busy"; refreshSync();
  flushing = (async () => {
    try {
      const st = batch.length ? await api("POST", {action: "events", events: batch}) : await api("GET", "state");
      const sent = new Set(batch.map(e => e.id));
      S.queue = S.queue.filter(e => !sent.has(e.id)); save("queue", S.queue);
      applyState(st); S.sync.state = "ok"; S.sync.error = null;
    } catch (e) { S.sync.state = "error"; S.sync.error = e.message || String(e); }
    finally { flushing = null; if (S.view !== "play") render(); else refreshSync(); }
  })();
  return flushing;
}
async function importNow(){
  if (!connected()) { toast("Configure a conexão primeiro"); return; }
  toast("Buscando a planilha do treinador…");
  try { await flush(); const st = await api("POST", {action: "import"}); applyState(st); render(); toast("Semana atual: " + S.data.week); }
  catch (e) { toast("Não consegui buscar: " + (e.message || e)); }
}
function syncLine(){
  let txt, cls = "muted";
  if (!connected()) txt = "Semana de exemplo. Conecte sua planilha em Ajustes.";
  else if (S.sync.state === "busy") txt = "Sincronizando…";
  else if (S.sync.state === "error") { txt = S.queue.length ? `${S.queue.length} registro(s) guardado(s) no celular, envio quando houver conexão.` : "Sem conexão com a planilha agora."; cls = "down"; }
  else txt = (S.queue.length ? `${S.queue.length} registro(s) para enviar · ` : "") + (S.sync.last ? "Sincronizado " + new Date(S.sync.last).toLocaleString("pt-BR", {weekday:"short", hour:"2-digit", minute:"2-digit"}) : "Conectado");
  return `<div class="syncline ${cls}" id="syncline">${esc(txt)}</div>`;
}
function refreshSync(){ const el = document.getElementById("syncline"); if (el) el.outerHTML = syncLine(); }
window.addEventListener("online", () => flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });
setInterval(() => { if (S.queue.length) flush(); }, 60000);

/* ---------- Notificações no iPhone e no Apple Watch (ntfy) ---------- */
const NTFY = "https://ntfy.sh/";
const pushOn = () => S.settings.ntfyOn && /^[\w-]{8,64}$/.test(S.settings.ntfy || "");
function platesText(kg){
  const P = plates(kg); if (!P || P.under) return "";
  if (!P.list.length) return "só a barra";
  const c = {}; P.list.forEach(p => c[p.kg] = (c[p.kg]||0)+1);
  return Object.entries(c).sort((a,b)=>b[0]-a[0]).map(([k,n]) => (n>1?n+"×":"")+fmt(+k)).join(" + ") + " por lado";
}
function ntfyPost(seq, delaySec, title, msg, prio){
  // parâmetros na URL e corpo em texto: requisição simples, sem preflight de CORS
  const u = `${NTFY}${encodeURIComponent(S.settings.ntfy)}/${seq}?in=${Math.round(delaySec)}s&t=${encodeURIComponent(title)}&p=${prio}&ta=weight_lifter`;
  return fetch(u, {method: "POST", body: msg}).catch(() => {});
}
function ntfyCancel(seq){ return fetch(`${NTFY}${encodeURIComponent(S.settings.ntfy)}/${seq}/delete`).catch(() => {}); }
function scheduleRestPush(){
  if (!pushOn() || !S.run || !S.run.restEnd) return;
  const left = (S.run.restEnd - Date.now()) / 1000;
  const sess = sessById(S.run.sid), st = S.run.steps[S.run.i]; if (!st) return;
  const ex = sess.exercises[st.ei], kg = loadFor(sess, st.ei).kg;
  const next = `${ex.name} · série ${st.set}/${ex.sets} · ${repsLabel(ex.reps)} reps` + (kg != null ? ` · ${fmt(kg)} kg` : "");
  const pl = kg != null && ex.kind !== "accessory" ? "\n" + platesText(kg) : "";
  if (left > 20) ntfyPost("descanso-10s", left - 10, "Faltam 10 s", next + pl, 4); else ntfyCancel("descanso-10s");
  if (left >= 10) ntfyPost("descanso", left, "Bora, barra!", next + pl, 5);
}
function cancelRestPush(){ if (pushOn()) { ntfyCancel("descanso-10s"); ntfyCancel("descanso"); } }
async function testPush(){
  if (!pushOn()) { toast("Ative as notificações e confira o tópico"); return; }
  // O iPhone só repassa ao Watch quando está bloqueado: o teste chega com atraso para dar tempo de bloquear.
  await ntfyPost("teste", 15, "GTM", "Teste: se apareceu no relógio, está tudo certo.", 5);
  toast("Bloqueie o iPhone agora. O aviso chega em 15 s.");
}

/* ---------- Ajustes ---------- */
function openSettings(){ S.view = "settings"; render(); window.scrollTo(0, 0); }
function saveConn(){
  const api = document.getElementById("api").value.trim(), token = document.getElementById("token").value.trim();
  if (api && !/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(api)) { toast("O endereço deve terminar em /exec"); return; }
  S.settings.api = api; S.settings.token = token; save("settings", S.settings);
  S.sync.state = "idle"; toast(api ? "Conectando…" : "Conexão removida");
  flush().then(() => { if (S.sync.state === "ok") toast("Conectado. Semana: " + S.data.week); else if (S.sync.error) toast(S.sync.error); render(); });
}
function setPush(on){
  if (on && !S.settings.ntfy) S.settings.ntfy = "gtm-" + uid().replace(/-/g, "").slice(0, 16);
  if (on && !S.settings.ntfyOn) { S.settings.awake = false; releaseAwake(); }
  S.settings.ntfyOn = on; save("settings", S.settings); render();
}
function setAwake(on){ S.settings.awake = on; save("settings", S.settings); if (!on) releaseAwake(); render(); }
function copyTopic(){
  const v = S.settings.ntfy;
  navigator.clipboard && navigator.clipboard.writeText(v).then(() => toast("Tópico copiado"), () => selectTopic());
  if (!navigator.clipboard) selectTopic();
}
function selectTopic(){ const el = document.getElementById("topic"); if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }

function settingsView(){
  const plateChips = PLATE_DEFS.map(p => `<button class="chip" aria-pressed="${S.settings.plates.includes(p.kg)}" onclick="togglePlate(${p.kg})">${fmt(p.kg)}</button>`).join("");
  return `
  <div class="pbar"><button class="x" onclick="goHome()" aria-label="Voltar">${ICON_X}</button><h1 class="exname" style="font-size:30px;flex:1">Ajustes</h1></div>
  <section class="card"><div class="eyebrow">Planilha do treinador</div>
    <p class="help">Cole o endereço do Apps Script (termina em <code>/exec</code>) e o token que o <code>setup()</code> mostrou no log.</p>
    <label class="lbl" for="api">Endereço do Apps Script</label><input class="inp" id="api" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.settings.api)}">
    <label class="lbl" for="token">Token</label><input class="inp" id="token" type="password" autocomplete="off" value="${esc(S.settings.token)}">
    <div class="acts"><button class="btn primary" onclick="saveConn()">Salvar e conectar</button>${connected() ? `<button class="btn" onclick="importNow()">Buscar planilha agora</button>` : ""}</div>
    ${syncLine()}
  </section>
  <section class="card"><div class="eyebrow">Avisos no iPhone e no Apple Watch</div>
    <p class="help">O fim do descanso chega como notificação pelo app <b>ntfy</b>. Com o iPhone bloqueado, ela aparece e vibra no relógio.</p>
    <div class="field"><label for="push">Avisar fim do descanso</label><input id="push" type="checkbox" ${S.settings.ntfyOn ? "checked" : ""} onchange="setPush(this.checked)"></div>
    ${S.settings.ntfyOn ? `<ol class="steps">
      <li>Instale o app <b>ntfy</b> no iPhone (App Store).</li>
      <li>Toque em <b>+</b> e assine este tópico: <code id="topic">${esc(S.settings.ntfy)}</code> <button class="btn ghost" onclick="copyTopic()">Copiar</button></li>
      <li>Permita notificações do ntfy e, no app Watch do iPhone, em <b>Notificações → ntfy</b>, deixe <b>Espelhar alertas do iPhone</b>.</li>
    </ol>
    <p class="help">O iPhone só manda o aviso para o relógio quando está bloqueado, com a tela apagada, e com o relógio no pulso e desbloqueado. Um modo Foco ativo também segura o aviso.</p>
    <div class="field"><label for="awake">Manter a tela acesa no treino</label><input id="awake" type="checkbox" ${S.settings.awake !== false ? "checked" : ""} onchange="setAwake(this.checked)"></div>
    <p class="help">${S.settings.awake !== false ? "Ligado: o iPhone não bloqueia sozinho, então os avisos ficam só nele. Bloqueie a tela no descanso para receber no relógio." : "Desligado: o iPhone bloqueia sozinho no descanso e o aviso vai para o relógio."}</p>
    <p class="help">O tópico funciona como senha: quem souber o nome vê os avisos. Não compartilhe.</p>
    <div class="acts"><button class="btn" onclick="testPush()">Testar no relógio (15 s)</button></div>` : ""}
  </section>
  <section class="card"><div class="eyebrow">Barra e anilhas da sua academia</div>
    <div class="field"><label for="bar">Barra</label><select id="bar" onchange="setSetting('bar',+this.value)">${[20,15,25].map(v=>`<option value="${v}" ${S.settings.bar===v?"selected":""}>${v} kg</option>`).join("")}</select></div>
    <div class="field"><label for="collar">Presilhas (cada)</label><select id="collar" onchange="setSetting('collar',+this.value)">${[0,2.5].map(v=>`<option value="${v}" ${S.settings.collar===v?"selected":""}>${v?fmt(v)+" kg (competição)":"sem peso"}</option>`).join("")}</select></div>
    <div class="field" style="flex-direction:column;align-items:flex-start"><span>Anilhas disponíveis (kg)</span><div class="chips">${plateChips}</div></div>
  </section>
  <section class="card"><div class="eyebrow">Sem internet?</div>
    <p class="help">Baixe a planilha como .xlsx e importe aqui. Os registros feitos offline ficam no celular e sobem quando a conexão voltar.</p>
    <label class="btn" for="xl" style="cursor:pointer;align-self:flex-start">Importar .xlsx</label><input id="xl" type="file" accept=".xlsx,.xls" hidden onchange="importXlsx(this.files[0])">
  </section>`;
}

/* ---------- Início ---------- */
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
render();
if (connected()) flush();
