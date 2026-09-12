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
só o que é seu). Feito em HTML/CSS/JS puro, sem build, sem framework. O
back-end (Supabase) só entra na Fase 8 — até lá tudo roda numa camada de dados
local.

---

## 2. Estado atual

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
- **12 alunos de teste** no banco, com frequência, mensalidades e cobranças de
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
- O botão de cobranças virou **"Lançar cobranças do mês"** e agora explica o que
  fez, inclusive quem ficou de fora por não ter mensalidade cadastrada. Antes
  ele dizia só "todos já têm cobrança" e parecia quebrado.

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

As telas anteriormente marcadas como fases futuras **continuam pendentes**.
Redesign não implementa registro de séries, editor de ficha ou financeiro.
Referências pesquisadas, sugestões e prioridades em `REDESIGN.md`.

### Estado funcional anterior (mantido como histórico)

> **O app em JS puro está LIGADO AO SUPABASE DE VERDADE** (`DATA_SOURCE =
> "supabase"` em `js/config.js`). Os dados não vivem mais no navegador: são
> reais, compartilhados e persistentes. O app em si continua rodando de
> `localhost` — não está hospedado em lugar nenhum.
>
> A troca de `local` para `supabase` custou **uma linha** e nenhuma tela foi
> alterada. É a prova da regra da seção 5.1; mantenha-a.
>
> Já verificado no navegador, contra o banco real: cadastro cria o perfil
> **sempre como aluno**; login por senha funciona e o papel vem do banco;
> tentar mudar o próprio `role` pela API é recusado (`permission denied for
> table profiles`); a view de pagamentos respeita RLS. Falta testar com **dois
> alunos reais** o isolamento entre eles (itens 1 a 4 e 7 do checklist).
>
> **Conta do professor:** `leo@leopersonal.com` / `LeoTreino2026!`
> **Biblioteca:** 20 exercícios já cadastrados, com how-to escrito.
>
> **Pendência conhecida:** o Supabase está exigindo confirmação de email, o que
> trava todo aluno novo. Desligar em Authentication → Providers → Email →
> "Confirm email" — resolvido: a Edge Function cria a conta já confirmada.

**Fase 0 (Base local) — concluída e testada no navegador.**

Funcionando:

- Tela de login, com atalhos de acesso rápido para teste.
- Separação por papel: professor e aluno caem em áreas diferentes.
- Painel do professor com alertas por exceção (aluno sumido, mensalidade vencida, aluno sem ficha, ficha vencendo).
- Lista de alunos com busca.
- Perfil do aluno (leitura): dados, restrições médicas em destaque, ficha A/B/C com bi-set, anotações, financeiro.
- Painel do aluno: frequência da semana, sugestão do próximo treino na rotação, lista de treinos, recados fixados.
- Camada de dados local completa (inclusive progressão de carga, que ainda não tem tela).
- Dados de teste realistas, com 6 semanas de histórico de treino e carga.

Ainda **não** existe (e o roteador mostra um aviso honesto de "entra na Fase N"):

- Cadastro/edição de aluno (Fase 1)
- Biblioteca de exercícios (Fase 2)
- Editor de ficha (Fase 3)
- Treino do dia com registro de carga, evolução, frequência, anotações e financeiro do aluno (Fase 4)
- Aba de progressão do professor (Fase 5)
- Financeiro do professor (Fase 6)
- Acabamento e PWA (Fase 7)
- Supabase (Fase 8) e hospedagem (Fase 9)

---

## 3. Como rodar

Abrir o `index.html` com dois cliques **não funciona**: em `file://` os módulos
JS e o `fetch` quebram por CORS. Sempre por servidor HTTP, na pasta do projeto:

```bash
npx serve . -l 5173
```

Depois abrir `http://localhost:5173`. Para testar no celular (mesmo Wi-Fi), usar
o IP da máquina na rede, ex.: `http://192.168.15.45:5173`.

### Publicação

