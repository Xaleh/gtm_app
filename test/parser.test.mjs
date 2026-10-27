import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import { coachTab } from "./fixture.mjs";

const require = createRequire(import.meta.url);
const P = require("../web/parser.js");
require("../web/pixel.js");
const PixelMoves = globalThis.PixelMoves;

const parseTab = tab => P.parseSheet(P.fromGrid(tab.values, tab.formulas), tab.name);

test("lê PRs, arredondamento e sessões", () => {
  const w = parseTab(coachTab("2610 SEMANA 20"));
  assert.deepEqual(w.prs, { S: 200, B: 100, D: 230 });
  assert.equal(w.rounding, 5);
  assert.equal(w.athlete, "ATLETA TESTE");
  assert.deepEqual(w.sessions.map(s => s.name), ["Mobilidade", "Treino 1", "Treino 2", "Treino 3", "Treino 5"]);
  assert.equal(w.sessions[1].focus, "SBD - SQUAT/BENCH/DEADLIFT");
});

test("top set guarda o % e o levantamento da fórmula MROUND", () => {
  const w = parseTab(coachTab("x"));
  const top = w.sessions[1].exercises.find(e => e.kind === "top");
  assert.deepEqual(top.load, { type: "pct", lift: "S", pct: 0.75, sheetKg: 150 });
  assert.equal(top.rest, 240);
  assert.equal(top.note, "Pausa de 2 segundos no fundo");
  const bench = w.sessions[2].exercises.find(e => e.kind === "top");
  assert.deepEqual([bench.load.lift, bench.load.pct, bench.rest, bench.restMax], ["B", 0.8, 180, 240]);
});

test("barra, carga fixa, observação na coluna de peso e mobilidade", () => {
  const w = parseTab(coachTab("x"));
  assert.deepEqual(w.sessions[1].exercises[0].load, { type: "bar" });
  assert.deepEqual(w.sessions[3].exercises[0].load, { type: "kg", kg: 63 });
  assert.equal(w.sessions[2].exercises.find(e => /Crucifixo/.test(e.name)).loadNote, "AUMENTA TUDO");
  const plank = w.sessions[0].exercises[0];
  assert.deepEqual([plank.kind, plank.reps, plank.rest], ["mobility", "30S", 30]);
});

test("parseRest", () => {
  assert.deepEqual(P.parseRest("1m"), [60, 60]);
  assert.deepEqual(P.parseRest("30s"), [30, 30]);
  assert.deepEqual(P.parseRest("3/4m"), [180, 240]);
  assert.deepEqual(P.parseRest("2M"), [120, 120]);
  assert.deepEqual(P.parseRest("x"), [null, null]);
});

test("toda linha da planilha tem animação e as variações são reconhecidas", () => {
  const names = ["Abdutor", "Adutor", "Crucifixo maquina ou halter", "Elev. frontal neutra com halter", "Elev. lateral com halter",
    "Elevação pelvica", "Extensora", "Flexora", "Leg press 45", "Puxada frente pegada aberta", "Remada baixa com triangulo",
    "Remada pendlay com barra", "Rosca direta com halter", "Rosca martelo com halter", "Stiff com barra", "Supino inclinado com halter",
    "Triceps frances c/ halter", "Triceps polia barra W", "BIRDDOG", "DEADBUG", "MOBILIDADE DE OMBRO", "MOBILIDADE DE POSTERIOR",
    "MOBILIDADE DE TORNOZELO", "MOBILIDIADE DE POSTERIORcrg.", "PRANCHA ISOMETRICA", "Agachamento aquecimento", "Supino aquecimento",
    "Deadlift aquecimento", "SUPINO TOP SET touchn go", "SUPINO TOP SET 2 paralimpico"];
  for (const n of names) assert.ok(PixelMoves.specFor({ name: n, kind: "accessory" }), n);
  const lbl = n => PixelMoves.specFor({ name: n, kind: "top" }).phases.map(p => p.label).join("|");
  assert.match(lbl("Agachamento 2º TOP SET COM PAUSA de 2s"), /Pausa 2s/);
  assert.match(lbl("SUPINO 2º TOP SET com pausa de 4s"), /Pausa 4s/);
  assert.match(lbl("Agachamento TOP SET 2 c descida lenta 3s"), /Desce em 3s/);
  assert.match(lbl("Deadlift TOP SET 2 c pausa no joelho"), /Pausa no joelho 2s/);
  assert.match(lbl("SUPINO TOP SET touchn go"), /Toca e sobe/);
  assert.ok(PixelMoves.specFor({ name: "SUPINO TOP SET 2 paralimpico", kind: "top" }).para);
});

// Opcional: compara a leitura via SheetJS (.xlsx) com a leitura via Apps Script na sua planilha real.
// XLSX_PATH=/caminho/planilha.xlsx npm test
test("planilha real: SheetJS e Apps Script dão o mesmo resultado", { skip: !process.env.XLSX_PATH }, async () => {
  const XLSX = require("xlsx");
  const { gridFromSheetJS } = await import("./gas-mock.mjs");
  const wb = XLSX.read(fs.readFileSync(process.env.XLSX_PATH), { cellFormula: true });
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const a = P.parseSheet(ws, name), b = parseTab(gridFromSheetJS(XLSX, ws, name));
    assert.deepEqual(b, a, name);
    for (const s of a.sessions) for (const e of s.exercises) assert.ok(PixelMoves.specFor(e), e.name);
  }
});
