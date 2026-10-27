// Servidor local: serve o PWA e simula o Apps Script em /mock/exec.
//   npm run dev                      → semana sintética
//   XLSX_PATH=planilha.xlsx npm run dev → usa a primeira aba da sua planilha
// No app, em Ajustes, use http://localhost:8080/mock/exec e o token impresso no terminal.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createGas, gridFromSheetJS } from "../test/gas-mock.mjs";
import { coachTab } from "../test/fixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const PORT = +process.env.PORT || 8080;
const require = createRequire(import.meta.url);

let tabs = [coachTab("0000 SEMANA DEMO")];
if (process.env.XLSX_PATH) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(fs.readFileSync(process.env.XLSX_PATH), { cellFormula: true });
  tabs = wb.SheetNames.slice(0, 3).map(n => gridFromSheetJS(XLSX, wb.Sheets[n], n));
}
const gas = createGas(tabs);
gas.call("setup");
const TOKEN = gas.props.get("TOKEN");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/mock/exec") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      const out = req.method === "POST" ? gas.post(JSON.parse(body || "{}")) : gas.get(Object.fromEntries(url.searchParams));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out));
    });
    return;
  }
  const file = path.join(WEB, path.normalize(url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("não encontrado"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`GTM em http://localhost:${PORT}`);
  console.log(`Apps Script simulado: http://localhost:${PORT}/mock/exec`);
  console.log(`Token: ${TOKEN}`);
});
