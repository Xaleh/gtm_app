# GTM

Player de treino de powerlifting alimentado pela planilha semanal do treinador no Google Sheets.

- Lê a planilha do treinador todo dia às 6h e troca de semana quando aparece uma aba nova (na prática, segunda de manhã).
- Calcula as cargas dos top sets pelo PR (a planilha guarda `MROUND(PR × %, 5)`; o app guarda o % e recalcula quando o PR muda).
- Mostra as anilhas por lado, o timer de descanso com alerta e a carga da próxima série para montar a barra.
- Anima em pixel art todos os 25 movimentos que já apareceram na planilha, seguindo a variação (pausa, descida lenta, pausa no joelho, touch'n go, paralímpico).
- No fim de cada exercício confirma a carga usada; se mudou num top set, oferece atualizar o PR.
- Na última série de cada top set de agachamento, supino e terra, abre a câmera para filmar. O vídeo fica guardado no app até você salvar no app Fotos (folha de compartilhar → Salvar Vídeo), com o nome do arquivo indicando exercício, carga, séries e data. Daí você envia ao treinador quando quiser.
- Lê a planilha do treinador de três jeitos: pelo link (o mais simples), pelo Apps Script (guarda PRs e histórico numa planilha sua) ou importando o .xlsx.
- Exporta o histórico de cargas e PRs em .csv.
- Avisa o fim do descanso no celular: com o app aberto, pelo próprio timer; com o iPhone bloqueado, por notificação do app ntfy.
- Funciona offline na academia: os registros ficam no celular e sobem quando a conexão volta.

## Como as peças se encaixam

```
Planilha do treinador ──(leitura, todo dia 6h)──▶ Apps Script (no seu Drive) ──▶ Planilha "GTM — Dados"
                                                     ▲   │                         (PRs, histórico, cargas)
                                         token       │   ▼ JSON
                                                   PWA no GitHub Pages ──▶ ntfy.sh ──▶ iPhone
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

### 5. Avisos com o iPhone bloqueado

Com o app aberto, o timer apita no fim do descanso. Para ser avisado com o iPhone bloqueado ou em outro app, o GTM usa o [ntfy](https://ntfy.sh), um serviço gratuito de notificações, porque o Safari não deixa um site agendar notificações sozinho.

1. Instale o app **ntfy** no iPhone.
2. No GTM, em **Ajustes**, ligue **Avisar fim do descanso**. O app cria um tópico aleatório.
3. No ntfy, toque em **+** e assine esse tópico.
4. Toque em **Enviar teste** para conferir.

Em **Ajustes → Tela**, a opção **Manter a tela acesa no treino** vem ligada. Desligue para economizar bateria; com a tela apagada, o aviso chega pelo ntfy.

Como funciona: ao concluir uma série, o app agenda duas mensagens no ntfy, uma a 10 s do fim do descanso e outra no fim, com a próxima carga e as anilhas por lado. Se você começa a série antes, ou volta, as mensagens são canceladas. Se o descanso ganha +30 s, elas são reagendadas. O ntfy aceita atraso mínimo de 10 s, então descansos de até 20 s não recebem o aviso de 10 s.

O tópico funciona como senha: quem souber o nome consegue ler e mandar mensagens nele. Não compartilhe.

## Planilha por link (sem Apps Script) — o jeito mais simples

Para quem não quer mexer com Apps Script: o treinador compartilha a planilha como **Qualquer pessoa com o link → Leitor**, manda o link, e o atleta cola no app (primeira tela ou **Ajustes → Planilha do treinador**). O app lê a planilha toda vez que abre e troca de semana quando aparece uma aba nova na frente.

Funciona com os dois tipos de arquivo do Drive: planilha nativa do Google (lida pela API do Sheets) e arquivo Excel (.xlsx) guardado no Drive e aberto no Planilhas Google (o link tem `rtpof=true`). O Excel é baixado pela API do Drive e lido com o mesmo leitor da importação, e só é baixado de novo quando muda. Durante um treino a semana não muda; a troca entra quando o treino termina.

Quem tiver o link consegue ver a planilha. O link é longo e não dá para adivinhar, mas não deve circular em grupos.

Histórico, PRs e vídeos ficam no celular. Em **Ajustes → Seu histórico** (ou em "Exportar", na tela inicial) o atleta exporta tudo num .csv que abre no Planilhas Google e no Excel.

### Criar a chave da API (uma vez, por quem mantém o app)

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (ex.: `gtm-app`).
2. Em **APIs e serviços → Biblioteca**, ative a **Google Sheets API** e a **Google Drive API**. A do Drive é para quando o link é de um arquivo Excel (.xlsx) guardado no Drive, que a API de planilhas não lê.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
4. Edite a chave e restrinja:
   - **Restrições de aplicativo → Sites**: `https://xaleh.github.io/*`
   - **Restrições de API → Restringir chave**: só **Google Sheets API** e **Google Drive API**
5. No GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**, nome `SHEETS_API_KEY`, valor = a chave.
6. Em **Actions → Publicar no GitHub Pages → Run workflow**, para publicar com a chave.

A chave fica visível no código do site, como em qualquer app web que usa APIs do Google; as restrições acima impedem o uso fora do GTM e fora da API de planilhas. Ela não dá acesso a nada privado: só lê planilhas abertas por link. Sem a variável, o app esconde a opção de link e segue com .xlsx e Apps Script.

A cota gratuita da API (300 leituras por minuto por projeto) atende com folga: cada abertura do app faz até 3 leituras.

## Usar só com o .xlsx (sem Apps Script)

Para outra pessoa usar o app, basta mandar o link do GitHub Pages. Ela adiciona à tela de início e importa a planilha em .xlsx pelo botão **Importar planilha (.xlsx)** da tela inicial. Não precisa de Apps Script nem token.

- A planilha precisa seguir o mesmo modelo (PRs em I5/I8/I11, cargas por `MROUND`), com a semana atual na primeira aba.
- No Planilhas Google do iPhone: **Compartilhar e exportar → Enviar uma cópia → Excel (.xlsx)**, salvando em Arquivos.
- PRs, histórico, cargas e vídeos ficam só naquele celular, sem backup. Apagar os dados do Safari ou remover o app apaga tudo.
- A importação precisa de internet (o leitor de .xlsx é baixado na hora). Depois o treino funciona offline.
- Os PRs seguem a mesma regra descrita abaixo, comparando com a importação anterior.

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
