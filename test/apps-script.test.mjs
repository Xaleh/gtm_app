import test from "node:test";
import assert from "node:assert/strict";
import { createGas } from "./gas-mock.mjs";
import { coachTab } from "./fixture.mjs";

function boot(tabs) {
  const g = createGas(tabs || [coachTab("2610 SEMANA 20")]);
  g.call("setup");
  return { ...g, token: g.props.get("TOKEN") };
}

test("setup cria planilha de dados, token, gatilho diário às 6h e importa a semana", () => {
  const g = boot();
  assert.ok(g.token && g.token.length >= 32);
  assert.equal(g.triggers.length, 1);
  assert.deepEqual([g.triggers[0].fn, g.triggers[0].hour, g.triggers[0].days, g.triggers[0].tz], ["importWeek", 6, 1, "America/Sao_Paulo"]);
  const st = g.get({ token: g.token });
  assert.equal(st.week.sheet, "2610 SEMANA 20");
  assert.deepEqual(st.prs, { S: 200, B: 100, D: 230 });
  g.call("setup"); assert.equal(g.triggers.length, 1, "rodar setup de novo não duplica o gatilho");
});

test("token errado é recusado", () => {
  const g = boot();
  assert.equal(g.get({ token: "x" }).error, "Token inválido");
  assert.equal(g.post({ token: "x", action: "events", events: [] }).error, "Token inválido");
});

test("eventos gravam histórico, PR e carga; reenvio não duplica", () => {
  const g = boot();
  const events = [
    { id: "a1", type: "log", ts: 1, week: "SEMANA 20", sheet: "2610 SEMANA 20", session: "Treino 1", ex: "Agachamento", sets: 3, reps: 4, planned: 150, actual: 155 },
    { id: "a2", type: "pr", ts: 2, lift: "S", from: 200, to: 205, why: "155 kg em 75%" },
    { id: "a3", type: "load", ts: 3, ex: "Extensora", kg: 70 },
  ];
  let st = g.post({ token: g.token, action: "events", events });
  st = g.post({ token: g.token, action: "events", events });
  assert.equal(st.log.length, 1);
  assert.equal(st.log[0].actual, 155);
  assert.equal(st.prs.S, 205);
  assert.equal(st.prHist.filter(h => h.lift === "S" && h.to === 205).length, 1);
  assert.equal(st.lastLoads.Extensora, 70);
  g.post({ token: g.token, action: "events", events: [{ id: "a4", type: "load", ts: 4, ex: "Extensora", kg: 75 }] });
  assert.equal(g.get({ token: g.token }).lastLoads.Extensora, 75);
});

test("aba igual não reimporta; aba nova entra; PR do app vale até o treinador mudar a planilha", () => {
  const g = boot();
  g.post({ token: g.token, action: "events", events: [{ id: "p1", type: "pr", lift: "S", from: 200, to: 205 }] });
  assert.equal(g.call("importWeek").changed, false);

  g.coach.sheets.unshift(new g.coach.sheets[0].constructor("0211 SEMANA 21", coachTab("0211 SEMANA 21").values, coachTab("0211 SEMANA 21").formulas));
  assert.equal(g.call("importWeek").changed, true);
  let st = g.get({ token: g.token });
  assert.equal(st.week.sheet, "0211 SEMANA 21");
  assert.equal(st.prs.S, 205, "planilha continua com 200: mantém o PR ajustado no app");

  const t = coachTab("0911 SEMANA 22", { S: 210 });
  g.coach.sheets.unshift(new g.coach.sheets[0].constructor(t.name, t.values, t.formulas));
  g.call("importWeek");
  st = g.get({ token: g.token });
  assert.equal(st.prs.S, 210, "treinador mudou o PR na planilha: vale o dele");
  assert.ok(st.prHist.some(h => h.to === 210 && /treinador/.test(h.why)));
});

test("botão do app força a importação", () => {
  const g = boot();
  const st = g.post({ token: g.token, action: "import" });
  assert.equal(st.week.sheet, "2610 SEMANA 20");
  assert.ok(st.imported);
});
