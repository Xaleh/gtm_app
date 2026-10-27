// Simula os serviços do Google Apps Script em memória para testar apps-script/*.js no Node.
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  _get(grid) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((grid[this.r - 1 + i] || [])[this.c - 1 + j] ?? ""); out.push(row); } return out; }
  getValues() { return this._get(this.sheet.values); }
  getFormulas() { return this._get(this.sheet.formulas); }
  getValue() { return this.getValues()[0][0]; }
  setValues(rows) { rows.forEach((row, i) => row.forEach((v, j) => this.sheet._set(this.r + i, this.c + j, v))); return this; }
  setValue(v) { this.sheet._set(this.r, this.c, v); return this; }
}
class Sheet {
  constructor(name, values, formulas) { this.name = name; this.values = values || []; this.formulas = formulas || []; }
  getName() { return this.name; }
  _set(r, c, v) { while (this.values.length < r) this.values.push([]); const row = this.values[r - 1]; while (row.length < c) row.push(""); row[c - 1] = v instanceof Date ? v.toISOString() : v; }
  getLastRow() { let n = 0; this.values.forEach((row, i) => { if (row.some(v => v !== "" && v != null)) n = i + 1; }); return n; }
  getLastColumn() { return this.values.reduce((m, row) => Math.max(m, row.length), 0); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this._set(r, j + 1, v)); return this; }
  setFrozenRows() { return this; }
}
class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet("Sheet1")]; }
  getId() { return this.id; } getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

/** Monta o ambiente. `coachGrid` = { name, values, formulas } da primeira aba do treinador. */
export function createGas(coachTabs) {
  const books = new Map();
  const coach = new Spreadsheet("coach", "Treinador");
  coach.sheets = coachTabs.map(t => new Sheet(t.name, t.values, t.formulas));
  books.set("coach", coach);
  const props = new Map([["COACH_SHEET_ID", "coach"]]);
  const triggers = [];
  const logs = [];
  const ctx = {
    console,
    Logger: { log: m => logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    SpreadsheetApp: {
      openById: id => { const b = books.get(id); if (!b) throw new Error("Planilha não encontrada: " + id); return b; },
      create: name => { const id = "data-" + crypto.randomUUID(); const b = new Spreadsheet(id, name); books.set(id, b); return b; },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: fn => { const t = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyDays: d => (t.days = d, b), atHour: h => (t.hour = h, b), inTimezone: z => (t.tz = z, b), create: () => (triggers.push(t), t) }; return b; },
    },
    Date, JSON, Math, Number, String, Object, Array, Set, Error,
  };
  vm.createContext(ctx);
  for (const f of ["Parser.js", "Code.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "apps-script", f), "utf8"), ctx, { filename: f });
  const call = (fn, ...a) => ctx[fn](...a);
  const get = params => JSON.parse(call("doGet", { parameter: params }).getContent());
  const post = body => JSON.parse(call("doPost", { postData: { contents: JSON.stringify(body) } }).getContent());
  return { ctx, call, get, post, props, triggers, logs, books, coach };
}

/** Converte uma aba do SheetJS no par values/formulas que o Apps Script devolve. */
export function gridFromSheetJS(XLSX, ws, name) {
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  const values = [], formulas = [];
  for (let r = 0; r <= ref.e.r; r++) {
    const vr = [], fr = [];
    for (let c = 0; c <= Math.max(ref.e.c, 19); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      vr.push(cell && cell.v != null ? cell.v : ""); fr.push(cell && cell.f ? "=" + cell.f : "");
    }
    values.push(vr); formulas.push(fr);
  }
  return { name, values, formulas };
}
