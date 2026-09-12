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

---

## 4. Usuários de teste

Nesta fase **não há senha**: só o email é conferido contra os dados de teste, e
qualquer senha é aceita. A tela de login também tem botões de acesso rápido.

| Papel | Email | Cenário |
|---|---|---|
| Professor | `leo@leopersonal.com` | Vê os três alunos |
| Aluna | `carla@email.com` | Em dia, treinando bem, ficha A/B/C completa + 6 semanas de histórico de carga |
| Aluno | `joao@email.com` | Mensalidade vencida, sem treinar há 10 dias, tem restrição médica (hérnia L5-S1) |
| Aluna | `rafaela@email.com` | Aluna nova, **sem ficha** — serve para testar o estado vazio |

Na barra preta do topo há **"Recarregar dados"**, que restaura o estado inicial.

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
#/professor              #/aluno
#/professor/alunos       #/aluno/treino/:diaId
#/professor/aluno/:id    #/aluno/evolucao
#/professor/exercicios   #/aluno/frequencia
#/professor/financeiro   #/aluno/anotacoes
                         #/aluno/financeiro
```

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
```

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
```

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

- `criarFicha`, `atualizarFicha`, `ativarFicha` (arquivando a anterior), `duplicarFicha`, `salvarComoTemplate`
- `criarDiaDeTreino`, `atualizarDiaDeTreino`, `removerDiaDeTreino`, `reordenarDias`
- `adicionarExercicioAoDia`, `atualizarExercicioDoDia`, `removerExercicioDoDia`, `reordenarExercicios`
- `gerarConvite(alunoId)` e `usarConvite(email, codigo, senha)` — Fase 8
- `desativarAluno(id)`

---

## 7. Design system

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

9. **O guard do roteador é de navegação, não de privacidade.** Ele impede abrir a tela do outro, mas a camada de dados entregaria os dados se alguém pedisse pelo console. A barreira real são as regras do banco, na Fase 8. Não confunda as duas coisas nem trate o app como seguro antes disso.

10. **Dinheiro é `numeric(10,2)` no banco.** Nunca `float` — R$ 149,90 vira 149.89999999 e as somas não fecham.

11. **Os links de vídeo do `seed.js` são placeholders.** Só um aponta para um vídeo real, e está lá apenas para provar que o player embutido funciona. Devem ser trocados pelos vídeos do Leo na Fase 2.

12. **Foto de exercício vem do vídeo.** `capaDoVideo()` deriva a imagem da capa do YouTube. O professor cola um link só e ganha a foto — não construa upload de foto de exercício antes de considerar isso.

13. **Os dados vivem no `localStorage` daquele navegador.** Celular e computador têm conjuntos separados, e nada é compartilhado entre professor e aluno. Isso só muda na Fase 8. Não construa nada que dependa de o professor "ver o que o aluno acabou de salvar" antes disso.

---

## 9. Próximo passo

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
| Primeiro acesso | Convite com código; o aluno define a própria senha |
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
