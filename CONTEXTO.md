# Leo Personal Trainning — Contexto para continuar o projeto

> **Se você é uma IA que acabou de chegar neste projeto, comece por aqui.**
>
> Ordem de leitura:
> 1. Este arquivo — estado atual, arquitetura, regras e armadilhas.
> 2. [`PLANO.md`](PLANO.md) — o produto: decisões, modelo de dados, telas, fases.
>
> Os dois juntos bastam. Não é preciso ter acompanhado nenhuma conversa anterior.
>
> **Regra de manutenção:** ao terminar qualquer fase, atualize a seção 2 (estado
> atual) e a seção 9 (próximo passo) deste arquivo. Ele é a memória do projeto;
> se ficar desatualizado, a próxima sessão começa cega.

---

## 1. O que é o projeto, em um parágrafo

App web para **um** personal trainer (Leo) gerenciar seus alunos: fichas de
treino com vídeo/foto/how-to por exercício, registro de carga pelo aluno durante
o treino, acompanhamento de frequência, anotações do professor e controle
financeiro manual. Dois perfis: **professor** (vê e edita tudo) e **aluno** (vê
só o que é seu). Feito em HTML/CSS/JS puro, sem build, sem framework, com o
Supabase por trás (Auth + Postgres + RLS) e publicado no GitHub Pages.

---

## 2. Estado atual

### Onde tudo vive — o cartão de referência

| | Onde | Detalhe |
|---|---|---|
| **App publicado** | https://mdulgher.github.io/App-Fitness/ | GitHub Pages, branch `main`, pasta raiz. Atualiza sozinho a cada push. |
| **Código** | https://github.com/mdulgher/App-Fitness | **Repositório público.** Branch única: `main`. |
| **Banco** | Supabase, projeto `App Fitness Leo` | ref `azifpaxbeozfooydkzxh`, região `sa-east-1`. Conta do próprio dono. |
| **Senhas** | `CREDENCIAIS.local.md` (professor/admin) e `SENHAS-TESTE.local.md` (alunos fictícios) | Fora do git (`.gitignore`). Nunca escreva senha em arquivo versionado. |
| **Lovable** | projeto `c2aa8a9f-2818-4c41-bd83-3dad893dc3e2` | **Abandonado.** Ver seção 11 antes de tocar. |

**Estado em 14/09/2026:** o app está no ar, ligado ao banco de verdade, com 16
alunos fictícios semeados para demonstração ao Leo (o dono). O que funciona
ponta a ponta: login, cadastro de alunos pelo professor, editor de ficha com
agenda semanal, lista pessoal do aluno, financeiro com cobrança por WhatsApp +
Pix, perfil editável pelos dois papéis e a biblioteca de 53 exercícios.

**O que ainda não existe:** nenhuma tela aponta mais para
`views/em-construcao.js`. A fila offline, toda a área do aluno, a progressão
vista pelo professor e a PWA estão prontas. Não haverá geração de ilustrações:
o professor fornecerá as imagens ou vídeos que quiser anexar aos exercícios.

### Progressão do professor — 14/09/2026

- O perfil do aluno ganhou a aba **Progressão**, ao lado de Geral, Fichas e
  Financeiro. Ela lista só exercícios com carga registrada e mostra último
  treino, recorde, variação desde o início, gráfico e histórico completo.
- Cada sessão agora traz as cargas e repetições **de cada série**. O resumo por
  peso máximo continua existindo, mas o professor não precisa adivinhar se o
  recorde veio de uma série isolada ou do treino inteiro.
- Aluno e professor usam o mesmo componente (`renderizarProgressao` em
  `views/aluno-evolucao.js`) e as mesmas funções da camada de dados. O histórico
  é carregado somente quando o professor abre a aba, para não tornar o perfil
  mais lento sem necessidade.
- Validado no modo local com dados fictícios em desktop e 390 px: sete sessões,
  gráfico e detalhes das séries, sem overflow horizontal ou erros no console.

### Rotação das contas fictícias — 14/09/2026

- As senhas das **16 contas fictícias** foram substituídas por valores aleatórios
  de 20 caracteres, diferentes por conta. Todas as novas senhas foram validadas
  por login e as sessões foram encerradas globalmente.
- As credenciais atuais vivem em `SENHAS-TESTE.local.md`. O arquivo principal
  ficou apenas com professor/admin e aponta para ele. Os dois estão ignorados
  pelo Git.
- As senhas antigas continuam no histórico público por decisão do dono, mas não
  autenticam mais. `node scripts/test-security.mjs` confirma que nenhuma senha
  **atual** das contas fictícias aparece no histórico.
- `scripts/rotacionar-senhas-teste.mjs` faz uma futura rotação de modo retomável:
  preserva as senhas novas antes da primeira chamada e registra o progresso para
  sobreviver a interrupção ou limite temporário do Auth.

### PWA, reabertura offline e paginação — 14/09/2026

- `service-worker.js` guarda o app shell completo, assume versões novas sem
  deixar caches antigos e usa rede primeiro para código. Fotos e banners são
  guardados sob demanda, sem colocar dados do Supabase no Cache Storage.
- `js/offline-snapshot.js` mantém somente a cópia mínima da própria ficha e do
  treino necessária para reabrir sem rede. O snapshot é separado por usuário,
  só substitui falha de conexão, nunca erro de permissão, e é apagado no logout.
  As gravações continuam passando exclusivamente pela fila offline existente.
- O manifest tem ícones `any` e `maskable`, escopo/id estáveis e modo
  `standalone`; iOS recebe também os metadados e o ícone próprios.
- `js/supabase-pagination.js` busca as listas em páginas de 500 linhas, sempre
  com ordem determinística. Alunos, sessões, cargas, evolução, pagamentos,
  pacotes, notas e demais listas não param silenciosamente no limite do
  Supabase. O teste cobre inclusive 1.001 e 10.000 registros.

### Log de erros e o fim do "Cannot coerce the result…" — 12/09/2026

**Log de erros (`js/log.js` + tabela `app_errors`).** O app roda no celular de
outra pessoa: quando quebra lá, ninguém abre o console. Agora todo erro não
tratado (`window.onerror`, promessa rejeitada) e os erros das telas viram uma
linha no banco, com rota, papel, mensagem, pilha, contexto, navegador e se
estava online.

- **Por que tabela, e não arquivo nem tela de desenvolvedor:** arquivo só existe
  no aparelho de quem teve o erro; tela de desenvolvedor é interface para
  construir e manter sem ninguém olhar. A tabela chega sozinha e o Claude Code
  lê direto pelo MCP do Supabase — `select * from app_errors order by created_at
  desc` — sem login novo e sem exportar nada à mão.
- **RLS:** só **sessão autenticada** insere erro (`user_id` nulo ou o próprio).
  Ler e apagar, só o professor. Antes qualquer um inseria, inclusive deslogado,
  para não perder o erro que impede de entrar; a chave publicável é pública e
  isso deixava a tabela aberta a inundação por qualquer pessoa. O erro de quem
  ainda não entrou **não se perde**: fica no aparelho e sobe no primeiro login
  (ver `enviarErrosGuardados`).
- Três regras dentro do `log.js`: registrar erro **nunca** pode causar erro (tudo
  dentro de try/catch que engole); a mesma mensagem na mesma rota só vai **uma
  vez por minuto** (erro dentro de laço encheria a tabela em segundos); **nada
  sensível** — vai mensagem, rota e o contexto que o chamador escolhe.
- Sem rede ou no modo local, os erros ficam em `localStorage` (`lpt:erros`, os 50
  últimos) e sobem ao reconectar, voltar ao app ou trocar de sessão.
- `configurarLog` recebe o cliente do Supabase **injetado** pelo `app.js`. O log
  não importa `db.js` de propósito: precisa funcionar quando é a camada de dados
  que está quebrada.

**"Cannot coerce the result to a single JSON object".** Era o erro ao renomear
uma divisão. `update(...).select().single()` estoura com essa frase sempre que o
banco devolve zero linhas — e isso acontece por dois motivos diferentes: a linha
não existe mais, ou o RLS não deixou ler o retorno. Agora `atualizarDia` e
`atualizarItemDoDia` passam por `atualizarLinha()`, que relê a linha: se o valor
já está gravado, **não há erro nenhum**; se sumiu, diz que a tela está
desatualizada; se o banco recusou, diz que é regra de acesso. **Não volte a usar
`.single()` em UPDATE.**

