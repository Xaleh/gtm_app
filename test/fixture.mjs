// Aba sintética no mesmo modelo da planilha do treinador (sem dados reais).
export function coachTab(name, { S = 200, B = 100, D = 230 } = {}) {
  const values = [], formulas = [];
  const set = (addr, v, f) => {
    const m = addr.match(/^([A-Z]+)(\d+)$/), c = m[1].charCodeAt(0) - 65, r = +m[2] - 1;
    while (values.length <= r) { values.push(Array(20).fill("")); formulas.push(Array(20).fill("")); }
    values[r][c] = v; if (f) formulas[r][c] = f;
  };
  set("B2", "ATLETA TESTE"); set("B8", name.replace(/^\d+\s*/, ""));
  set("H5", "S:"); set("I5", S); set("J5", 0.75); set("M5", 0.8);
  set("H8", "B:"); set("I8", B); set("J8", 0.75); set("K8", 0.8);
  set("H11", "D:"); set("I11", D); set("J11", 0.75);
  set("R5", "AJUSTE"); set("R6", 5);
  set("A18", "MOBILIDADE TODO DIA"); set("B18", "EXERCICIO"); set("C18", "SERIES");
  set("B19", "PRANCHA ISOMETRICA"); set("C19", 3); set("D19", "30S"); set("E19", "30s");
  set("M19", "Agachamento comp: COMPETITIVO");
  set("A30", "TREINO 1"); set("B30", "EXERCICIO"); set("C30", "SERIES"); set("D30", "REPETIÇOES"); set("E30", "PAUSA"); set("F30", "PESO");
  set("B32", "Agachamento aquecimento"); set("C32", 1); set("D32", 8); set("E32", "1m"); set("F32", "BARRA");
  set("B33", "Agachamento aquecimento"); set("C33", 1); set("D33", 4); set("E33", "1m");
  set("B34", "Agachamento 2º TOP SET COM PAUSA de 2s"); set("C34", 3); set("D34", 4); set("E34", "4m");
  set("F34", Math.round(S * 0.75 / 5) * 5, "=MROUND((I5*J5),R6)"); set("G34", "Pausa de 2 segundos no fundo");
  set("B36", "Remada pendlay com barra"); set("C36", 3); set("D36", 8); set("E36", "2m");
  set("A40", "SBD - SQUAT/BENCH/DEADLIFT");
  set("A56", "TREINO 2"); set("A57", "TREINO 2");
  set("B59", "Supino aquecimento"); set("C59", 1); set("D59", 8); set("E59", "1m"); set("F59", "barra");
  set("B60", "SUPINO 1º TOP SET 1 competitivo"); set("C60", 4); set("D60", 4); set("E60", "3/4m");
  set("F60", Math.round(B * 0.8 / 5) * 5, "=MROUND((I8*K8),R6)");
  set("A66", "SUPINO\nAUXILIARES"); set("B66", "Crucifixo maquina ou halter"); set("C66", 3); set("D66", 8); set("E66", "2M"); set("F66", "AUMENTA TUDO");
  set("A79", "TREINO 3"); set("B82", "Extensora"); set("C82", 3); set("D82", 8); set("E82", "2m"); set("F82", 63);
  set("A104", "TREINO 4"); set("A105", "TREINO 4");
  set("A129", "TREINO 5");
  set("B133", "Deadlift TOP SET 2 c pausa no joelho"); set("C133", 1); set("D133", 2); set("E133", "4m");
  set("F133", Math.round(D * 0.75 / 5) * 5, "=MROUND((I11*J11),R6)");
  set("B140", ""); // garante linhas até 140
  return { name, values, formulas };
}
