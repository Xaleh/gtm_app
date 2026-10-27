/**
 * GTM — backend no Google Apps Script.
 *
 * - Lê a planilha do treinador (aba mais recente = primeira aba) todo dia às 6h,
 *   e só grava quando a aba muda. Na prática pega a semana nova na segunda de manhã
 *   e também cobre o caso de a planilha chegar atrasada.
 * - Guarda PRs, cargas e histórico numa planilha sua ("GTM — Dados").
 * - Expõe um endpoint (Web App) que o PWA consulta, protegido por um token.
 *
 * Propriedades do script (Configurações do projeto → Propriedades do script):
 *   COACH_SHEET_ID  ID da planilha do treinador (obrigatório)
 *   TOKEN           gerado pelo setup()
 *   DATA_SHEET_ID   criado pelo setup()
 */

const LIFTS = ["S", "B", "D"];
const TABS = {
  week: ["Semana", ["json", "aba", "importado_em"]],
  prs: ["PRs", ["levantamento", "kg", "kg_planilha", "atualizado_em", "origem"]],
  log: ["Historico", ["id", "data", "semana", "aba", "treino", "exercicio", "series", "reps", "planejado_kg", "real_kg"]],
  prHist: ["PR_Historico", ["id", "data", "levantamento", "de", "para", "motivo"]],
  loads: ["Cargas", ["exercicio", "ultima_carga_kg", "atualizado_em"]],
};

/* ------------------------------------------------------------------ setup */

/** Rode uma vez pelo editor. Cria a planilha de dados, o token e o gatilho diário. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("COACH_SHEET_ID")) throw new Error("Defina COACH_SHEET_ID nas propriedades do script antes de rodar o setup.");
  if (!props.getProperty("TOKEN")) props.setProperty("TOKEN", Utilities.getUuid().replace(/-/g, ""));
  if (!props.getProperty("DATA_SHEET_ID")) {
    const ss = SpreadsheetApp.create("GTM — Dados");
    props.setProperty("DATA_SHEET_ID", ss.getId());
  }
  ensureTabs_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "importWeek").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("importWeek").timeBased().everyDays(1).atHour(6).inTimezone("America/Sao_Paulo").create();
  const res = importWeek();
  Logger.log("Planilha de dados: " + dataSS_().getUrl());
  Logger.log("TOKEN (cole no app, em Ajustes): " + props.getProperty("TOKEN"));
  Logger.log("Semana importada: " + (res.week ? res.week.week + " (aba " + res.week.sheet + ")" : "nenhuma"));
}

/* -------------------------------------------------------------- importação */

/** Lê a primeira aba da planilha do treinador. Chamado pelo gatilho e pelo botão do app. */
function importWeek(force) {
  const props = PropertiesService.getScriptProperties();
  const coach = SpreadsheetApp.openById(props.getProperty("COACH_SHEET_ID"));
  const sh = coach.getSheets()[0];
  const name = sh.getName();
  const cur = readWeek_();
  if (cur && cur.sheet === name && force !== true) return { changed: false, week: cur };

  const lastRow = Math.max(sh.getLastRow(), 20), lastCol = Math.max(sh.getLastColumn(), 20);
  const range = sh.getRange(1, 1, lastRow, lastCol);
  const ws = TreinoParser.fromGrid(range.getValues(), range.getFormulas());
  const week = TreinoParser.parseSheet(ws, name);
  if (!week.sessions.length) throw new Error("Não encontrei treinos na aba " + name);

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const t = tab_("week");
    t.getRange(2, 1, 1, 3).setValues([[JSON.stringify(week), name, new Date()]]);
    mergeSheetPRs_(week.prs);
  } finally { lock.releaseLock(); }
  return { changed: true, week };
}

/**
 * O PR muda por dois caminhos: o treinador altera na planilha, ou você ajusta no app.
 * Guardamos o último valor visto na planilha; só quando ele muda o valor do treinador prevalece.
 */
function mergeSheetPRs_(sheetPRs) {
  const t = tab_("prs"), rows = rowsOf_(t), now = new Date();
  LIFTS.forEach(l => {
    const sheetKg = Number(sheetPRs[l]) || 0;
    const r = rows.find(x => x.levantamento === l);
    if (!r) { t.appendRow([l, sheetKg, sheetKg, now, "planilha"]); return; }
    if (Number(r.kg_planilha) !== sheetKg) {
      const from = Number(r.kg);
      t.getRange(r._row, 2, 1, 4).setValues([[sheetKg, sheetKg, now, "planilha"]]);
      if (from !== sheetKg) tab_("prHist").appendRow([Utilities.getUuid(), now, l, from, sheetKg, "atualizado pelo treinador na planilha"]);
    }
  });
}

/* ------------------------------------------------------------------- API */