### Recados do professor e fila offline — 12/09/2026

- **O professor escreve recado** em `#/professor/aluno/:id`, aba Geral: botão
  "Escrever recado", com texto e um interruptor de fixar. Dá para editar e
  excluir. É o que o aluno lê em `#/aluno/anotacoes`, e o fixado aparece
  também no painel dele. **Armadilha:** `atualizarAnotacao` só entende
  `{ conteudo, fixada }` — as duas implementações do banco ignoram
  `{ content, pinned }` **em silêncio**, sem erro nenhum, e a edição "funciona"
  sem salvar nada. Custou um teste para descobrir.
- **Excluir recado são dois toques no próprio botão**, não um `confirm()`.
  Mesma razão do renomear: caixa do navegador pode ser bloqueada.
- **Fila offline (`js/sync.js`)** — falha de rede ao registrar série ou concluir
  treino não mostra erro: guarda no aparelho e reenvia sozinha. Pontos que
  importam para quem for mexer:
  - A fila guarda **a intenção** ("no dia tal, série 2 do exercício tal foi
    22,5 kg × 10"), não a chamada de banco. Guardar o id da sessão seria
    impossível: criar a sessão já exige rede. No reenvio isso vira
    `abrirSessao` + `registrarSerie` + `concluirSessao`.
  - Reenviar é seguro porque as três são idempotentes (a sessão é única por
    aluno/dia/divisão e a carga é upsert na chave sessão+exercício+série).
  - Toda intenção é persistida antes do envio. Falha de rede fica no reenvio
    automático; recusa de acesso ou erro permanente vira **precisa de atenção**
    e não é repetida a cada minuto. O aluno pode tentar de novo manualmente,
    copiar os dados e removê-los somente após uma confirmação explícita.
  - Reenvia quando a rede volta, quando o app volta para a frente e a cada 60s;
    `ligarSincronizacaoAutomatica()` roda no `app.js`, então a fila anda mesmo
    com o aluno fora da tela de treino. A tela escuta o evento `lpt:fila`.
  - Na tela, série guardada aparece com **⏳ e borda tracejada**, inclusive
    quando corrige uma carga que já existia. O estado normal oferece "Tentar
    agora"; o permanente explica que precisa de atenção. O painel também mostra
    recuperação global, inclusive se a divisão foi removida da ficha.
  - A primeira abertura offline de uma divisão já presente na ficha deriva o
    dia do snapshot da ficha ativa; não exige que aquela divisão tenha sido
    aberta anteriormente.

### Fase 4 — a área do aluno inteira — 12/09/2026

As quatro telas que faltavam existem e foram testadas no navegador, inclusive em
375 px de largura:

- **`#/aluno/treino/:diaId`** (`views/aluno-treino.js`) — o treino do dia. Cada
  exercício mostra **a carga da última vez ao lado do campo**; é o detalhe que
  justifica o recurso (PLANO.md 6.4), não enfeite. Três regras não óbvias:
  **(a)** cada série é gravada ao sair do campo, nunca em lote — o celular na
  academia perde foco, trava e volta para o bolso; **(b)** a sessão
  (`abrirSessao`) só nasce no primeiro registro ou ao concluir, para abrir a
  tela não virar presença no histórico; **(c)** o campo vem vazio, com a carga
  anterior só como sugestão cinza — preencher sozinho gravaria peso que o aluno
  não levantou. Tem cronômetro de descanso e o diálogo de vídeo e how-to (o
  iframe é removido ao fechar, senão o vídeo continua tocando).
- **`#/aluno/evolucao`** — peso máximo por treino, por exercício, com gráfico em
  SVG escrito à mão (poucos pontos, sem build, sem biblioteca). Lista só os
  exercícios com carga registrada.
- **`#/aluno/frequencia`** — semana corrente primeiro, depois oito semanas e um
  calendário de três meses.
- **`#/aluno/anotacoes`** — leitura pura. A conversa é no WhatsApp; caixa de
  resposta aqui viraria uma segunda caixa de entrada que o Leo esqueceria.

O RLS já cobria tudo isso: o aluno insere e corrige a própria frequência e as
próprias cargas, e só lê os recados. Nada de política nova foi preciso.

Estilos em **`css/aluno.css`**, ligado no `index.html`.

### Conta no cabeçalho vira avatar com menu — 12/09/2026

- No lugar dos botões "Meu cadastro" e "Sair" há **o avatar do usuário com o
  primeiro nome**; clicar abre um menu com os dois itens. No celular sobra só o
  avatar. O menu fecha ao clicar fora, no Esc e a cada troca de tela — ele é
  absoluto sobre o conteúdo e ficaria aberto por cima da tela nova.
- O avatar usa `avatar_url` quando existe e as iniciais quando não.

### Abas do aluno e renomear divisão — 12/09/2026

- **A tela do aluno (professor) tem três abas: Geral, Fichas e Financeiro**, e
  abre em Geral. Geral traz os números da semana, o cadastro e as anotações;
  Fichas lista todas as fichas do aluno (a ativa e as encerradas) e leva ao
  editor; Financeiro segue igual. O botão "Montar ficha" saiu do cabeçalho: a
  porta de entrada do editor agora é a aba Fichas.
- **Renomear divisão não usa mais `prompt()`.** O clique parecia não fazer nada
  porque `prompt()` é uma caixa que o navegador pode engolir — some depois de
  "impedir que esta página crie novas caixas de diálogo" e não aparece no app
  instalado na tela inicial. Agora é o mesmo `<dialog>` do resto da tela, com
  Enter para salvar (dentro de `<dialog>` o envio implícito do formulário não é
  garantido, por isso o `keydown` explícito). **Não volte a usar `prompt`,
  `alert` ou `confirm` para nada que precise funcionar.**

### Publicação no GitHub Pages — 12/09/2026

- Fonte: branch `main`, pasta `/` (raiz). Sem workflow de build: o app é
  estático e os arquivos são servidos como estão.
- `.nojekyll` na raiz **é obrigatório**. Sem ele o Jekyll processa o site e
  ignora arquivos e pastas que começam com `_`.
- Funciona embaixo do subcaminho `/App-Fitness/` porque **todos os caminhos são
  relativos** e a navegação é por `#`. Se algum dia alguém escrever `/js/...` ou
  `/assets/...` com barra inicial, o site quebra só em produção — nunca no
  `localhost`. Não faça isso.
- A `anonKey` no `js/config.js` é publicável por natureza (`sb_publishable_…`):
  quem protege os dados é o RLS, não o segredo da chave.
- Verificado no ar: login do professor, painel com os 16 alunos, ficha e
  financeiro.

### Abas no perfil do aluno e datas em dd/mm/aaaa — 12/09/2026

- **O perfil do aluno tem duas abas: Treino e Financeiro**, e abre sempre em
  Treino. O motivo é físico: o professor usa essa tela ao lado do aluno,
  mostrando a ficha, e dinheiro não pode aparecer junto. A aba não é lembrada
  entre visitas de propósito — sair do financeiro não pode depender de o
  professor lembrar de trocar antes de virar a tela.
- O cartão "Mensalidade" saiu do topo e virou a aba financeira, que ganhou
  "Em aberto" e "Pago no total". No lugar dele, "Ficha: ativa até tal data".
- **Campos de data são texto com máscara dd/mm/aaaa**, não `<input type="date">`.
  Aquele controle mostra a data no formato do sistema operacional: num Windows
  em inglês, 12 de setembro aparecia como `09/12/2026` e se lê "9 de dezembro".
- Ficha nova já vem com **3 meses** de duração, e o formulário recusa fim antes
  do início e datas que não existem (31/02).
- A letra da nova divisão vem dos rótulos existentes, não da contagem: dois
  cliques seguidos criavam dois "Treino B". Mesma correção no `order_index`.

### Meu cadastro e dados de teste — 12/09/2026

- **`#/professor/perfil` e `#/aluno/perfil`** — a mesma view (`views/perfil.js`)
  para os dois papéis: nome, telefone e troca de senha. O email não se edita:
  é o login. O professor ganha aí o bloco **Chave Pix**; o aluno vê, em leitura,
  o que o professor definiu (objetivo, meta, mensalidade) — o banco não deixa
  ele escrever na tabela `students`, então não é só a tela que esconde.
- O link "Meu cadastro" fica no canto do cabeçalho, ao lado de "Sair", e não na
  navegação de conteúdo. No celular o rótulo encurta para "Perfil".
- Os dados de cobrança saíram do diálogo do financeiro e vivem só no perfil do
  professor — tinha duas cópias do mesmo formulário.
- **Campos de dinheiro com máscara brasileira** (`ligarMascaraDeMoeda` em
  `utils.js`): o campo é texto e trabalha em centavos, como maquininha de
  cartão. `<input type="number">` mostrava "280.5" e aceitava ponto decimal.
- **16 alunos de teste** no banco, com frequência, mensalidades e cobranças de
  agosto e setembro em situações diferentes. Credenciais na seção 4.

### Ficha, lista do aluno e cobrança — 12/09/2026

Entregue e testado no navegador contra o banco real:

- **Editor de ficha** (`#/professor/aluno/:id/ficha`): o professor cria a ficha,
  monta as divisões (Treino A, B, C…), marca os dias da semana de cada uma e
  escolhe os exercícios **dentro da biblioteca** — não há campo de texto livre,
  de propósito. Séries, repetições, descanso e observação são editados na
  própria linha. "Ativar para o aluno" publica a ficha e desativa a anterior.
- **Frequência derivada**: a ficha mostra "N treinos por semana" contando os
  dias marcados, e compara com a meta do aluno. Não existe campo de frequência.
- **Minha lista** (`#/aluno/lista`): lista pessoal do aluno, separada da ficha.
  Ele adiciona da biblioteca e escreve a própria anotação. O professor lê, mas
  o banco não deixa ele escrever.
- **Editar cadastro do aluno**, inclusive a mensalidade e o dia do vencimento.
- **Cobrança por WhatsApp com Pix**: `js/pix.js` gera o "copia e cola" (BR Code
  EMV com CRC16, validado contra o vetor padrão `123456789 → 29B1`) e cada linha
  do financeiro abre o `wa.me` com a mensagem pronta. A chave, o nome, a cidade
  e o modelo da mensagem ficam em "Dados de cobrança" (tabela
  `trainer_settings`), editáveis pelo professor dentro do app.
- **"Lançar cobranças do mês"** mostra uma prévia antes de gravar: quantas já
  existem, quais serão criadas, o total e quem ficará fora por mensalidade
  vazia ou zero. Confirmar cria somente os registros; não envia WhatsApp.

Privacidade reverificada com duas contas de aluno reais: um aluno não enxerga a
mensalidade, a ficha, as divisões, os exercícios prescritos nem a lista pessoal
de outro; não consegue escrever na ficha, mudar a chave Pix nem alterar a
própria mensalidade.

### Atualização visual — 12/09/2026

Redesign aplicado à versão **HTML/CSS/JS desta pasta**, mantendo preto, branco,
cinza e a camada de dados existente. A migração React/Lovable citada na seção 11
é outro projeto; não foi alterada nesta entrega.

- Login com fotografia e logo do arquivo `Logo e banner.jpg`, reaproveitadas por
  enquadramento CSS; o arquivo original permanece intacto.
- Cabeçalho com logo, ícones SVG locais e navegação inferior no celular.
- Painel do professor com resumo semanal, indicadores, alunos e pendências.
- Painel do aluno com treino sugerido em destaque, progresso circular e divisões.
- Lista de alunos e componentes compartilhados com o mesmo acabamento.
- Estilos novos em `css/refinement.css`, carregados após `css/style.css`.
- `node scripts/preview.cjs --demo` abre uma prévia fictícia em
  `http://127.0.0.1:5180`, com origem separada. A configuração Supabase do app
  não é alterada; a substituição por `local` ocorre só na resposta desse servidor.
- Validado: login real do professor e painel vazio; com dados fictícios, busca,
  perfil com ficha, painel do aluno e navegação. Layout inspecionado em desktop
  e 390px, sem overflow horizontal no painel do aluno em 320px e 390px.

Na entrega visual de 12/09, as telas então marcadas como fases futuras ficaram
pendentes: aquele redesign não implementou registro de séries, editor de ficha
ou financeiro. Essas frentes foram concluídas depois; o estado vigente é o mapa
de fases abaixo. Referências pesquisadas em `REDESIGN.md`.

### Mapa das fases — o que está pronto e o que falta

As fases estão descritas em [`PLANO.md`](PLANO.md) seção 13. Situação real:

| Fase | O que é | Situação |
|---|---|---|
| 0 | Base local, login, painéis, camada de dados | **pronta** |
| 1 | Cadastro e edição de aluno | **pronta** (Edge Function `criar-aluno`) |
| 2 | Biblioteca de exercícios | **pronta** — 53 exercícios com how-to |
| 3 | Editor de ficha | **pronta** — com agenda semanal |
| 4 | Treino do dia, carga, evolução, frequência, recados | **pronta** — inclui fila offline |
| 5 | Aba de progressão do professor | **pronta** — gráfico, recorde e séries por sessão |
| 6 | Financeiro do professor | **pronta** — com cobrança por WhatsApp + Pix |
| 7 | Acabamento e PWA | **pronta** — app shell, versão, instalação e snapshot offline |
| 8 | Supabase | **pronta** — em produção |
| 9 | Hospedagem | **pronta** — GitHub Pages |

A troca de `local` para `supabase` custou **uma linha** em `js/config.js` e
nenhuma tela foi alterada. É a prova da regra da seção 5.1; mantenha-a viva —
`db-local.js` ainda existe e precisa continuar espelhando as assinaturas.

Fora das fases, já feito: lista pessoal do aluno, "Meu cadastro" para os dois
papéis e máscara de Real e de data. `PROMPT-ILUSTRACOES.md` ficou apenas como
registro histórico; por decisão do dono, não serão geradas ilustrações e o
professor anexará a mídia dos exercícios.

---

## 3. Como rodar

Abrir o `index.html` com dois cliques **não funciona**: em `file://` os módulos
JS e o `fetch` quebram por CORS. Sempre use o servidor protegido do projeto, na
pasta do app:

```bash
node scripts/preview.cjs
```

Depois abra `http://127.0.0.1:5173`. Para testar no celular (mesmo Wi-Fi), use
`node scripts/preview.cjs --lan` e abra o IP da máquina na rede, por exemplo
`http://192.168.15.45:5173`. O modo fictício usa `--demo` e a porta 5180; as
opções podem ser combinadas como `node scripts/preview.cjs --demo --lan`.

O servidor usa uma lista de arquivos públicos e responde 404 para documentação,
arquivos ocultos e credenciais locais. Não use `npx serve .` nem
`python -m http.server` na raiz do projeto, especialmente com acesso pela rede
local: esses servidores genéricos podem expor arquivos ignorados pelo Git.

### Publicação e git

- **No ar:** https://mdulgher.github.io/App-Fitness/
- **Repositório:** https://github.com/mdulgher/App-Fitness — público, branch
  única `main`. Não há `gh-pages`, workflow de CI nem ambiente de staging.
- **Publicar é dar push.** O Pages serve `main` na raiz; em 1–2 minutos o site
  reflete o commit. Não existe passo de build.
- **Consequência:** todo push vai direto para produção, e o Leo pode estar com
  a tela aberta. Teste antes no `localhost`.

**Armadilha do push neste Windows:** o Gerenciador de Credenciais guarda um
token vencido e o `git push` normal falha com 403 ("Permission ... denied to
mdulgher") mesmo com o `gh` autenticado e com permissão de admin no repositório.
Passar só `-c credential.helper='!gh auth git-credential'` **não resolve**: isso
acrescenta o helper ao fim da lista, e o do Windows responde primeiro. É preciso
zerar a lista antes:

```bash
git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main
```

Correção definitiva, a ser feita pelo dono (nunca altere a config do git dele
sem pedir — é instrução explícita): `gh auth setup-git`, ou apagar a entrada
`github.com` no Gerenciador de Credenciais do Windows.

### Supabase (banco de verdade, já criado)

- **Projeto:** `App Fitness Leo` — ref `azifpaxbeozfooydkzxh`, região `sa-east-1` (São Paulo)
- **URL:** `https://azifpaxbeozfooydkzxh.supabase.co`
- É a conta **do próprio dono do projeto**, não o banco gerenciado da Lovable. Escolha deliberada: ele é dono dos dados, leva tudo junto se sair da Lovable, e o schema pode ser auditado direto por fora.

O schema completo e as regras de acesso **já estão aplicados** (13 tabelas, todas
com RLS ligado, mais a view `payments_view` e as funções `is_trainer()`,
`handle_new_user()` e `hoje_br()`). Detalhes na seção 11.

Tabelas acrescentadas em 12/09/2026:

- `student_exercises` — a lista pessoal do aluno. Leitura: o dono e o professor.
  Escrita: **só o dono** (se o professor pudesse escrever, deixaria de ser "a
  lista dele").
- `trainer_settings` — linha única (chave primária booleana com `check`, para o
  app nunca precisar adivinhar qual linha vale) com a chave Pix, o nome/cidade
  do recebedor e o modelo da mensagem de cobrança. Todo usuário logado lê (é com
  essa chave que o aluno paga); só o professor escreve.
- `workout_days.weekdays` — `smallint[]` de 1 (segunda) a 7 (domingo).

**Edge Function `criar-aluno`** (Deno, `verify_jwt: true`) — é ela que permite
ao professor criar a conta do aluno. Por que existe: criar usuário para outra
pessoa exige a chave `service_role`, que ignora todo o RLS e por isso **nunca
pode estar no navegador**. A função:

1. confere, pela sessão de quem chamou, que `profiles.role = 'trainer'`;
2. cria o usuário com `admin.auth.admin.createUser({ email_confirm: true })` —
   já confirmado, senão a confirmação por email travaria todo aluno novo;
3. atualiza o perfil e insere a linha em `students`;
4. **apaga a conta se esse insert falhar**, para não sobrar conta órfã;
5. devolve `{ id, email, senha, full_name }` — a senha temporária aparece uma
   única vez para o professor repassar, e não fica guardada em lugar nenhum.

**Avisos do linter do Supabase que permanecem, de propósito:**

- `is_trainer()` é `SECURITY DEFINER` executável por `authenticated`. É
  obrigatório: todas as políticas de RLS a chamam. Foi feita assim para evitar
  recursão — uma política em `profiles` que consultasse `profiles` se
  autorreferencia.
- "Leaked password protection disabled" — sugestão de ligar a checagem contra o
  HaveIBeenPwned em Authentication → Policies. Vale ligar; ainda não foi feito.

**Como aplicar mudanças de schema:** por migration (`apply_migration`), nunca
por SQL solto, para o histórico ficar no projeto. O `.sql` correspondente fica
em `supabase/migrations/`, com o mesmo nome e a mesma versão que aparecem em
`list_migrations` — se os dois divergirem, o repositório deixa de descrever o
banco. Já aconteceu: as duas migrations de 13/09/2026 foram primeiro aplicadas
por SQL solto e ficaram fora do histórico, com o arquivo no repositório
parecendo aplicado sem estar registrado.

**Storage.** Um bucket: `avatars`, público, 2 MB, só imagem. O arquivo é
`<uid>/<uuid aleatório>.jpg` — o nome aleatório tira a URL de quem apenas
conhece o id do usuário, e força o navegador a recarregar depois da troca. As
políticas prendem a escrita à pasta do próprio usuário. **Existe uma política de
SELECT que parece redundante num bucket público e não é:** o Storage lê a linha
do objeto antes de apagar, e sem ela o DELETE volta "Access denied" — a foto
antiga nunca era removida e sobrava órfã. Coberto por `scripts/test-security.mjs`.

**Aplicadas em 13/09/2026:**

- `ativar_ficha_atomica` — função `ativar_ficha(uuid)`, `security invoker`, que
  desativa as outras fichas do aluno e ativa a escolhida **numa transação só**.
  Em duas requisições, falhar na segunda deixava o aluno sem ficha nenhuma.
  `db-supabase.ativarFicha` chama esse RPC — **não volte aos dois UPDATEs.**
- `papel_admin` — papel `admin`, com os mesmos poderes do professor. **Toda
  política de RLS chama `is_trainer()`** (29 delas), então o papel novo foi
  acrescentado **dentro da função**, não em políticas próprias: uma mudança em
  vez de 29 e nenhuma lista duplicada para manter em sincronia. A função ainda
  se chama `is_trainer()` — leia como "tem poderes de professor". No app,
  `ehProfessor()` e o guard do roteador seguem a mesma regra por
  `cumprePapel()`. Criar admin continua sendo manual, por SQL: `handle_new_user()`
  cria todo mundo como aluno e não há caminho pelo app para se promover.
  **Criar usuário por SQL exige zerar as colunas de token do GoTrue**
  (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`,
  `reauthentication_token`): criadas nulas, o login devolve 500 "Database error
  querying schema". A API oficial as cria como string vazia.
- `cobranca_de_pacote_fora_da_unicidade_mensal` — `payments.kind`
  (`monthly`/`package`) e o índice `cobranca_unica_por_mes` virou **parcial**
  (`where kind = 'monthly'`). Sem isso, vender dois pacotes no mesmo mês batia
  em "duplicate key": o índice antigo era uma cobrança por aluno por mês, o que
  vale para mensalidade e não vale para pacote. **A consequência que morde:**
  índice parcial **não serve** para inferência de `ON CONFLICT`, então o
  `upsert` de `gerarCobrancasDoMes` passou a responder 400 e virou INSERT que
  trata a violação. A garantia de não duplicar continua sendo do banco.
- `pacote_de_aulas_avulsas` — pagamento avulso por aula, **pré-pago**. O aluno
  é de um tipo só (`students.billing_type`: `monthly` ou `package`); quem é de
  pacote **não entra** na geração de cobranças do mês, porque a cobrança dele
  nasce da venda. Vender pacote cria a linha em `class_packages` **e** a
  cobrança em `payments`, ligadas: dar baixa na cobrança é o que diz que foi
  pago, e não há dois lugares registrando o mesmo dinheiro.
  **A aula presencial não tem tabela própria:** é uma linha de `attendance` com
  `workout_day_id` nulo e `in_person`. Assim ela conta na frequência (é um
  treino de verdade) e não existe um segundo lugar onde "o aluno treinou" possa
  divergir do primeiro. O índice único já existente garante uma por dia e nunca
  colide com o treino que o aluno marca sozinho, que sempre tem
  `workout_day_id`. **O aluno não marca aula presencial** — a política de
  INSERT/UPDATE exige `in_person = false` para ele; a aula é paga, e dar baixa
  nela é do professor. Coberto por `scripts/test-security.mjs`.
  **O saldo é derivado** (comprado − consumido), nunca uma coluna: um contador
  divergiria na primeira correção e ninguém saberia qual número é o verdadeiro.
  Mesma razão da armadilha 2.
- `banner_da_divisao` — `workout_days.banner`, o slug da arte do cabeçalho.
- `bucket_de_avatares` + `avatar_leitura_autenticada` — ver "Storage" acima.
- `hardening_pre_producao` — tira o `update` da coluna `role` de `profiles`
  (um aluno podia se promover a professor, e `is_trainer()` lê essa coluna),
  restringe a leitura da chave Pix e o insert em `app_errors` a sessões
  autenticadas, e retira todos os privilégios do papel `anon` no schema
  `public`. O app não tem cadastro público nem lê nada antes do login.

---

## 4. Usuários de teste

Contas **reais no Supabase** (`DATA_SOURCE = "supabase"`). Todas com senha de
verdade; o aluno pode trocar a dele em "Meu cadastro".

> **As senhas NÃO ficam neste arquivo.** Este repositório é público e o app
> aponta para o banco de verdade: a senha do professor aqui é acesso a todos os
> dados de todos os alunos. Professor/admin vivem em `CREDENCIAIS.local.md`; os
> alunos fictícios, em `SENHAS-TESTE.local.md`. Ambos estão no `.gitignore` e
> nunca sobem. Se não existirem na sua máquina, peça as senhas ao dono do
> projeto — não as escreva de volta aqui.

| Papel | Email | Cenário |
|---|---|---|
| **Professor** | `leo@leopersonal.com` | Vê os 16 alunos |
| Aluna | `carla.mendes@email.com` | Mensalidade vencida, ficha ABC ativa (Seg·Qui / Ter·Sex) |
| Aluno | `joao.batista@email.com` | Pago, restrição médica (hérnia L5-S1), lista pessoal com 1 exercício |
| Aluna | `ana.souza@teste.com` | Em dia, treinando bem (3/4 na semana) |
| Aluno | `bruno.carvalho@teste.com` | Vencido, treinando pouco (1 na semana) |
| Aluna | `camila.ribeiro@teste.com` | Pago, **única que bate a meta** (5/5) |
| Aluno | `diego.fernandes@teste.com` | Vencido, **sem treinar há ~3 semanas**, tendinite no ombro |
| Aluna | `eduarda.lima@teste.com` | A vencer (dia 20), **nunca treinou**, pós-operatório de joelho |
| Aluno | `felipe.andrade@teste.com` | Pago, frequência média |
| Aluna | `gabriela.nunes@teste.com` | Vencido, treinou hoje |
| Aluno | `henrique.tavares@teste.com` | Pago, alta frequência |
| Aluna | `isabela.moreira@teste.com` | A vencer (dia 25), parou há ~10 dias |
| Aluno | `rafael.pimentel@teste.com` | **Sem mensalidade cadastrada** — fica de fora da geração de cobranças |
| Aluna | `ana.paula@teste.com` | **Pacote de aulas**: 4 compradas, 3 usadas — saldo 1 |
| Aluno | `ricardo.alves@teste.com` | **Pacote de aulas**: 8 compradas, 6 usadas — saldo 2 |
| Aluna | `juliana.castro@teste.com` | **Pacote de aulas**: saldo **zerado**, precisa renovar |
| Aluno | `marcelo.pinto@teste.com` | **Pacote de aulas**: 2 pacotes, saldo 3, 1 cobrança em aberto |

Os quatro de pacote foram semeados em 13/09/2026 para o Leo ver a tela em cada
estado — inclusive o saldo zerado, que é o momento em que ele precisa vender de
novo. Nenhum deles entra na geração de cobranças do mês.

Os `@teste.com` são fictícios, criados pelo próprio fluxo do app (Edge Function
`criar-aluno`). Para limpar tudo de uma vez:

```sql
delete from auth.users where email like '%@teste.com';
```

As cobranças de **agosto estão todas pagas** e as de **setembro variam** entre
pago, a vencer e vencido, para as três situações aparecerem na tela. A
frequência foi semeada com datas relativas a 12/09/2026 — conforme o tempo
passa, todo mundo vira "sem treinar há muito tempo".

> **A chave Pix está vazia de propósito.** O nome, a cidade e o modelo da
> mensagem já estão preenchidos; falta o Leo colar a chave real em
> `#/professor/perfil`. Não deixei uma chave fictícia salva para ninguém cobrar
> com ela por engano.

---

## 5. Arquitetura

```
index.html            página única; shell (barra de teste + topo + <main id="view">)
manifest.json         instalar na tela inicial do celular
css/style.css         design system preto e branco (tokens em :root)
js/
  config.js           DATA_SOURCE, nome do app, fuso, limiar de alerta
  db.js               INTERFACE ÚNICA de dados + regras de domínio compartilhadas
  db-local.js         implementação localStorage (fases 0-7)
  db-supabase.js      implementação Supabase (a criar na Fase 8)
  seed.js             dados de teste, gerados relativos a HOJE
  auth.js             sessão, login/logout, papel
  router.js           roteador de hash + controle de acesso por rota
  app.js              ponto de entrada; desenha o cabeçalho e liga tudo
  utils.js            datas em fuso de SP, moeda, vídeo do YouTube, esc(), etc.
  views/*.js          uma tela por arquivo
```

### 5.1 A regra que não pode ser quebrada

**Nenhuma view pode tocar em `localStorage`, em SQL ou no cliente do Supabase.**
Toda leitura e escrita passa por `js/db.js`.

Essa é a única disciplina que o projeto exige, e existe por um motivo concreto: é
ela que faz a Fase 8 (entrada do Supabase) ser a troca de **uma linha** em
`config.js`, em vez de uma reescrita de todas as telas. Se em qualquer fase uma
view começar a ler dados por conta própria, essa garantia morre silenciosamente
— nada quebra na hora, e o custo só aparece lá na frente.

Ao criar uma função nova de dados, implemente-a **nas duas** implementações
(`db-local.js` e, quando existir, `db-supabase.js`) com assinatura idêntica.
Todas são `async`, inclusive as locais que não precisariam ser — justamente para
que a troca não mude nada.

### 5.2 Contrato de uma view

Cada arquivo em `js/views/` exporta uma única função:

```js
export async function render(alvo, { params, fase }) { ... }
```

- `alvo` é o `<main id="view">`, já esvaziado pelo roteador.
- `params` são os grupos capturados na expressão regular da rota (ex.: o id do aluno).
- A view monta `alvo.innerHTML` e registra seus próprios listeners.
- Não há framework, não há estado global, não há re-render automático: se algo muda, a view chama `render` de novo ou atualiza o nó na mão.

### 5.3 Rotas

Declaradas em `js/router.js`, cada uma com o papel exigido:

```
#/login
#/professor                    #/aluno
#/professor/alunos             #/aluno/lista
#/professor/aluno/:id          #/aluno/treino/:diaId
#/professor/aluno/:id/ficha    #/aluno/evolucao
#/professor/exercicios         #/aluno/frequencia
#/professor/financeiro         #/aluno/anotacoes
#/professor/perfil             #/aluno/financeiro
                               #/aluno/perfil
```

`#/professor/perfil` e `#/aluno/perfil` são a mesma view (`views/perfil.js`),
com dois papéis declarados no roteador: os campos editáveis são idênticos e só
o bloco final muda.

O roteador cuida do controle de acesso num lugar só: sem sessão vai para o
login; papel errado vai para a própria área. Por isso não existe verificação de
login espalhada pelas telas nem "pisca" de conteúdo antes do redirecionamento.

`views/em-construcao.js` continua no projeto, mas **nenhuma rota aponta para
ele**: serve para a próxima tela que nascer antes da hora. Ao construir uma
tela, troque o `view:` da rota e remova o `fase:`.

---

## 6. Contrato da camada de dados (`js/db.js`)

Tudo `async`. Nomes em português, como o resto do código.

**Perfis**
```
listarPerfis()                      buscarPerfil(id)
atualizarMeuPerfil(patch)           -- só full_name, phone, avatar_url
alterarMinhaSenha(nova)             -- só com o banco conectado
```

`atualizarMeuPerfil` filtra os campos de propósito: o banco revoga UPDATE na
coluna `role` e só concede nessas. Mandar `role` volta "permission denied" — é a
proteção contra um aluno se promover a professor, e ela foi testada.

**Alunos** — `listarAlunos` e `buscarAluno` devolvem o aluno já com nome/email
do perfil e um objeto `.resumo` calculado: `{ ultimoTreino, diasSemTreinar,
treinosNaSemana, metaSemanal, temFichaAtiva, fichaAtivaId, fichaVenceEm,
statusFinanceiro }`.
```
listarAlunos({ incluirInativos })   buscarAluno(id)
criarAluno({ full_name, email, phone, ...dados })
atualizarAluno(id, patch)
```

**Exercícios** — arquivar, nunca apagar.
```
listarExercicios({ incluirArquivados })   buscarExercicio(id)
criarExercicio(dados)                     atualizarExercicio(id, patch)
arquivarExercicio(id)
```

**Fichas** — `fichaAtiva` e `buscarFicha` devolvem a ficha com `dias[]`, e cada
dia com `exercicios[]`, e cada exercício já com o objeto `exercicio` embutido.
```
fichaAtiva(alunoId)      buscarFicha(id)       listarFichas(alunoId)
listarTemplates()        buscarDiaDeTreino(diaId)
```

**Edição da ficha** — só o professor (garantido por RLS, não pela interface).
`ativarFicha` desativa as outras do mesmo aluno: duas ativas quebrariam
`fichaAtiva()`, que usa `maybeSingle()`. No Supabase isso é **uma transação só**
(RPC `ativar_ficha`); em duas requisições, falhar na segunda deixava o aluno sem
ficha nenhuma.
```
criarFicha({ alunoId, titulo, descricao, inicio, fim })
atualizarFicha(id, patch)      ativarFicha(id)      removerFicha(id)
criarDia({ fichaId, rotulo, ordem, diasSemana })
atualizarDia(id, patch)        removerDia(id)
adicionarExercicioNoDia({ diaId, exercicioId, series, reps, descanso, carga, observacao, grupo })
atualizarItemDoDia(id, patch)  removerItemDoDia(id)
```

`workout_days.weekdays` é um array de 1 (segunda) a 7 (domingo). A frequência
semanal **não é um campo**: é a contagem dos dias distintos ocupados pelas
divisões. Guardar o número à parte faria ele divergir do calendário na primeira
vez que alguém mudasse um dia.

**Lista pessoal do aluno** — separada da ficha. O aluno escreve, o professor só
lê. Os exercícios vêm da mesma biblioteca, então continuam tendo vídeo, execução
e histórico de carga.
```
listarListaPessoal(alunoId)
adicionarNaListaPessoal({ alunoId, exercicioId, notas })
atualizarItemDaListaPessoal(id, patch)     removerDaListaPessoal(id)
```

**Sessões de treino (frequência)**
```
listarSessoes(alunoId, { de, ate })
abrirSessao(alunoId, diaId, data = hoje())      -- idempotente
concluirSessao(sessaoId, porQuem)
removerSessao(sessaoId)
resumoDaSemana(alunoId, referencia)  -> { inicio, fim, feitos, meta, aderencia, datas }
proximoTreinoSugerido(alunoId)       -- rotação A -> B -> C
```

**Cargas e progressão**
```
listarCargasDaSessao(sessaoId)
registrarSerie({ alunoId, sessaoId, workoutDayExerciseId, exercicioId,
                 serie, peso, reps, duracao, rpe, notas })   -- idempotente por série
ultimaVezNoExercicio(alunoId, exercicioId, ignorarSessaoId)
     -> { data, series[], pesoMaximo }
progressaoDoExercicio(alunoId, exercicioId)
     -> { pontos: [{ data, pesoMaximo, volume, series }], recorde }
exerciciosComHistorico(alunoId)
```

**Anotações** — o `patch` de `atualizarAnotacao` usa **os nomes em português**
(`conteudo`, `fixada`). Qualquer outra chave é ignorada em silêncio: mandar
`{ content, pinned }` não salva nada e não dá erro.
```
listarAnotacoes(alunoId)                 criarAnotacao({ alunoId, conteudo, fixada })
atualizarAnotacao(id, { conteudo, fixada })      removerAnotacao(id)
```

**Fila offline (`js/sync.js`)** — não é camada de dados; é uma casca por cima
dela, usada só pela tela de treino.
```
enfileirarSerie({ alunoId, diaId, data, itemId, exercicioId, serie, peso, reps })
enfileirarConclusao({ alunoId, diaId, data })
seriesNaFila(alunoId, diaId, data)       conclusaoNaFila(alunoId, diaId, data)
pareceFaltaDeRede(err)                   pendentes()
sincronizar()                            ligarSincronizacaoAutomatica()
```

**Pacote de aulas avulsas** — pré-pago. `venderPacote` cria o pacote **e** a
cobrança; `marcarAulaPresencial` é só do professor (garantido por RLS). O saldo
vem de `resumoDoSaldo()` em `utils.js`, que é comprado − consumido.
```
listarPacotes(alunoId)                   venderPacote({ alunoId, aulas, valor, vencimento, notas })
removerPacote(id)                        saldoDeAulas(alunoId)
marcarAulaPresencial(alunoId, data)      listarAulasPresenciais(alunoId)
removerAulaPresencial(id)
```

**Financeiro**
```
listarPagamentos(alunoId)                listarPagamentosDoMes(mes)
darBaixa(pagamentoId, { data, metodo })  reabrirPagamento(pagamentoId)
criarPagamento({ alunoId, mes, valor, vencimento, notas })
gerarCobrancasDoMes(mes)                 -- idempotente
buscarConfiguracaoDeCobranca()           salvarConfiguracaoDeCobranca(patch)
```

`gerarCobrancasDoMes` **lança** a cobrança no sistema; não avisa ninguém. Quem
avisa é o botão "Cobrar no WhatsApp" de cada linha, que monta a mensagem com o
Pix copia e cola (`js/pix.js`) e abre o `wa.me`. São coisas separadas de
propósito: lançar é contabilidade, cobrar é comunicação.

`listarPagamentosDoMes` traz também `aluno` e `telefone`, que a cobrança usa.

O preço fica em `students.monthly_fee`, editado no cadastro do aluno. Mudar o
preço **não** reescreve cobranças já lançadas — cada mês guarda o valor que
valia na época.

**Utilitário de teste**
```
reiniciarDados()                         -- restaura o seed
```

**Regras de domínio exportadas por `db.js` (não são da implementação):**
```
statusPagamento(pagamento, referencia)   -> 'paid' | 'pending' | 'overdue'
ROTULO_STATUS   CLASSE_STATUS
```

### 6.1 Funções que ainda faltam

As fases seguintes vão precisar destas, que **ainda não existem** em nenhuma
implementação. Ao criar, seguir o mesmo padrão:

- `duplicarFicha`, `salvarComoTemplate`
- `reordenarDias`, `reordenarExercicios` (hoje a ordem é a de inserção)

---

## 7. Design system

**Atualização:** além dos tokens abaixo, `css/refinement.css` define o acabamento
atual: superfícies cinza claro, cantos de 10–20px, tipografia maior, logo/fotografia
fornecidas pelo dono e menu inferior no celular. Sem novas cores de interface.

Tokens em `:root` no `css/style.css`. Preto, branco e cinzas — **sem nenhuma cor
de destaque**. Hierarquia vem de tipografia, espaço e preenchimento.

- Cores: `--black #000`, `--ink #111`, `--gray-700/500/400/200/100/50`, `--white`.
- Espaçamento: `--sp-1` (4px) a `--sp-7` (48px).
- `--tap: 48px` — altura mínima de botões e campos. O aluno usa de pé, com uma mão.
- Fonte: Inter, com pesos 400/600/700/800.
- Classes principais: `wrap`, `card`, `card-invert`, `card-link`, `list`/`list-item`, `btn` (+`btn-primary`, `btn-lg`, `btn-sm`, `btn-block`, `btn-ghost`), `field`, `tag` (+`tag-solid`, `tag-quiet`), `alert`, `meter`, `empty`, `eyebrow`, `muted`, `small`, `numeric`, `avatar`, `grid grid-2/grid-3`, `stack`, `row`, `row-between`.

**Regra de acessibilidade:** como não há cor, estado nunca pode depender só dela.
Todo status carrega rótulo em texto e um preenchimento distinto (`tag-solid`
para o que exige ação, `tag-quiet` para o que está resolvido).

Inputs têm `font-size: 16px` de propósito — abaixo disso o iOS dá zoom sozinho
ao focar o campo.

---

## 8. Armadilhas conhecidas

Cada uma destas já foi causa de um erro real no projeto ou está documentada em
`PLANO.md` seção 1. Não as reintroduza.

1. **Data sempre em `America/Sao_Paulo`.** Use `hoje()` de `utils.js`, nunca `new Date().toISOString()`. Treino às 21h de segunda cai na terça em UTC e desloca a frequência do aluno.

2. **Status de pagamento é derivado, nunca armazenado.** Use `statusPagamento()`. Se virar coluna, "vencido" apodrece: uma cobrança vencida fica "pendente" para sempre.

3. **Falta não é registro.** Só se grava treino **feito**. A frequência é calculada contra `weekly_target` do aluno. Não crie linhas de "faltou" — ninguém as criaria na vida real.

4. **A sessão nasce ao abrir o treino, não ao concluir.** As cargas precisam de uma sessão para se pendurar. Só conta presença quem tem `completed_at` preenchido.

5. **`exercise_logs.exercise_id` é redundante de propósito.** Poderia vir via `workout_day_exercise_id`, mas então o histórico morreria quando o professor trocasse a ficha. Gravado direto, "evolução do supino" atravessa qualquer troca de ficha — que é o que faz o recurso valer algo.

6. **Mostrar a última carga ao lado do campo é obrigatório, não enfeite.** Sem ver *"última vez: 20 kg × 10"*, o aluno não sabe o que tentar hoje e o registro vira digitação sem propósito. O campo deve vir pré-preenchido com a última carga, para "18 campos" virarem "dois toques".

7. **Exercício se arquiva, não se apaga.** Apagar removeria o exercício de todas as fichas antigas e levaria o histórico de carga junto.

8. **Sempre `esc()` em texto que vai para `innerHTML`.** Nome de aluno e anotação do professor são texto livre; um `<` no meio de um recado quebra a tela — ou injeta HTML.

9. **O guard do roteador é de navegação, não de privacidade.** Ele impede abrir a tela do outro; quem impede o *dado* de sair são as regras de RLS no banco. As duas coisas continuam separadas — não trate um redirecionamento na tela como prova de que o dado está protegido. Com o Supabase conectado, a barreira real existe e já foi parcialmente verificada (ver seção 2).

10. **Dinheiro é `numeric(10,2)` no banco.** Nunca `float` — R$ 149,90 vira 149.89999999 e as somas não fecham.

11. **Os links de vídeo do `seed.js` são placeholders.** Só um aponta para um vídeo real, e está lá apenas para provar que o player embutido funciona. Devem ser trocados pelos vídeos do Leo na Fase 2.

12. **Foto de exercício vem do vídeo.** `capaDoVideo()` deriva a imagem da capa do YouTube. O professor cola um link só e ganha a foto — não construa upload de foto de exercício antes de considerar isso.

13. **"Lançar cobrança" não é "cobrar".** Lançar cria a linha do mês no banco; quem avisa o aluno é o botão de WhatsApp. Já houve confusão com isso: o professor via um aluno devedor e o botão respondia "todos já têm cobrança neste mês" — estava certo, mas parecia quebrado. Se mudar esse fluxo, mantenha a distinção explícita na tela.

14. **A frequência semanal não é um campo.** É a contagem dos dias marcados nas divisões da ficha. Guardar o número separado faria ele divergir do calendário na primeira edição.

15. **O nome e a cidade do Pix precisam ser ASCII sem acento e dentro do limite.** "João" ou uma cidade com mais de 15 caracteres fazem o banco do aluno recusar o código inteiro. `js/pix.js` normaliza — não contorne isso montando o payload à mão.

16. **Dinheiro na tela é `R$ 0.000,00`, no banco é número.** Use `ligarMascaraDeMoeda()` no campo e `moedaParaNumero()` ao ler o formulário. Não volte a `<input type="number">`: ele mostra "280.5", aceita ponto como decimal e no celular abre o teclado errado.

17. **Nunca use `<input type="date">`.** Ele exibe no formato do sistema operacional, não no da página: num Windows em inglês, `2026-09-12` aparece como `09/12/2026` e o professor lê "9 de dezembro". Use campo de texto com `ligarMascaraDeData()` + `dataBRParaIso()`.

18. **Financeiro do aluno fica na aba dele.** A tela do aluno é usada ao lado do aluno. Não volte a espalhar valor de mensalidade pela aba de treino.

19. **Atenção: esta armadilha já não vale.** Ela dizia que os dados viviam no `localStorage` e não eram compartilhados. Com `DATA_SOURCE = "supabase"` os dados são reais, compartilhados e persistentes — o professor vê o que o aluno salvou. A limitação só volta a valer se alguém trocar de volta para o modo `local`.

20. **Safari PWA tem cache agressivo.** O app instalado na tela inicial do iPhone (via Safari → "Adicionar à tela de início") guarda os arquivos JS e CSS localmente. Uma mudança pode parecer não ter efeito até o usuário fechar o app pelo app switcher (swipe up) e reabrir. Não confunda "não funcionou" com "não deployou" — verificar o commit no GitHub antes de depurar.

21. **Pull to refresh no Safari PWA: escutar no `document`, não no `<main>`.** O scroll no Safari PWA vive no `document`/`body`, não num elemento filho. Escutar `touchstart/move/end` no `<main>` não funciona. Use `document.addEventListener` e verifique o topo com `Math.max(document.documentElement.scrollTop, document.body.scrollTop, window.scrollY)` — as três fontes, porque o Safari varia entre versões. A implementação correta está em `ligarPullToRefresh()` em `js/utils.js`.

22. **Calendário responsivo: nunca use `max-width` fixo na grade.** `max-width: 220px` (ou qualquer valor fixo) faz o calendário ficar pequeno em qualquer tela onde o card é mais largo. O correto é deixar `.calendario-mes` sem `max-width` e sem `margin: 0 auto` — ele ocupa 100% do card e as células se ajustam pelo grid. No mobile, se o card tiver padding, compensar zerando o padding do card e não com margem negativa (que depende de valores externos que mudam com breakpoints).

23. **Nunca esconda texto por breakpoint sem olhar o que mora dentro dele.** O
    convite de instalar o app tinha `.convite-texto .small { display: none }`
    abaixo de 700px, para a faixa não crescer no celular. Só que a instrução do
    iPhone — "toque em Compartilhar e escolha Adicionar à Tela de Início", a
    **única** forma de instalar no iOS, já que lá não existe API — era
    justamente um `.small`. No aparelho, tocar o botão trocava o título e
    escondia a explicação: parecia que o botão não fazia nada. Esconder por
    tamanho de tela só vale para o que é realmente supérfluo; se o conteúdo é a
    razão do componente existir, reorganize o layout em vez de ocultar.

24. **iPhone e Android não cabem no mesmo botão de instalar.** O Android dispara
    `beforeinstallprompt` e abre diálogo nativo; o iOS não tem nada — só o menu
    Compartilhar do Safari. Por isso o convite tem dois modos (`js/app.js`,
    `desenharConviteDeInstalar`), e o do iOS mostra a instrução **já escrita**,
    sem passo intermediário. E o manifest precisa de ícones de 192 e 512: sem
    eles o Chrome nunca considera o site instalável e o evento não dispara, sem
    erro nenhum no console.

25. **Dispensar não pode ser para sempre.** O × da faixa gravava "dispensado"
    sem data e o convite nunca mais voltava — um toque acidental trancava a
    única porta para instalar o app. Agora o silêncio dura 14 dias e existe
    "Instalar na tela inicial" no menu da conta, que traz de volta na hora.
    Qualquer coisa que o usuário possa fechar precisa de um caminho de volta.

---

## 9. Onde paramos e o que fazer a seguir

### Planejamento novo — vários professores (15/09/2026, não implementado)

O dono pediu um dossiê para evoluir para administrador geral, que cadastra
professores, e carteiras isoladas de alunos por professor. **Um professor por
aluno, sem transferência**, por decisão explícita. Professor/aluno mantêm os
fluxos atuais. O pedido foi **planejar e especificar, sem executar**.

A especificação interna, os lotes para outras IAs, critérios de aceite e o
parking lot consolidado começam em
[`log-de-evolucao/dossie-multiprofessor/00-LEIA-PRIMEIRO.md`](log-de-evolucao/dossie-multiprofessor/00-LEIA-PRIMEIRO.md).
Essa pasta é local e ignorada pelo Git; não acompanha clone novo. O código
continua no modelo de um professor descrito abaixo. A antiga equivalência
admin/professor não é isolamento e deverá ser substituída conforme o dossiê,
somente quando a implementação for solicitada.

**Atualizado em 14/09/2026.** As **Fases 4 e 5 estão prontas**: treino do dia
com registro de carga, evolução, frequência e recados — com **fila offline** —
e progressão por exercício no perfil visto pelo professor. O app segue
publicado com 16 alunos fictícios para o Leo (o dono) avaliar.

Uma auditoria corrigiu concorrência e isolamento da fila offline, persistência
antes do envio, eventos de tela, contagem de domingo, calendário histórico,
reenvio dos logs e ativação atômica de ficha. O roteiro permanente de validação
está em [`TESTES.md`](TESTES.md); a análise original está em
[`AUDITORIA.md`](AUDITORIA.md).

### O estado exato

- Antes de publicar, rode o roteiro de `TESTES.md` e confira `git status`.
- Site no ar e verificado contra o banco real.
- Senha do professor **rotacionada** em 12/09/2026, porque a anterior vazou no
  commit público `ed1c875`. A nova está em `CREDENCIAIS.local.md`. A antiga
  segue no histórico do git e não serve mais para nada.
- Chave Pix **propositalmente vazia**: falta o Leo colar a dele em
  `#/professor/perfil`. Nome, cidade e modelo da mensagem já preenchidos.
- As senhas antigas das 16 contas fictícias permanecem no histórico público por
  decisão do dono, mas foram invalidadas em 14/09/2026. As atuais ficam apenas
  em `SENHAS-TESTE.local.md`; o teste de segurança confirma zero senhas atuais
  encontradas no histórico.

### O que fazer a seguir, em ordem de valor

1. **Validar a PWA no Android.** No iPhone, instalação pela tela inicial,
   reabertura sem rede, persistência da fila após fechar o app e sincronização
   ao reconectar foram validadas com o Supabase real em 14/09/2026. A fila
   enviou as séries e concluiu a sessão corretamente. Falta repetir o roteiro
   em um Android e conferir a atualização de versão.
2. **Mídia dos exercícios**: não gerar ilustrações. O professor fornece e anexa
   as fotos ou vídeos conforme preparar o conteúdo.

**AT-01 fechado em 16/09/2026.** “Treinos realizados” foi conferido no app
publicado e por teste read-only contra o Supabase real: relacionamentos
embutidos, duas sessões do mesmo aluno no mesmo dia, cargas com exercício, RLS
do professor sobre a carteira e isolamento entre alunos.

**Lote AT-05/13/16/18 em 16/09/2026.** A sessão agora acompanha logout em outra
aba, revalida ao retomar/reconectar e preserva o uso offline quando a rede não
consegue confirmar o token. O timeout aguarda um ponto seguro se houver treino
aberto ou fila pendente. Logs carregam `release`, código e saneamento central de
senha/token/email/telefone; o teste de segurança passou a falhar se uma senha
atual aparecer no Git e limpa a fixture de Storage em `finally`.

O editor de ficha passou a editar `load_notes` (carga sugerida) e `group_label`
(A1/A2/circuito), exibidos separadamente da carga executada na tela do aluno.
A lista de alunos ganhou filtros combináveis por situação, ficha, treino recente
e mensalidade. No treino, a data é fixada ao abrir/retomar a intenção e o
cronômetro calcula o restante pelo instante final, portanto a suspensão do
navegador não alonga o descanso. O roteiro visual confirmou filtros, prescrição,
cronômetro e logout entre duas abas; contratos reais de smoke, segurança e
histórico passaram contra o Supabase.

### Decisões em aberto (perguntar ao dono, não decidir sozinho)

- A lista de alunos (`#/professor/alunos`) mostra mensalidade e situação de
  pagamento de todo mundo. O perfil do aluno já foi separado em abas por causa
  disso (armadilha 18), mas a lista não. Esconder os valores lá? Foi levantado
  e ficou sem resposta.
- **Login com Google está no plano, mas não está autorizado para implementação.**
  Conversar antes sobre papéis atendidos, vínculo com contas já criadas por
  email/senha, fallback, redirects e testes de RLS. Não habilitar o provedor nem
  preencher/salvar Client ID ou Client Secret antes dessa decisão. O roteiro de
  discussão está em `PLANO.md`, seção 4.
- Ligar a proteção contra senhas vazadas no Supabase — **só existe no plano
  Pro** (US$ 25/mês) e foi recusada por enquanto. A política gratuita já exige
  pelo menos 8 caracteres, maiúscula, minúscula e número.
- Limpar ou manter os 16 alunos fictícios depois da avaliação do Leo.

O roteiro completo das fases está em [`PLANO.md`](PLANO.md) seção 13.

---

## 10. Decisões tomadas

Todas já fechadas com o dono do projeto. O raciocínio completo está em
`PLANO.md` (seções 1 e 12). Resumo para não precisar reabrir a discussão:

| Decisão | Escolha |
|---|---|
| Nome | Leo Personal Trainning |
| Escopo | Um único professor (sem multi-academia) |
| Vídeos | Links do YouTube/Vimeo, sem armazenar arquivo |
| Foto do exercício | Derivada da capa do vídeo |
| Registro de carga / progressão | **Dentro do MVP** |
| Avaliação física (medidas, fotos de evolução) | **Fora de escopo** |
| Login do aluno | Email + senha (sem link mágico) |
| Primeiro acesso | O professor cria a conta no app (Edge Function `criar-aluno`) e entrega email + senha temporária. O convite com código foi descartado. |
| Frequência | Aluno marca, professor pode corrigir |
| Fichas | Uma ativa por aluno, com histórico arquivado |
| Financeiro | Manual, sem gateway; cobranças geradas com um clique por mês |
| Estrutura | Página única com roteador de hash, sem build |
| Back-end | Camada local agora, Supabase na Fase 8 |
| Visual | Preto e branco, mobile-first |

**Decisões de arquitetura que custaram análise e não devem ser revertidas sem
motivo forte:** a interface única de dados (5.1), o status de pagamento
derivado (8.2), a sessão de treino como contêiner das cargas (8.4) e o
`exercise_id` redundante (8.5).

---

## 11. Lovable — tentativa abandonada (histórico)

> **Leia isto antes de mexer na Lovable.** A migração para React foi decidida,
> começada e **revertida na prática**: o dono voltou a trabalhar nesta versão em
> JS puro para não consumir os créditos da Lovable, e foi ela que evoluiu desde
> então — cadastro de alunos, editor de ficha, financeiro, Pix, perfis. **O
> projeto na Lovable ficou para trás e nunca foi conectado ao Supabase do dono.**
>
> Ou seja: o app React lá **não tem** nada do que foi construído depois, e
> aponta para o banco gerenciado da Lovable, não para o banco de verdade.
> Retomar aquele projeto hoje significaria reescrever tudo de novo. Se alguém
> quiser voltar para React, o caminho honesto é começar do zero usando esta
> pasta como especificação — não tentar continuar de onde aquele parou.
>
> A fonte da verdade é esta pasta, publicada em
> https://mdulgher.github.io/App-Fitness/.

O texto abaixo é o registro de como estava quando foi abandonada.

- **Projeto Lovable:** https://lovable.dev/projects/c2aa8a9f-2818-4c41-bd83-3dad893dc3e2
- **Preview:** https://id-preview--c2aa8a9f-2818-4c41-bd83-3dad893dc3e2.lovable.app
- Stack da Lovable: React + TypeScript + Tailwind + shadcn/ui.
- As regras permanentes (visual preto e branco, segurança, as cinco regras de modelagem) foram gravadas no **conhecimento do projeto** na Lovable, para valerem em toda mensagem futura ao agente e não serem revertidas sem querer.

### O que mudou de importante com a migração

A camada de dados local (seções 5.1 e 6) **deixa de existir** no app React: ela
era um contorno para não haver banco. Com o Supabase de verdade desde o começo,
some junto a limitação mais séria da versão anterior — a privacidade passa a ser
real, e o checklist da seção anterior pode (e deve) ser executado agora, não numa
fase futura.

### Estado do banco

Aplicado no Supabase do dono (`azifpaxbeozfooydkzxh`), não no banco gerenciado
da Lovable:

- 11 tabelas, **todas com RLS ligado**, seguindo o modelo do `PLANO.md` seção 6.
- `payments_view` com o status derivado e `security_invoker = true` — sem esse parâmetro a view rodaria com os privilégios do dono e o aluno enxergaria o financeiro dos outros.
- `is_trainer()` como `SECURITY DEFINER` para as políticas não recursarem ao consultar `profiles`.
- `handle_new_user()` cria o perfil no cadastro **sempre como aluno**: não existe caminho para alguém se cadastrar como professor; a promoção é manual, via SQL.
- `role` protegido por permissão de **coluna** (`revoke update ... grant update (full_name, email, phone, avatar_url)`), então nem o professor promove alguém pela API.
- Índices únicos impedindo treino marcado duas vezes no mesmo dia e cobrança duplicada do mesmo mês.

Os avisos de segurança do Supabase foram revisados e corrigidos. Resta **um**,
intencional: `is_trainer()` é executável por usuário logado, porque as políticas
de RLS a chamam no contexto de quem consulta. Ela só revela se você mesmo é o
professor, nada sobre terceiros.

### Pendências que ficaram congeladas

1. **Conectar o Supabase do dono à Lovable** — nunca foi feito. Precisa ser
   feito no painel da Lovable (https://lovable.dev/dashboard?connectors); o MCP
   não adiciona conectores.
2. Criar os usuários de teste lá e promover o do Leo a `trainer`.
3. Rodar o checklist de privacidade.

Os itens 2 e 3 **já foram feitos nesta versão em JS puro**, contra o banco de
verdade: 12 usuários criados pelo fluxo do app e o checklist de privacidade
executado com duas contas de aluno reais, passando em todos os pontos.
