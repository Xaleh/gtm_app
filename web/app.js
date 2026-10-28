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
  settings: Object.assign({bar:20, collar:0, plates:[25,20,15,10,5,2.5,1.25], api:"", token:"", ntfy:"", ntfyOn:false, screenOn:true}, load("settings", {})),
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
delete S.settings.awake; // opção antiga, da época dos avisos no Watch

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
  const rig = P.list.map(p => `<span class="plate" style="height:${Math.round(p.h*(compact?.7:.86)/4)*4}px;width:${Math.round(p.w/2)*2}px;background:var(${p.c})" title="${fmt(p.kg)} kg"></span>`).join("");
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
function releaseAwake(){ try{ wake && wake.release(); }catch(e){} wake = null; }
async function keepAwake(){ if (S.settings.screenOn === false) return; try{ if ("wakeLock" in navigator && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => wake = null); } }catch(e){} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.view === "play") keepAwake(); });

/* ---------- Execução ---------- */
function sessById(id){ return S.data.sessions.find(s => s.id === id); }
function buildSteps(sess){ const st = []; sess.exercises.forEach((ex, ei) => { for (let s = 1; s <= ex.sets; s++) st.push({ei, set:s}); }); return st; }
function startRun(id){
  audioOn(); keepAwake();
  const sess = sessById(id);
  if (!S.run || S.run.sid !== id || S.run.sheet !== S.data.sheet)
    S.run = {sid:id, sheet:S.data.sheet, steps: buildSteps(sess), i:0, phase:"work", confirm:null, results:[], override:{}, started: Date.now()};
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
  const el0 = document.getElementById("elapsed"); if (el0 && S.run.started) el0.textContent = clock(Date.now() - S.run.started);
  if (S.run.phase === "rest" && S.run.restEnd) {
    const left = (S.run.restEnd - Date.now())/1000;
    const t = document.getElementById("rt"), ring = document.getElementById("ring"), lab = document.getElementById("rl");
    if (t) t.textContent = left > 0 ? mmss(left) : "+" + mmss(-left);
    if (ring) { const rs = ring.querySelectorAll("rect"), on = Math.ceil(Math.max(0, Math.min(1, left / S.run.restTotal)) * rs.length); rs.forEach((el, k) => el.classList.toggle("on", k < on)); }
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
const ICON_PLAY = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="M4 2h2v1h2v1h2v1h2v1h2v4h-2v1h-2v1H8v1H6v1H4z"/></svg>`;
const PX = 'shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"';
const ICON_GEAR = `<svg viewBox="0 0 16 16" ${PX}><path d="M7 1h2v2h2v1h1v1h1v2h2v2h-2v2h-1v1h-1v1H9v2H7v-2H5v-1H4v-1H3V9H1V7h2V5h1V4h1V3h2zM7 6v1H6v2h1v1h2V9h1V7H9V6z"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 16 16" ${PX}><path d="M13 3h2v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-1H4v-1H3V9H2V8H1V6h2v1h1v1h1v1h1v1h1V9h1V8h1V7h1V6h1V5h1V4h1z"/></svg>`;
const ICON_BACK = `<svg viewBox="0 0 16 16" ${PX}><path d="M7 2h2v2H8v1H7v1h7v4H7v1h1v1h1v2H7v-1H6v-1H5v-1H4V9H3V7h1V6h1V5h1V4h1z"/></svg>`;
const ICON_CLOCK = `<svg viewBox="0 0 10 10" ${PX}><path d="M3 0h4v1h1v1h1v1h1v4H9v1H8v1H7v1H3V9H2V8H1V7H0V3h1V2h1V1h1zM4 2v4h3V5H5V2z"/></svg>`;
const LOGO = `<svg viewBox="0 0 15 10" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="4" width="15" height="2" fill="#A9B0BC"/><rect x="2" y="1" width="2" height="8" fill="#FF6B1A"/><rect x="4" y="2" width="1" height="6" fill="#B8440A"/><rect x="11" y="1" width="2" height="8" fill="#FF6B1A"/><rect x="10" y="2" width="1" height="6" fill="#B8440A"/></svg>`;
const ICON_X = `<svg viewBox="0 0 16 16" width="18" height="18" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="M2 2h3v1h1v1h1v1h2V4h1V3h1V2h3v3h-1v1h-1v1h-1v2h1v1h1v1h1v3h-3v-1h-1v-1H9v-1H7v1H6v1H5v1H2v-3h1v-1h1V9h1V7H4V6H3V5H2z"/></svg>`;

function sessDoneThisWeek(s){ return S.log.some(l => l.sheet === S.data.sheet && l.session === s.name); }
function estMinutes(s){ return Math.round(s.exercises.reduce((t, e) => t + e.sets * (40 + (e.rest || 60)), 0) / 60); }

// "SEMANA 20" → número em laranja, como o destaque da referência
const weekTitle = w => esc(w).replace(/(\d+)\s*$/, "<em>$1</em>");
const XLSX_INPUT = id => `<input id="${id}" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onchange="importXlsx(this.files[0])">`;
function importCard(){
  if (isSample()) return `<section class="card px hot"><div class="eyebrow">Comece pela sua planilha</div>
    <p class="help">Importe a planilha do treinador em .xlsx e o app monta os treinos da semana com as suas cargas. Até lá, você vê uma semana de exemplo.</p>
    <label class="btn primary" for="xl-home" style="align-self:flex-start">Importar planilha (.xlsx)</label>${XLSX_INPUT("xl-home")}
    <p class="help">No Planilhas Google do iPhone: <b>Compartilhar e exportar → Enviar uma cópia → Excel (.xlsx)</b> e salve em Arquivos. A semana atual precisa ser a primeira aba.</p>
    <p class="help">Prefere que a semana nova chegue sozinha toda segunda? Conecte em <a href="#" onclick="openSettings();return false" style="color:var(--accent)">Ajustes</a>.</p></section>`;
  return `<section class="card px"><div class="eyebrow">Semana nova do treinador?</div>
    <label class="btn" for="xl-home" style="align-self:flex-start">Importar planilha (.xlsx)</label>${XLSX_INPUT("xl-home")}</section>`;
}
function homeView(){
  const d = S.data, total = (S.prs.S||0) + (S.prs.B||0) + (S.prs.D||0);
  const prTiles = ["S","B","D"].map(l => S.editPR === l
    ? `<div class="pr px hot"><span class="lift">${SHORT[l]}</span><input id="pr-${l}" type="number" inputmode="decimal" step="2.5" value="${S.prs[l]}" aria-label="PR de ${LIFTS[l]}" onkeydown="if(event.key==='Enter')savePR('${l}')" onblur="savePR('${l}')"></div>`
    : `<button class="pr px" onclick="editPR('${l}')" aria-label="Editar PR de ${LIFTS[l]}"><span class="lift">${SHORT[l]}</span><span class="v num">${fmt(S.prs[l])}<small>kg</small></span></button>`).join("");
  const sess = d.sessions.map(s => {
    const tops = s.exercises.filter(e => e.kind === "top").map(e => `<span>${esc(LIFTS[e.lift]||e.name)} ${e.sets}×${repsLabel(e.reps)} <b>${fmt(planned(s, s.exercises.indexOf(e)).kg)}</b></span>`).join("");
    const nSets = s.exercises.reduce((t,e)=>t+e.sets,0);
    return `<div class="sess px${sessDoneThisWeek(s) ? " ok" : ""}"><div style="min-width:0">
      <h2>${esc(s.name)} ${s.focus ? `<span class="focus">${esc(s.focus)}</span>` : ""} ${sessDoneThisWeek(s) ? `<span class="done-chip">FEITO</span>` : ""}</h2>
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
  <header class="top"><div class="logo">${LOGO}GTM</div>
    <button class="btn iconbtn" onclick="openSettings()" aria-label="Ajustes">${ICON_GEAR}</button></header>
  <div class="week"><div class="eyebrow">${esc(d.athlete || "Atleta")} · powerlifting</div><h1>${weekTitle(d.week)}</h1>
    <div class="src">Planilha: aba “${esc(d.sheet)}”</div>${syncLine()}</div>
  ${!connected() && isSample() ? importCard() : ""}
  <section><div class="eyebrow">PRs · total ${fmt(total)} kg</div><div class="prs">${prTiles}</div>
    <div class="prnote" style="margin-top:6px"><span>Toque para editar. As cargas de top set recalculam na hora.</span></div></section>
  ${!connected() && !isSample() ? importCard() : ""}
  ${resume}
  ${pendingVideos()}
  <section><div class="eyebrow">Treinos da semana</div><div class="sessions">${sess}</div></section>
  ${hist.length ? `<section><div class="eyebrow">Últimos registros</div><div class="hist px">${hist.map(h=>`<div>${h.html}</div>`).join("")}</div></section>` : ""}
  `;
}

function confirmHTML(){
  const c = S.run && S.run.confirm; if (!c) return "";
  const ex = sessById(S.run.sid).exercises[c.ei];
  const head = `<div><div class="eyebrow">Fim do exercício</div><h3>${esc(ex.name)} · ${ex.sets}×${esc(repsLabel(ex.reps))}</h3></div>`;
  if (c.stage === "ask") return `<div class="confirm px hot">${head}
    <div>Fez com a carga da planilha, <b class="num" style="font-size:28px">${fmt(c.planned)} kg</b>?</div>
    <div class="acts"><button class="btn primary" onclick="confirmYes()">Sim, ${fmt(c.planned)} kg</button><button class="btn" onclick="confirmEdit()">Usei outra carga</button></div></div>`;
  if (c.stage === "edit") return `<div class="confirm px hot">${head}
    <div>${c.planned==null ? "Qual carga você usou?" : "Qual carga você usou de fato?"}</div>
    <div class="stepper"><button onclick="confirmStep(-2.5)" aria-label="Menos 2,5 kg">−</button><input id="actual" type="number" inputmode="decimal" step="0.5" value="${c.actual ?? ""}" aria-label="Carga usada em kg"><button onclick="confirmStep(2.5)" aria-label="Mais 2,5 kg">+</button><span class="muted">kg</span></div>
    <div class="acts"><button class="btn primary" onclick="confirmSave()">Salvar</button><button class="btn ghost" onclick="confirmSkip()">Pular</button></div></div>`;
  if (c.stage === "pr") return `<div class="confirm px hot">${head}
    <div>${fmt(c.actual)} kg em ${Math.round(c.pct*100)}% indica um PR de ${LIFTS[c.lift].toLowerCase()} de <b class="num ${c.implied>S.prs[c.lift]?'up':'down'}" style="font-size:22px">${fmt(c.implied)} kg</b> (hoje: ${fmt(S.prs[c.lift])} kg).</div>
    <div class="acts"><button class="btn primary" onclick="prAccept()">Atualizar PR para ${fmt(c.implied)}</button><button class="btn" onclick="prKeep()">Manter ${fmt(S.prs[c.lift])}</button></div></div>`;
  return "";
}

function demoURL(name){
  const base = name.replace(/aquecimento|\d+º|top set\s*\d?|competi?t?t?ivo/gi, "").replace(/\s+/g," ").trim() || name;
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(base + " técnica powerlifting");
}

// anel feito de quadradinhos (timer de descanso e contador de reps)
function ringSVG(n, size){
  let s = "";
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, x = 50 + Math.sin(a) * 44, y = 50 - Math.cos(a) * 44;
    s += `<rect x="${(x - size/2).toFixed(1)}" y="${(y - size/2).toFixed(1)}" width="${size}" height="${size}" transform="rotate(${(k/n*360).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" class="on"/>`;
  }
  return `<svg viewBox="0 0 100 100" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}
const clock = ms => { const s = Math.max(0, Math.floor(ms/1000)), h = Math.floor(s/3600), m = Math.floor(s%3600/60); return (h ? h + ":" + String(m).padStart(2,"0") : m) + ":" + String(s%60).padStart(2,"0"); };

function playView(){
  const r = S.run, sess = sessById(r.sid), total = r.steps.length, pct = Math.round(Math.min(r.i, total) / total * 100);
  const hud = `<div class="hud"><button class="btn iconbtn" onclick="goHome()" aria-label="Sair do treino">${ICON_X}</button>
    <span class="chip" title="Tempo de treino">${ICON_CLOCK}<span id="elapsed">${clock(Date.now() - (r.started || Date.now()))}</span></span><span class="grow"></span>
    <span class="chip hot">${Math.min(r.i+(r.phase==="work"?1:0), total)}/${total}</span></div>
    <div class="prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;

  if (r.phase === "done") {
    const rows = r.results.map(e => `<div><span>${esc(e.ex)}<br><span class="muted" style="font-size:12px">${e.sets}×${esc(repsLabel(e.reps))}</span></span><span class="num" style="font-size:20px">${fmt(e.actual)} kg</span></div>`).join("");
    return `${hud}${confirmHTML()}${videoCard(r.videoId)}<div class="stage px"><div class="cap"><span class="tagcur">${esc(sess.name)}</span><div class="exname" style="font-size:48px">Treino concluído</div><div class="underline"></div>
      <div class="setline"><span class="chip">${ICON_CLOCK}${clock(Date.now() - (r.started || Date.now()))}</span><span class="chip">${total} séries</span></div></div></div>
      ${rows ? `<div class="summary px">${rows}</div>` : ""}
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
    return `${hud}<div class="rest">
      <div class="ring" id="ring">${ringSVG(36, 7)}
        <div class="t"><div><span class="num" id="rt">${mmss(r.restTotal)}</span><small id="rl">descanso</small></div></div></div>
      <div class="restbtns"><button class="btn" onclick="addRest(30)">+30 s</button><button class="btn primary" onclick="endRest()">Começar série</button></div>
      <div class="eyebrow">Pausa da planilha: ${restLabel(sess.exercises[prev.ei])}</div>
    </div>
    ${confirmHTML()}
    ${videoCard(r.videoId)}
    <div class="next px"><div class="eyebrow" style="color:var(--accent)">${exChange ? "Próximo exercício · monte a barra" : "Próxima série"}</div>
      <div class="row"><div style="min-width:0"><div style="font-weight:600">${esc(nex.name)}</div><div class="muted" style="font-size:13px">Série ${nst.set} de ${nex.sets} · ${esc(repsLabel(nex.reps))} reps</div></div>
      ${np.kg != null ? `<div style="text-align:right;white-space:nowrap"><span class="kg">${fmt(np.kg)}</span><span class="muted"> kg</span></div>` : ""}</div>
      ${delta}${np.kg != null && nex.kind !== "accessory" ? plateHTML(np.kg, true) : ""}</div>`;
  }

  const {st, ex} = curEx(), p = loadFor(sess, st.ei);
  const kindLabel = {warmup:"Aquecimento", top:"Top set", accessory:"Acessório", mobility:"Mobilidade"}[ex.kind];
  const timeReps = isTimeReps(ex.reps);
  const spec = PixelMoves.specFor(ex);
  const showPlates = p.kg != null && (ex.kind === "top" || ex.kind === "warmup" || /barra/i.test(ex.name));
  const loadBlock = p.kg != null
    ? `<div class="loadrow px"><div class="head"><span class="eyebrow">Carga</span><span class="kg">${fmt(p.kg)}<small>kg</small></span></div>
       <div class="loadsrc">${esc(p.src)}</div>${showPlates ? plateHTML(p.kg) : ""}</div>`
    : ex.kind === "mobility" ? "" : `<div class="loadrow px"><div class="head"><span class="eyebrow">Carga</span><span class="kg" style="font-size:24px">livre</span></div><div class="loadsrc">${esc(p.src && p.src !== "carga livre" ? p.src + " · " : "")}você informa no fim do exercício.</div></div>`;
  const repsTxt = timeReps ? (r.workEnd ? mmss((r.workEnd-Date.now())/1000) : parseInt(ex.reps) + "s") : repsLabel(ex.reps);
  const repsLbl = timeReps ? (r.workEnd ? "tempo" : "iniciar") : "reps";
  const repsAttrs = timeReps && !r.workEnd ? `onclick="startWorkTimer(${parseInt(ex.reps)})" role="button" tabindex="0" aria-label="Iniciar ${parseInt(ex.reps)} segundos"` : "";
  return `${hud}
    <div class="stage px">${spec ? `<canvas id="fig" width="112" height="64" role="button" tabindex="0" aria-label="Animação: ${esc(ex.name)}. Toque para pausar ou retomar." onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"></canvas>` : ""}
      <div class="cap"><span class="tagcur ${ex.kind}">${kindLabel}</span>
        <div class="exname">${esc(ex.name)}</div><div class="underline"></div>
        ${spec ? `<div class="phases">${spec.phases.filter(p=>p.label).map(p=>`<span data-i="${spec.phases.indexOf(p)}">${esc(p.label)}</span>`).join("")}</div>` : ""}
        <div class="setline"><span class="chip">Série ${st.set} de ${ex.sets}</span><span class="chip">Pausa ${restLabel(ex)}</span></div></div></div>
    ${ex.note ? `<div class="tip px"><div class="eyebrow">Dica do treinador</div><p>${esc(ex.note)}</p></div>` : ""}
    ${loadBlock}
    ${spec ? "" : `<a class="demo" href="${demoURL(ex.name)}" target="_blank" rel="noopener">Ver demonstração do movimento ↗</a>`}
    <div class="dock">${videoEligible(ex, st) ? `<label class="btn rec" for="cam"><span class="dot" aria-hidden="true"></span>Filmar a última série</label><input id="cam" type="file" accept="video/*" capture="environment" hidden onchange="onVideo(this.files[0])">` : ""}
      <div class="controls">
        <button class="ctl" onclick="stepNav(-1)"><span class="sq">${ICON_BACK}</span>Anterior</button>
        <div class="reps${timeReps ? " time" : ""}" ${repsAttrs}>${ringSVG(28, 6)}<div><div class="n${String(repsTxt).length > 4 ? " small" : ""}" id="wt">${esc(repsTxt)}</div><span class="l">${repsLbl}</span></div></div>
        <button class="ctl" onclick="finishSet()"><span class="sq go">${ICON_CHECK}</span>Feito</button>
      </div>
      <div class="navs"><span></span><button onclick="stepNav(1)">Pular série ›</button></div></div>`;
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
function goHome(){ if (window.__gtmUpdate) { location.reload(); return; } S.view = "home"; render(); window.scrollTo(0, 0); }
function closeRun(){ cancelRestPush(); S.run = null; save("run", null); if (window.__gtmUpdate) { location.reload(); return; } S.view = "home"; render(); }

let toastT;
function toast(msg){ let t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role","status"); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

function loadSheetJS(){
  return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
}
const isSample = () => S.data.sheet === "EXEMPLO";
async function importXlsx(file){
  if (!file) return;
  try {
    toast("Lendo planilha…");
    await loadSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), {cellFormula:true});
    const name = wb.SheetNames[0];
    const data = TreinoParser.parseSheet(wb.Sheets[name], name);
    if (!data.sessions.length) { toast("Não achei treinos na primeira aba"); return; }
    // Mesma regra do Apps Script: o PR da planilha vale quando muda em relação à última importação;
    // se o treinador repetiu o número, continua valendo o ajuste feito no app.
    const lastSheet = isSample() ? null : load("sheetPrs", null), kept = [];
    for (const l of ["S","B","D"]) {
      const sheetKg = Number(data.prs[l]) || 0;
      if (lastSheet && Number(lastSheet[l]) === sheetKg && S.prs[l] !== sheetKg) { kept.push(LIFTS[l].toLowerCase()); continue; }
      if (S.prs[l] !== sheetKg && !isSample()) S.prHist.unshift({id: uid(), ts: Date.now(), lift: l, from: S.prs[l], to: sheetKg, why: "planilha importada"});
      S.prs[l] = sheetKg;
    }
    save("sheetPrs", data.prs); save("prHist", S.prHist);
    S.data = data; save("data", data); save("prs", S.prs); save("importedAt", Date.now());
    S.view = "home"; render(); window.scrollTo(0, 0);
    toast(`Importado: ${data.week}` + (kept.length ? ` · mantive seu PR ajustado de ${kept.join(", ")}` : ""));
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
  if (!connected()) { const at = load("importedAt", null); txt = isSample() ? "" : "Planilha importada do celular" + (at ? " · " + new Date(at).toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : ""); }
  else if (S.sync.state === "busy") txt = "Sincronizando…";
  else if (S.sync.state === "error") { txt = S.queue.length ? `${S.queue.length} registro(s) guardado(s) no celular, envio quando houver conexão.` : "Sem conexão com a planilha agora."; cls = "down"; }
  else txt = (S.queue.length ? `${S.queue.length} registro(s) para enviar · ` : "") + (S.sync.last ? "Sincronizado " + new Date(S.sync.last).toLocaleString("pt-BR", {weekday:"short", hour:"2-digit", minute:"2-digit"}) : "Conectado");
  return `<div class="syncline ${cls}" id="syncline">${esc(txt)}</div>`;
}
function refreshSync(){ const el = document.getElementById("syncline"); if (el) el.outerHTML = syncLine(); }
window.addEventListener("online", () => flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flush(); });
setInterval(() => { if (S.queue.length) flush(); }, 60000);

/* ---------- Notificações no celular (ntfy) ---------- */
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
  await fetch(`${NTFY}${encodeURIComponent(S.settings.ntfy)}?t=${encodeURIComponent("GTM")}&p=4`, {method: "POST", body: "Teste: os avisos de descanso vão chegar assim."}).catch(() => {});
  toast("Notificação de teste enviada");
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
  S.settings.ntfyOn = on; save("settings", S.settings); render();
}
function setScreenOn(on){ S.settings.screenOn = on; save("settings", S.settings); if (!on) releaseAwake(); render(); }
function copyTopic(){
  const v = S.settings.ntfy;
  navigator.clipboard && navigator.clipboard.writeText(v).then(() => toast("Tópico copiado"), () => selectTopic());
  if (!navigator.clipboard) selectTopic();
}
function selectTopic(){ const el = document.getElementById("topic"); if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }

function settingsView(){
  const plateChips = PLATE_DEFS.map(p => `<button class="chip" aria-pressed="${S.settings.plates.includes(p.kg)}" onclick="togglePlate(${p.kg})">${fmt(p.kg)}</button>`).join("");
  return `
  <div class="hud"><button class="btn iconbtn" onclick="goHome()" aria-label="Voltar">${ICON_X}</button><h1 class="exname grow">Ajustes</h1></div>
  <section class="card px"><div class="eyebrow">Planilha do treinador</div>
    <p class="help">Opcional. Conectando ao Apps Script, a semana nova chega sozinha e PRs e histórico ficam guardados numa planilha sua. Cole o endereço (termina em <code>/exec</code>) e o token que o <code>setup()</code> mostrou no log.</p>
    <label class="lbl" for="api">Endereço do Apps Script</label><input class="inp" id="api" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.settings.api)}">
    <label class="lbl" for="token">Token</label><input class="inp" id="token" type="password" autocomplete="off" value="${esc(S.settings.token)}">
    <div class="acts"><button class="btn primary" onclick="saveConn()">Salvar e conectar</button>${connected() ? `<button class="btn" onclick="importNow()">Buscar planilha agora</button>` : ""}</div>
    ${syncLine()}
  </section>
  <section class="card px"><div class="eyebrow">Avisos no celular</div>
    <p class="help">Com o app aberto, o próprio timer apita no fim do descanso. Para ser avisado com o iPhone bloqueado ou em outro app, o fim do descanso chega como notificação pelo app <b>ntfy</b>.</p>
    <div class="field"><label for="push">Avisar fim do descanso</label><input id="push" type="checkbox" ${S.settings.ntfyOn ? "checked" : ""} onchange="setPush(this.checked)"></div>
    ${S.settings.ntfyOn ? `<ol class="steps">
      <li>Instale o app <b>ntfy</b> no iPhone (App Store).</li>
      <li>Toque em <b>+</b> e assine este tópico: <code id="topic">${esc(S.settings.ntfy)}</code> <button class="btn ghost" onclick="copyTopic()">Copiar</button></li>
      <li>Permita as notificações do ntfy.</li>
    </ol>
    <p class="help">O tópico funciona como senha: quem souber o nome vê os avisos. Não compartilhe.</p>
    <div class="acts"><button class="btn" onclick="testPush()">Enviar teste</button></div>` : ""}
  </section>
  <section class="card px"><div class="eyebrow">Tela</div>
    <div class="field"><label for="screen">Manter a tela acesa no treino</label><input id="screen" type="checkbox" ${S.settings.screenOn !== false ? "checked" : ""} onchange="setScreenOn(this.checked)"></div>
    <p class="help">Desligue para economizar bateria. Com a tela apagada, o aviso de descanso chega pelo ntfy.</p>
  </section>
  <section class="card px"><div class="eyebrow">Barra e anilhas da sua academia</div>
    <div class="field"><label for="bar">Barra</label><select id="bar" onchange="setSetting('bar',+this.value)">${[20,15,25].map(v=>`<option value="${v}" ${S.settings.bar===v?"selected":""}>${v} kg</option>`).join("")}</select></div>
    <div class="field"><label for="collar">Presilhas (cada)</label><select id="collar" onchange="setSetting('collar',+this.value)">${[0,2.5].map(v=>`<option value="${v}" ${S.settings.collar===v?"selected":""}>${v?fmt(v)+" kg (competição)":"sem peso"}</option>`).join("")}</select></div>
    <div class="field" style="flex-direction:column;align-items:flex-start"><span>Anilhas disponíveis (kg)</span><div class="chips">${plateChips}</div></div>
  </section>
  <section class="card px"><div class="eyebrow">Importar planilha (.xlsx)</div>
    <p class="help">Para usar sem conectar ao Apps Script, ou quando a conexão falhar. Exporte a planilha do treinador como .xlsx (a semana atual na primeira aba) e importe aqui. Sem conexão, tudo fica salvo só neste celular.</p>
    <label class="btn" for="xl" style="cursor:pointer;align-self:flex-start">Importar planilha (.xlsx)</label>${XLSX_INPUT("xl")}
  </section>`;
}

/* ---------- Vídeo da última série do top set ---------- */
// Usa a câmera nativa do iPhone (input com capture). A câmera aberta por um site não grava no app Fotos,
// então o vídeo fica no IndexedDB do app até ser salvo pela folha de compartilhar ("Salvar Vídeo").
const VIDS = new Map(); // id -> {meta, blob, url}
const videoEligible = (ex, st) => ex.kind === "top" && ["S","B","D"].includes(ex.lift) && st.set === ex.sets;
function idb(){
  return new Promise((res, rej) => {
    const rq = indexedDB.open("gtm", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("videos", {keyPath: "id"});
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbDo(mode, fn){
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction("videos", mode), st = tx.objectStore("videos"); const out = fn(st); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error); });
}
async function loadVideos(){
  try {
    const all = await idbDo("readonly", st => st.getAll());
    const weekAgo = Date.now() - 7*864e5;
    for (const v of all || []) {
      if (v.sent && v.sent < weekAgo) { idbDo("readwrite", st => st.delete(v.id)); continue; }
      if (!VIDS.has(v.id)) VIDS.set(v.id, {meta: v, blob: v.blob, url: URL.createObjectURL(v.blob)});
    }
    if (S.view !== "play") render(); else refreshVideo();
  } catch(e) {}
}
function videoMeta(ex, kg){
  const d = new Date(), day = d.toLocaleDateString("pt-BR", {day:"2-digit", month:"2-digit"});
  const reps = `${ex.sets}×${repsLabel(ex.reps)}`;
  const text = `${ex.name} · ${reps}${kg != null ? " · " + fmt(kg) + " kg" : ""} · ${S.data.week} · ${day}`;
  const base = `${LIFTS[ex.lift]} ${kg != null ? fmt(kg).replace(",", "_") + "kg " : ""}${reps} ${day.replace("/", "-")}`.replace(/[^\w ×.-]+/g, "").replace(/\s+/g, " ").trim();
  return {text, base};
}
async function onVideo(file){
  if (!file) return;
  audioOn();
  const {sess, st, ex} = curEx(), kg = loadFor(sess, st.ei).kg, m = videoMeta(ex, kg);
  const ext = /quicktime/.test(file.type) ? "mov" : (file.name.split(".").pop() || "mp4").toLowerCase();
  const meta = {id: uid(), ts: Date.now(), name: `${m.base}.${ext}`, type: file.type || "video/mp4", text: m.text, size: file.size, sheet: S.data.sheet, sent: null};
  VIDS.set(meta.id, {meta, blob: file, url: URL.createObjectURL(file)});
  S.run.videoId = meta.id;
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); await idbDo("readwrite", s => s.put(Object.assign({blob: file}, meta))); }
  catch(e) { toast("O vídeo não foi guardado no celular. Envie antes de fechar o app."); }
  finishSet();
}
async function saveVideo(id){
  const v = VIDS.get(id); if (!v) return;
  const file = new File([v.blob], v.meta.name, {type: v.meta.type});
  if (!(navigator.canShare && navigator.canShare({files: [file]}))) { toast("Abra o vídeo e use Compartilhar → Salvar Vídeo."); window.open(v.url, "_blank"); return; }
  try {
    // só o arquivo: com texto junto, o iPhone esconde a opção "Salvar Vídeo"
    await navigator.share({files: [file]});
    v.meta.sent = Date.now();
    idbDo("readwrite", s => s.put(Object.assign({blob: v.blob}, v.meta))).catch(() => {});
    toast("Pronto. O vídeo está no app Fotos."); S.view === "play" ? refreshVideo() : render();
  } catch(e) { if (e && e.name !== "AbortError") toast("Não consegui abrir o salvamento: " + (e.message || e)); }
}
function discardVideo(id){
  const v = VIDS.get(id); if (!v) return;
  if (!v.meta.confirmDelete) { v.meta.confirmDelete = true; S.view === "play" ? refreshVideo() : render(); return; }
  URL.revokeObjectURL(v.url); VIDS.delete(id); idbDo("readwrite", s => s.delete(id)).catch(() => {});
  if (S.run && S.run.videoId === id) S.run.videoId = null;
  S.view === "play" ? refreshVideo() : render();
}
const mb = n => (n / 1048576).toLocaleString("pt-BR", {maximumFractionDigits: 1}) + " MB";
function videoRow(v){
  const m = v.meta;
  return `<div class="vrow">
    <video src="${v.url}#t=0.1" playsinline muted preload="metadata" controls></video>
    <div class="vinfo"><div class="vt">${esc(m.text)}</div>${m.sent ? "" : `<div class="muted" style="font-size:12px">Na tela que abrir, toque em <b>Salvar Vídeo</b>.</div>`}<div class="muted" style="font-size:12px">${mb(m.size)}${m.sent ? " · salvo no celular" : ""}</div>
      <div class="acts">${m.sent ? `<button class="btn" onclick="saveVideo('${m.id}')">Salvar de novo</button>` : `<button class="btn primary" onclick="saveVideo('${m.id}')">Salvar no celular</button>`}
      <button class="btn ghost" onclick="discardVideo('${m.id}')">${m.confirmDelete ? "Apagar mesmo?" : "Apagar"}</button></div></div></div>`;
}
function videoCard(id){
  const v = id && VIDS.get(id);
  return `<div id="vcard">${v ? `<div class="confirm px hot vcard"><div class="eyebrow">Vídeo da última série</div>${videoRow(v)}</div>` : ""}</div>`;
}
function refreshVideo(){ const el = document.getElementById("vcard"); if (el && S.run) el.outerHTML = videoCard(S.run.videoId); }
function pendingVideos(){
  const list = [...VIDS.values()].filter(v => !v.meta.sent && (!S.run || S.run.videoId !== v.meta.id || S.view !== "play")).sort((a,b) => b.meta.ts - a.meta.ts);
  if (!list.length) return "";
  return `<section><div class="eyebrow">Vídeos para salvar no celular</div><div class="card px">${list.map(videoRow).join("")}</div></section>`;
}

/* ---------- Início ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", {updateViaCache: "none"}).then(reg => reg.update()).catch(() => {});
  // versão nova instalada: recarrega uma vez para aplicar, se não estiver no meio de uma série
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    if (S.view === "play" && S.run && S.run.phase !== "done") { window.__gtmUpdate = true; toast("Versão nova do app pronta. Ela entra quando você voltar à tela inicial."); return; }
    location.reload();
  });
}
render();
if (connected()) flush();
loadVideos();