function doGet(e) {
  return guard_(e, () => {
    const action = (e.parameter.action || "state");
    if (action === "state") return state_();
    if (action === "ping") return { ok: true };
    throw new Error("Ação desconhecida: " + action);
  });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (err) { return json_({ error: "Corpo inválido" }); }
  return guard_({ parameter: { token: body.token } }, () => {
    if (body.action === "events") { applyEvents_(body.events || []); return state_(); }
    if (body.action === "import") { const r = importWeek(true); return Object.assign(state_(), { imported: r.changed !== false }); }
    throw new Error("Ação desconhecida: " + body.action);
  });
}

function guard_(e, fn) {
  const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!token || !e.parameter || e.parameter.token !== token) return json_({ error: "Token inválido" });
  try { return json_(fn()); } catch (err) { return json_({ error: String(err && err.message || err) }); }
}
const json_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

function state_() {
  const prs = {}; rowsOf_(tab_("prs")).forEach(r => prs[r.levantamento] = Number(r.kg));
  const lastLoads = {}; rowsOf_(tab_("loads")).forEach(r => lastLoads[r.exercicio] = Number(r.ultima_carga_kg));
  const log = rowsOf_(tab_("log")).slice(-60).reverse().map(r => ({
    id: r.id, ts: new Date(r.data).getTime(), week: r.semana, sheet: r.aba, session: r.treino, ex: r.exercicio,
    sets: Number(r.series), reps: r.reps, planned: r.planejado_kg === "" ? null : Number(r.planejado_kg), actual: Number(r.real_kg),
  }));
  const prHist = rowsOf_(tab_("prHist")).slice(-20).reverse().map(r => ({
    id: r.id, ts: new Date(r.data).getTime(), lift: r.levantamento, from: Number(r.de), to: Number(r.para), why: r.motivo,
  }));
  return { week: readWeek_(), prs, lastLoads, log, prHist, serverTime: Date.now() };
}

/** Eventos do app: { id, type: "log" | "pr" | "load", ... }. Ids repetidos são ignorados (reenvio offline). */
function applyEvents_(events) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const logT = tab_("log"), prT = tab_("prs"), phT = tab_("prHist"), ldT = tab_("loads");
    const seen = new Set(rowsOf_(logT).map(r => r.id).concat(rowsOf_(phT).map(r => r.id)));
    const loads = rowsOf_(ldT), prs = rowsOf_(prT);
    events.forEach(ev => {
      if (!ev || !ev.id || seen.has(ev.id)) return;
      seen.add(ev.id);
      const when = new Date(ev.ts || Date.now());
      if (ev.type === "log") {
        logT.appendRow([ev.id, when, ev.week || "", ev.sheet || "", ev.session || "", ev.ex || "", ev.sets || "", String(ev.reps ?? ""), ev.planned ?? "", ev.actual]);
      } else if (ev.type === "pr" && LIFTS.indexOf(ev.lift) >= 0) {
        const r = prs.find(x => x.levantamento === ev.lift);
        if (r) prT.getRange(r._row, 2).setValue(ev.to), prT.getRange(r._row, 4, 1, 2).setValues([[when, "app"]]);
        else prT.appendRow([ev.lift, ev.to, "", when, "app"]);
        phT.appendRow([ev.id, when, ev.lift, ev.from, ev.to, ev.why || "ajuste no app"]);
      } else if (ev.type === "load" && ev.ex) {
        const r = loads.find(x => x.exercicio === ev.ex);
        if (r) ldT.getRange(r._row, 2, 1, 2).setValues([[ev.kg, when]]);
        else { ldT.appendRow([ev.ex, ev.kg, when]); loads.push({ exercicio: ev.ex, _row: ldT.getLastRow() }); }
      }
    });
  } finally { lock.releaseLock(); }
}

/* --------------------------------------------------------------- planilha */

function dataSS_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("DATA_SHEET_ID")); }
function ensureTabs_() {
  const ss = dataSS_();
  Object.keys(TABS).forEach(k => {
    const [name, head] = TABS[k];
    let t = ss.getSheetByName(name);
    if (!t) t = ss.insertSheet(name);
    if (t.getLastRow() === 0) t.appendRow(head), t.setFrozenRows(1);
  });
  const blank = ss.getSheetByName("Sheet1") || ss.getSheetByName("Página1");
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
}
function tab_(key) {
  const t = dataSS_().getSheetByName(TABS[key][0]);
  if (!t) { ensureTabs_(); return dataSS_().getSheetByName(TABS[key][0]); }
  return t;
}
function rowsOf_(t) {
  const n = t.getLastRow();
  if (n < 2) return [];
  const vals = t.getRange(1, 1, n, t.getLastColumn()).getValues(), head = vals[0];
  return vals.slice(1).map((row, i) => { const o = { _row: i + 2 }; head.forEach((h, j) => o[h] = row[j]); return o; });
}
function readWeek_() {
  const t = tab_("week");
  if (t.getLastRow() < 2) return null;
  const raw = t.getRange(2, 1).getValue();
  return raw ? JSON.parse(raw) : null;
}