Não há site publicado desta versão em JS puro. O GitHub Pages chegou a ser ligado
e foi **desligado a pedido do dono do projeto**; o repositório
(https://github.com/mdulgher/App-Fitness) segue existindo apenas como cópia.

O projeto migrou para a **Lovable**, reescrito em React — ver seção 11.

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

---

## 4. Usuários de teste

Contas **reais no Supabase** (`DATA_SOURCE = "supabase"`). Todas com senha de
verdade; o aluno pode trocar a dele em "Meu cadastro".

| Papel | Email | Senha | Cenário |
|---|---|---|---|
| **Professor** | `leo@leopersonal.com` | `LeoTreino2026!` | Vê os 12 alunos |
| Aluna | `carla.mendes@email.com` | `s5WGvgbBwtW2` | Mensalidade vencida, ficha ABC ativa (Seg·Qui / Ter·Sex) |
| Aluno | `joao.batista@email.com` | `b4t3g7TYJWPj` | Pago, restrição médica (hérnia L5-S1), lista pessoal com 1 exercício |
| Aluna | `ana.souza@teste.com` | `AnaTreino2026` | Em dia, treinando bem (3/4 na semana) |
| Aluno | `bruno.carvalho@teste.com` | `x52sGABpVu9H` | Vencido, treinando pouco (1 na semana) |
| Aluna | `camila.ribeiro@teste.com` | `ACveFtfMcqwp` | Pago, **única que bate a meta** (5/5) |
| Aluno | `diego.fernandes@teste.com` | `8eLd8HsXphvC` | Vencido, **sem treinar há ~3 semanas**, tendinite no ombro |
| Aluna | `eduarda.lima@teste.com` | `QA69BZZ2s9xb` | A vencer (dia 20), **nunca treinou**, pós-operatório de joelho |
| Aluno | `felipe.andrade@teste.com` | `9qMnErUJz7dB` | Pago, frequência média |
| Aluna | `gabriela.nunes@teste.com` | `XmDbqGUMRudM` | Vencido, treinou hoje |
| Aluno | `henrique.tavares@teste.com` | `MjMV4pwjCu9V` | Pago, alta frequência |
| Aluna | `isabela.moreira@teste.com` | `wwaTZvfSN7tG` | A vencer (dia 25), parou há ~10 dias |
| Aluno | `rafael.pimentel@teste.com` | `C4BNAxu7Yhzx` | **Sem mensalidade cadastrada** — fica de fora da geração de cobranças |

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

Rotas ainda não construídas apontam para `views/em-construcao.js`, que mostra em
que fase a tela entra. Ao construir uma tela, troque o `view:` da rota e remova
o `fase:`.

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
`fichaAtiva()`, que usa `maybeSingle()`.
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

**Anotações**
```
listarAnotacoes(alunoId)                 criarAnotacao({ alunoId, conteudo, fixada })
atualizarAnotacao(id, patch)             removerAnotacao(id)
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

---

## 9. Próximo passo

**Atualizado em 12/09/2026.** As Fases 1 e 3 estão feitas: cadastro e edição de
aluno, editor de ficha com agenda semanal, lista pessoal do aluno e cobrança por
WhatsApp/Pix. O que falta, em ordem de valor:

1. **Treino do dia do aluno** (`#/aluno/treino/:diaId`, hoje em construção) com
   registro de carga e a última carga ao lado do campo — ver armadilha 6.
2. **Frequência** e **Minha evolução** do aluno: a camada de dados já entrega
   `resumoDaSemana` e `progressaoDoExercicio`; falta só a tela.
3. **Recados** (`#/aluno/anotacoes`) e a escrita de anotações pelo professor.
4. Ilustrações vetoriais para os outros exercícios (só o supino tem).

Após o redesign de 12/09/2026: revisar a prévia visual e seguir as prioridades em
`REDESIGN.md`. O maior ganho de produto está em completar o treino do dia com
registro rápido e última carga, junto ao editor de fichas. Validar também qual
versão será mantida (esta pasta ou React/Lovable) antes da próxima fase funcional.
O plano anterior abaixo permanece como referência; não houve implementação das
fases funcionais nesta rodada.

**Fase 1 — Professor: alunos.** Cadastro e edição de aluno, e o perfil deixando
de ser só leitura.

Pronto quando: o professor cria um aluno pela tela, edita os dados dele
(inclusive meta semanal, mensalidade, dia de vencimento e restrições médicas) e
o aluno novo aparece corretamente no painel com o estado vazio ("sem ficha",
"sem treinos").

Precisa criar: formulário de aluno (novo e edição), e usar `criarAluno` /
`atualizarAluno`, que já existem em `db-local.js`.

Alternativa igualmente válida: pular para as **Fases 2 e 3** (biblioteca de
exercícios e editor de ficha), que é onde o professor passa mais tempo e o que
dá mais valor visível mais rápido. A Fase 1 pode ser feita depois, já que os
dados de teste cobrem o cadastro.

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

## 11. Migração para React na Lovable (em andamento)

O dono do projeto decidiu abandonar a versão em JS puro e reconstruir o app em
React na Lovable. A versão em JS puro continua nesta pasta como referência
funcional e, principalmente, **como especificação**: foi de onde saíram o modelo
de dados, as regras e as armadilhas que alimentaram a migração.

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

### Pendências

1. **Conectar o Supabase do dono à Lovable** — precisa ser feito no painel da Lovable (https://lovable.dev/dashboard?connectors); o MCP não adiciona conectores. Enquanto isso não acontece, o agente está construindo contra o banco gerenciado da Lovable.
2. **Criar os usuários de teste** por cadastro real no app e promover o do Leo a `trainer` via SQL. Não há como semear usuários direto na tabela: `profiles.id` referencia `auth.users`, e inserir ali na mão é frágil.
3. **Rodar o checklist de privacidade** (seção anterior) com dois alunos reais logados.
