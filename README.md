# GTM

Player de treino de powerlifting alimentado pela planilha semanal do treinador no Google Sheets.

- Lê a planilha do treinador todo dia às 6h e troca de semana quando aparece uma aba nova (na prática, segunda de manhã).
- Calcula as cargas dos top sets pelo PR (a planilha guarda `MROUND(PR × %, 5)`; o app guarda o % e recalcula quando o PR muda).
- Mostra as anilhas por lado, o timer de descanso com alerta e a carga da próxima série para montar a barra.
- Anima em pixel art todos os 25 movimentos que já apareceram na planilha, seguindo a variação (pausa, descida lenta, pausa no joelho, touch'n go, paralímpico).
- No fim de cada exercício confirma a carga usada; se mudou num top set, oferece atualizar o PR.
- Avisa o fim do descanso no iPhone e no Apple Watch pelo app ntfy.
- Funciona offline na academia: os registros ficam no celular e sobem quando a conexão volta.

## Como as peças se encaixam

```
Planilha do treinador ──(leitura, todo dia 6h)──▶ Apps Script (no seu Drive) ──▶ Planilha "GTM — Dados"
                                                     ▲   │                         (PRs, histórico, cargas)
                                         token       │   ▼ JSON
                                                   PWA no GitHub Pages ──▶ ntfy.sh ──▶ iPhone ──▶ Apple Watch
```

| Pasta | O que tem |
|---|---|
| `web/` | O app (PWA estático): `index.html`, `app.js`, `pixel.js` (animações), `parser.js` (leitura da planilha), service worker e ícones |
| `apps-script/` | Backend no Google Apps Script: `Code.js` (gatilho, API, armazenamento) e `Parser.js` (cópia de `web/parser.js`) |
| `test/` | Testes do parser e do Apps Script com os serviços do Google simulados |
| `scripts/dev-server.mjs` | Servidor local com o Apps Script simulado |

O mesmo `parser.js` roda no app (importação manual de .xlsx) e no Apps Script. O CI confere que as duas cópias são iguais; depois de editar `web/parser.js`, rode `npm run sync`.

## Instalação

### 1. Publicar o app no GitHub Pages

1. No repositório, abra **Settings → Pages** e em **Source** escolha **GitHub Actions**.
2. Faça um push na `main`. O workflow `Publicar no GitHub Pages` publica a pasta `web/`.
3. O endereço fica em `https://xaleh.github.io/gtm_app/`.

O GitHub Pages gratuito exige repositório público. Nenhum dado seu fica no repositório: a semana, os PRs e o histórico vêm do Apps Script, protegidos pelo token. A semana que o app mostra antes de conectar é um exemplo anônimo.

### 2. Criar o Apps Script no seu Google Drive

O script roda com a sua conta e lê a planilha do treinador com o mesmo acesso que você já tem.

1. Abra [script.google.com](https://script.google.com) e crie um **Novo projeto** chamado `GTM`.
2. Em **Configurações do projeto**, marque **Mostrar arquivo de manifesto "appsscript.json" no editor**.
3. No editor, crie os arquivos e cole o conteúdo da pasta `apps-script/`:
   - `appsscript.json` ← `apps-script/appsscript.json`
   - `Parser.gs` ← `apps-script/Parser.js`
   - `Code.gs` ← `apps-script/Code.js`

   Ou use o [clasp](https://github.com/google/clasp): copie `apps-script/.clasp.json.example` para `apps-script/.clasp.json`, coloque o ID do script e rode `npm run push:script`.
4. Em **Configurações do projeto → Propriedades do script**, adicione `COACH_SHEET_ID` com o ID da planilha do treinador. O ID é o trecho entre `/d/` e `/edit` no endereço da planilha.
5. No editor, escolha a função `setup` e clique em **Executar**. Autorize o acesso. Como o script é seu e não foi publicado, o Google mostra "app não verificado": clique em **Avançado → Acessar GTM**.
6. Abra o **Registro de execução**. Ele mostra:
   - o endereço da planilha **GTM — Dados** (criada no seu Drive);
   - o **TOKEN**, que você vai colar no app;
   - a semana que foi importada.

O `setup` também cria o gatilho diário das 6h (horário de Brasília). Pode rodar de novo sem duplicar nada.

### 3. Publicar a API

1. No editor, clique em **Implantar → Nova implantação**.
2. Tipo: **App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
3. Clique em **Implantar** e copie o endereço que termina em `/exec`.

"Qualquer pessoa" é necessário para o app chamar a API sem login do Google. Sem o token, a API só responde `Token inválido`.

Ao atualizar o código do script depois, use **Implantar → Gerenciar implantações → Editar → Nova versão**. Assim o endereço `/exec` continua o mesmo.

### 4. Instalar no iPhone

1. Abra o endereço do GitHub Pages no **Safari**.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra o app pela tela de início, vá em **Ajustes**, cole o endereço `/exec` e o token, e toque em **Salvar e conectar**.

### 5. Avisos no Apple Watch

O Safari não deixa um site mandar notificação agendada sozinho, então o app usa o [ntfy](https://ntfy.sh), um serviço gratuito de notificações.

1. Instale o app **ntfy** no iPhone.
2. No GTM, em **Ajustes**, ligue **Avisar fim do descanso**. O app cria um tópico aleatório.
3. No ntfy, toque em **+** e assine esse tópico.
4. Toque em **Enviar teste**. Com o iPhone bloqueado, a notificação aparece e vibra no relógio, se o espelhamento de notificações do ntfy estiver ligado no app Watch.

Como funciona: ao concluir uma série, o app agenda duas mensagens no ntfy, uma a 10 s do fim do descanso e outra no fim, com a próxima carga e as anilhas por lado. Se você começa a série antes, ou volta, as mensagens são canceladas. Se o descanso ganha +30 s, elas são reagendadas. O ntfy aceita atraso mínimo de 10 s, então descansos de até 20 s não recebem o aviso de 10 s.

O tópico funciona como senha: quem souber o nome consegue ler e mandar mensagens nele. Não compartilhe.

## Como o PR é atualizado

O PR pode mudar por dois caminhos, e a planilha de dados guarda os dois:

- **Você no app**: confirmando uma carga diferente num top set (ex.: 165 kg a 80% → PR 205) ou editando o PR na tela inicial.
- **O treinador na planilha**: quando o PR da aba nova é diferente do último que o script viu na planilha, o valor do treinador prevalece.

Se o treinador repete o mesmo PR na semana seguinte, o ajuste que você fez no app continua valendo.

## Desenvolvimento

```bash
npm install
npm test                                  # parser, animações e Apps Script simulado
XLSX_PATH=planilha.xlsx npm test          # também compara as leituras via .xlsx e via Apps Script em todas as abas
npm run dev                               # http://localhost:8080 com Apps Script simulado
XLSX_PATH=planilha.xlsx npm run dev       # o mesmo, com a sua planilha
```

No servidor local, use `http://localhost:8080/mock/exec` e o token impresso no terminal em **Ajustes**.

Arquivos `.xlsx` estão no `.gitignore` para a planilha não ir parar no repositório.

### Adicionar um movimento novo

1. Em `web/pixel.js`, crie a pose em `EX` (a função `draw` recebe `p` entre 0 e 1) e as fases em `phases()`.
2. Inclua a regra do nome em `specFor()`.
3. Acrescente o nome no teste "toda linha da planilha tem animação" em `test/parser.test.mjs`.
