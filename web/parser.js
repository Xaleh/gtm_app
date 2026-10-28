// Parser da planilha do treinador (mesmo template das abas "SEMANA N").
// Recebe um worksheet do SheetJS e devolve a semana em JSON. Usado no app e testado em Node.
(function (root) {
  const LIFT_ROW = { 5: "S", 8: "B", 11: "D" };
  const MROUND_RE = /^=?MROUND\(\(?I(\d+)\*([A-Z]+)(\d+)\)?,\s*R6\)/i;

  function cell(ws, addr) { const c = ws[addr]; return c ? c : null; }
  function val(ws, addr) { const c = ws[addr]; return c ? c.v : null; }

  function parseRest(txt) {
    if (txt == null) return [null, null];
    const t = String(txt).trim().toLowerCase().replace(/\s/g, "");
    const m = t.match(/^(\d+)(?:\/(\d+))?(m|min|s)?$/);
    if (!m) return [null, null];
    const mult = m[3] === "s" ? 1 : 60;
    const a = +m[1] * mult;
    return [a, m[2] ? +m[2] * mult : a];
  }
  function kindOf(n) {
    n = n.toLowerCase();
    if (n.includes("aquecimento")) return "warmup";
    if (n.includes("top set")) return "top";
    return "accessory";
  }
  function liftOf(n) {
    n = n.toLowerCase();
    if (n.startsWith("agach")) return "S";
    if (n.startsWith("supino") && !n.includes("inclinado")) return "B";
    if (n.startsWith("deadlift")) return "D";
    return null;
  }
  function maxRow(ws) {
    const ref = ws["!ref"]; if (!ref) return 0;
    const m = ref.split(":")[1].match(/\d+/); return m ? +m[0] : 0;
  }

  function parseSheet(ws, sheetName) {
    const prs = {};
    for (const r in LIFT_ROW) prs[LIFT_ROW[r]] = val(ws, "I" + r);
    const rounding = val(ws, "R6") || 5;
    const sessions = [];
    let cur = null;
    const last = maxRow(ws);
    for (let row = 17; row <= last; row++) {
      const a = val(ws, "A" + row);
      if (typeof a === "string") {
        const s = a.trim(), m = s.match(/^TREINO\s*(\d+)/i);
        if (m) {
          const id = +m[1];
          if (!cur || cur.id !== id) { cur = { id, name: "Treino " + id, exercises: [] }; sessions.push(cur); }
        } else if (/^MOBILIDADE/i.test(s)) {
          cur = { id: 0, name: "Mobilidade", exercises: [] }; sessions.push(cur);
        } else if (cur && cur.id && !cur.focus) {
          cur.focus = s.split("\n")[0];
        }
      }
      const name = val(ws, "B" + row), sets = val(ws, "C" + row);
      if (!cur || typeof name !== "string" || typeof sets !== "number") continue;
      const nm = name.split(/\s+/).join(" ").trim();
      const [rest, restMax] = parseRest(val(ws, "E" + row));
      const reps = val(ws, "D" + row);
      const g = val(ws, "G" + row);
      const ex = {
        name: nm, kind: cur.id ? kindOf(nm) : "mobility", lift: cur.id ? liftOf(nm) : null,
        sets: Math.round(sets), reps: typeof reps === "number" ? reps : String(reps).trim(),
        rest, restMax, note: typeof g === "string" ? g.trim() : null, load: null,
      };
      const fc = cell(ws, "F" + row);
      const fv = fc ? fc.v : null, ff = fc && fc.f ? fc.f : null;
      const m = ff ? ff.match(MROUND_RE) : null;
      if (m) ex.load = { type: "pct", lift: LIFT_ROW[+m[1]], pct: val(ws, m[2] + m[3]), sheetKg: fv };
      else if (typeof fv === "number") ex.load = { type: "kg", kg: fv };
      else if (typeof fv === "string" && fv.trim().toLowerCase() === "barra") ex.load = { type: "bar" };
      else if (typeof fv === "string" && fv.trim()) ex.loadNote = fv.trim();
      cur.exercises.push(ex);
    }
    const glossary = [];
    for (let r = 19; r < 40; r++) { const v = val(ws, "M" + r); if (typeof v === "string") glossary.push(v.trim()); }
    return {
      sheet: sheetName, athlete: val(ws, "B2"), week: val(ws, "B8") || sheetName,
      prs, rounding, sessions: sessions.filter(s => s.exercises.length), glossary,
    };
  }

  // Converte as matrizes do Apps Script (getValues/getFormulas) no formato de worksheet do SheetJS
  function colName(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function fromGrid(values, formulas) {
    const ws = {};
    const rows = values.length, cols = rows ? values[0].length : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = values[r][c], f = formulas && formulas[r] ? formulas[r][c] : "";
      if ((v === "" || v == null) && !f) continue;
      const cell = { v: v === "" ? null : v };
      if (f) cell.f = String(f).replace(/^=/, "");
      ws[colName(c) + (r + 1)] = cell;
    }
    ws["!ref"] = "A1:" + colName(Math.max(0, cols - 1)) + Math.max(1, rows);
    return ws;
  }
  // Resposta da API do Google Sheets (values.get): as linhas vêm sem as células vazias do fim,
  // e o modo FORMULA devolve o valor nas células sem fórmula. Normaliza e reaproveita fromGrid.
  function fromApi(values, formulas) {
    values = values || []; formulas = formulas || [];
    const rows = Math.max(values.length, formulas.length);
    let cols = 20;
    for (const r of values) cols = Math.max(cols, r.length);
    for (const r of formulas) cols = Math.max(cols, r.length);
    const pad = (grid, keep) => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => {
      const v = (grid[i] || [])[j];
      return v == null ? "" : keep(v);
    }));
    return fromGrid(pad(values, v => v), pad(formulas, v => (typeof v === "string" && v.charAt(0) === "=") ? v : ""));
  }
  root.TreinoParser = { parseSheet, parseRest, fromGrid, fromApi };
  if (typeof module !== "undefined") module.exports = root.TreinoParser;
})(typeof window !== "undefined" ? window : globalThis);
