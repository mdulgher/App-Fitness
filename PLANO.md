# Leo Personal Trainning — Plano do Projeto (v3)

> **Este arquivo é o produto: decisões, modelo de dados, telas e fases.**
> Para o estado atual do código, a arquitetura, o contrato da camada de dados e
> as armadilhas conhecidas, veja [`CONTEXTO.md`](CONTEXTO.md) — é por lá que
> uma nova sessão de trabalho deve começar.
>
> **v3** incorpora as decisões tomadas: nome do app definido, registro de carga
> entra no MVP, avaliação física fica fora, login só por senha, e o app vira
> página única com roteador. A seção 1 mantém o registro do que estava errado
> na v1 e por quê.

---

## 1. Correções e melhorias sobre a v1

### Coisas que estavam erradas

| # | Problema na v1 | Correção |
|---|---|---|
| 1 | **"Professor cadastra o aluno com email + senha temporária"** — *impossível* a partir do navegador. Criar usuário em nome de outra pessoa exige a `service_role` key, que **nunca** pode ficar no front-end (quem abrir o DevTools vira admin do banco). | **Convite com código**: professor pré-cadastra o aluno, o aluno faz o primeiro acesso com email + código e define a própria senha. Zero código de servidor, zero chave secreta exposta. Seção 5. |
| 2 | **`payments.status` armazenado como coluna.** "Vencido" depende da data de *hoje* — guardado no banco, apodrece: uma cobrança vencida fica marcada como "pendente" para sempre, a menos que algo rode todo dia para corrigir. | Status **derivado** na consulta, via *view* do Postgres. Impossível ficar desatualizado. |
| 3 | **`attendance.status = 'missed'`** — ninguém nunca criaria essas linhas. Falta não é um evento registrado; é a *ausência* de registro. A frequência sairia sempre errada. | Grava-se só treino **feito**. Falta é inferida contra a **meta semanal** do aluno (`weekly_target`). Sem meta, "frequência" não significa nada: 3 treinos é ótimo para quem mira 3 e ruim para quem mira 5. |
| 4 | **Alunos não veriam nenhum vídeo.** A regra "aluno só vê as próprias linhas" bloquearia a tabela `exercises`, que não pertence a ninguém. A ficha abriria sem vídeo, sem foto e sem how-to. | `exercises` tem regra própria: leitura para qualquer usuário logado, escrita só do professor. |
| 5 | **Nada impedia um aluno de virar professor.** Perfil criado no cadastro + usuário podendo editar o próprio perfil = ele muda `role` para `trainer` e abre os dados e o financeiro de todos. | `role` é gravado pelo banco na criação da conta e **não é editável pelo usuário**. Falha de escalonamento de privilégio fechada. |
| 6 | **Abrir o `index.html` com dois cliques não funciona.** Em `file://` o login, o `fetch` e os módulos JS quebram por CORS/origem nula. O primeiro teste pareceria "app bugado". | Roda obrigatoriamente em servidor HTTP local — uma linha de comando, seção 9. |
| 7 | **Dinheiro sem tipo definido.** Se virar `float`, R$ 149,90 vira 149.89999999 e as somas não fecham. | `numeric(10,2)`, sempre. |
| 8 | **Duplicatas livres**: dava para marcar o mesmo treino 5× no mesmo dia e gerar duas cobranças do mesmo mês. | Restrições de unicidade no banco. |
| 9 | **Fuso ignorado.** Treino às 21h de segunda, em UTC, cai na terça — frequência deslocada. | Data de "hoje" sempre em `America/Sao_Paulo`. |
| 10 | **Apagar um exercício o removeria de todas as fichas** onde aparece. | Exercício é **arquivado**, nunca apagado. Fichas antigas seguem íntegras. |

### Melhorias incorporadas

**11. Página única com roteador** *(decidido)* — em vez de ~10 arquivos HTML, um
`index.html` com navegação por hash (`#/professor/alunos`). Dá menos código no
total (login e menu não se repetem em dez arquivos), elimina o "pisca" de tela
antes da verificação de login, e migra mais fácil para o Lovable depois.
Continua HTML/CSS/JS puro, sem build.

**12. Restrições médicas e lesões** — campo dedicado, em destaque no topo da
ficha. Um personal precisa saber "hérnia de disco L5, sem agachamento livre"
*antes* de prescrever. Era lacuna séria para o uso real.

**13. Duplicar ficha e templates.** Fichas são ~80% iguais entre alunos do mesmo
objetivo. Sem isso, o professor remonta tudo exercício por exercício a cada
aluno novo — e é aí que ele abandona o app.

**14. Dashboard por exceção.** O topo mostra o que precisa de ação: *"Carla não
treina há 9 dias"*, *"3 mensalidades vencidas"*, *"ficha do João expirou"*. É o
que separa uma ferramenta de um cadastro.

**15. Bi-set e circuito.** Campo de grupo (`A1`, `A2`) para "supino + crucifixo
em sequência, sem descanso". Sem isso não é possível escrever um treino que
qualquer personal escreveria.

**16. Sugestão do próximo treino na rotação** A→B→C, com base no último feito.

**17. Vídeo tocando dentro do app.** Links do YouTube chegam em formatos
diferentes (`watch?v=`, `youtu.be/` e **Shorts**, que é o que personal trainer
mais usa). O app normaliza qualquer um e toca embutido, sem jogar o aluno para
fora no meio do treino.

**18. Funciona com internet ruim.** Subsolo de academia não tem sinal. A ficha
fica guardada no aparelho e o que o aluno escreve (treino concluído e **cargas**)
entra numa fila para enviar quando a conexão voltar. Mais um manifesto PWA para
instalar na tela inicial e abrir como aplicativo.

**19. Checklist de teste de privacidade.** Você pediu financeiro visível só ao
aluno e ao professor. Sem servidor próprio, isso depende 100% das regras do
banco — e regra escrita errada **falha em silêncio**, sem erro na tela. Virou
teste obrigatório, seção 11.

**20. Registro de carga entra no MVP** *(decidido)*. O aluno anota o peso que
realmente usou e o professor acompanha a evolução. É a decisão de maior impacto
no projeto: a tela de treino do aluno deixa de ser só leitura e passa a
escrever dados durante o treino — justamente no pior lugar de conexão. O
desenho está na seção 6.4 e tem duas sutilezas que definem se o recurso
funciona ou não.

**21. Avaliação física (medidas e fotos) fica fora** *(decidido)*. Não há
tabela, tela nem bucket para isso. Se um dia entrar, entra como projeto
próprio — fotos de corpo são dado sensível e mudam o nível de cuidado exigido.

---

## 2. Visão Geral

**Leo Personal Trainning** — app web (celular e computador) para **um** personal
trainer gerenciar seus alunos:

- Montar **fichas de treino personalizadas**, com vídeo, foto e how-to em cada exercício.
- **Acompanhar a frequência** de cada aluno.
- **Acompanhar a progressão de carga** de cada aluno.
- Deixar **anotações gerais** para o aluno ler.
- Controlar o **financeiro**, visível apenas ao aluno e ao professor.

O aluno entra na própria conta, vê a ficha, **registra as cargas durante o
treino**, marca o treino como concluído, lê os recados e consulta sua situação
financeira.

**Decisões fechadas:**

| Item | Decisão |
|---|---|
| Nome do app | **Leo Personal Trainning** |
| Vídeos dos exercícios | Links do YouTube/Vimeo (sem armazenar vídeo) |
| Escopo | Um único professor |
| Financeiro | Controle manual, sem pagamento online |
| Registro de carga / progressão | **Incluído no MVP** |
| Avaliação física (medidas/fotos) | **Fora de escopo** |
| Login do aluno | **Email + senha** (sem link mágico) |
| Estrutura do código | **Página única com roteador de hash** |
| Stack | HTML + CSS + JS puro, sem build |
| Backend | **Camada local agora**, Supabase depois (seção 9.1) |
| Visual | Preto e branco |
| Fase atual | Tudo local, para testar |
| Hospedagem | Lovable ou Git — depois |

---

## 3. Perfis de Usuário

### Professor (`trainer`) — uma conta só
- Vê e edita **tudo**.
- Cadastra alunos e gera o convite de primeiro acesso.
- Mantém a **biblioteca de exercícios**, reaproveitável entre todas as fichas.
- Monta fichas, duplica fichas, salva fichas como template.
- Vê frequência de todos e pode corrigir registros.
- **Vê a progressão de carga** de cada aluno por exercício.
- Escreve anotações por aluno.
- Lança e dá baixa em mensalidades.

### Aluno (`student`) — uma conta por aluno
- Vê **somente os próprios dados**.
- Consulta a ficha ativa: exercícios com vídeo, foto, how-to, séries, repetições, carga sugerida e descanso.
- **Registra a carga e as repetições que fez**, série por série.
- Marca o treino como concluído.
- Vê o próprio histórico de frequência e a **própria evolução de carga**.
- Lê as anotações do professor (sem editar).
- Vê a própria situação financeira (sem editar).

### Regra central de acesso
Aluno nunca alcança dado de outro aluno. Professor alcança todos. Isso é
garantido **no banco de dados** (Row Level Security do Postgres), não na tela —
a tela é código aberto rodando no celular do aluno e pode ser contornada.

---

## 4. Autenticação

- Uma tela de login: **email + senha** (Supabase Auth).
- Depois de entrar, o app lê o perfil e manda para a área do professor ou do aluno.
- "Esqueci minha senha" pelo fluxo de email padrão do Supabase.
- A conta do professor é criada por nós, direto no painel do Supabase. Não existe tela pública de "criar conta de professor" — seria convite a intrusos.

**Ponto de segurança:** o tipo de conta (`role`) é gravado pelo banco na criação
e não pode ser alterado pelo usuário. Sem isso, um aluno se promoveria a
professor e abriria os dados e o financeiro de todos os outros.

---

## 5. Primeiro acesso do aluno (convite)

Este era o ponto errado da v1. O desenho correto, sem servidor e sem chave secreta:

1. **Professor** cadastra o aluno: nome, email, meta semanal, objetivo, restrições médicas, valor da mensalidade e dia de vencimento. O sistema gera um **código de convite** curto (ex: `KX4T-9P2M`).
2. Professor manda o código pelo WhatsApp, junto com o link do app.
3. **Aluno** abre o app, clica em "Primeiro acesso", digita **email + código** e **escolhe a própria senha**.
4. O banco confere se email e código batem com um convite em aberto. Se sim, cria o perfil já com o tipo `student`, vincula ao cadastro feito pelo professor e queima o convite (uso único, com prazo de validade).

Assim: o aluno define a própria senha (o professor nunca conhece senha de
ninguém), nenhuma chave privilegiada aparece no navegador, e ninguém se
cadastra sem convite.

Para os **primeiros testes**, criamos 2–3 usuários direto no painel do Supabase;
o fluxo de convite entra na Fase 1.

---

## 6. Modelo de Dados

Notação: `PK` chave primária, `FK` chave estrangeira, `→` referência.

### 6.1 Pessoas

```
profiles                      -- um registro por conta de login
  id            uuid PK       → auth.users.id
  role          text          -- 'trainer' | 'student'  (NÃO editável pelo usuário)
  full_name     text
  email         text
  phone         text
  avatar_url    text
  created_at    timestamptz

students                      -- dados de treino/perfil do aluno
  id                    uuid PK → profiles.id
  birth_date            date
  goal                  text          -- "hipertrofia", "emagrecimento", "condicionamento"
  height_cm             int
  start_weight_kg       numeric(5,2)
  health_restrictions   text          -- lesões, cirurgias, limitações. Em destaque na ficha.
  weekly_target         int           -- treinos/semana combinados. Base do cálculo de frequência.
  monthly_fee           numeric(10,2)
  due_day               int           -- dia do vencimento (1-28)
  active                bool          -- ativo / trancado
  created_at            timestamptz

student_invites               -- convites de primeiro acesso (seção 5)
  id            uuid PK
  student_id    uuid FK → students.id
  email         text
  code          text UNIQUE
  used_at       timestamptz   -- null = ainda válido
  expires_at    timestamptz
```

### 6.2 Treino

```
exercises                     -- biblioteca reaproveitável
  id            uuid PK
  name          text
  muscle_group  text          -- peito, costas, perna, ombro, braço, core, cardio
  equipment     text          -- livre, máquina, halter, barra, peso do corpo
  video_url     text          -- link YouTube/Vimeo, normalizado na exibição
  photo_url     text          -- imagem no Supabase Storage
  how_to        text          -- execução passo a passo
  archived      bool          -- arquivado, nunca apagado
  created_at    timestamptz

workout_plans                 -- fichas
  id            uuid PK
  student_id    uuid FK → students.id   -- null quando for TEMPLATE
  is_template   bool
  title         text          -- "Ficha A — Hipertrofia Superior"
  description   text
  start_date    date
  end_date      date          -- null = sem prazo
  active        bool          -- no máximo UMA ficha ativa por aluno
  created_at    timestamptz
  updated_at    timestamptz

workout_days                  -- divisões dentro da ficha
  id                  uuid PK
  workout_plan_id     uuid FK → workout_plans.id
  label               text    -- "Treino A — Peito/Tríceps"
  order_index         int
  weekday_suggestion  text    -- opcional: "seg/qui"

workout_day_exercises         -- exercícios de cada divisão
  id              uuid PK
  workout_day_id  uuid FK → workout_days.id
  exercise_id     uuid FK → exercises.id
  order_index     int
  group_label     text        -- "A1"/"A2" para bi-set e circuito; null = isolado
  sets            int
  reps            text        -- "10-12", "até a falha", "30s"
  rest_seconds    int
  load_notes      text        -- carga sugerida pelo professor: "20kg", "moderada"
  trainer_notes   text        -- observação daquele exercício naquela ficha
```

### 6.3 Sessões de treino (frequência)

Com o registro de carga no MVP, a frequência deixa de ser um simples "marquei
que fiz" e passa a ser uma **sessão** que começa, recebe as cargas e termina —
porque as cargas precisam se pendurar em algum lugar.

```
attendance                    -- uma SESSÃO de treino. Falta = ausência de registro.
  id              uuid PK
  student_id      uuid FK → students.id
  workout_day_id  uuid FK → workout_days.id   -- qual divisão foi feita
  date            date          -- data em America/Sao_Paulo
  completed_at    timestamptz   -- null = sessão em andamento
  marked_by       text          -- 'student' | 'trainer'  (auditoria)
  created_at      timestamptz

  UNIQUE (student_id, date, workout_day_id)   -- não marca o mesmo treino 2x no dia
```

Fluxo: o aluno abre o treino do dia → o app cria a sessão → as cargas são
gravadas conforme ele treina → ao final ele toca em "concluir treino" e
`completed_at` é preenchido.

Frequência conta apenas sessões **com `completed_at` preenchido** — treino
aberto e abandonado não vira presença. Aderência da semana = sessões concluídas
÷ `weekly_target`.

### 6.4 Registro de carga / progressão  ← novo no MVP

```
exercise_logs                 -- o que o aluno REALMENTE fez, série por série
  id                        uuid PK
  student_id                uuid FK → students.id
  attendance_id             uuid FK → attendance.id          -- a sessão
  workout_day_exercise_id   uuid FK → workout_day_exercises.id  (ON DELETE SET NULL)
  exercise_id               uuid FK → exercises.id           -- ver "sutileza 1"
  set_number                int
  weight_kg                 numeric(6,2)  -- null em peso corporal
  reps_done                 int           -- null em exercício por tempo
  duration_seconds          int           -- prancha, esteira, isometria
  rpe                       int           -- esforço percebido 1-10 (opcional)
  notes                     text
  created_at                timestamptz

  UNIQUE (attendance_id, workout_day_exercise_id, set_number)
```

**Sutileza 1 — `exercise_id` guardado de propósito, mesmo sendo redundante.**
Poderia ser alcançado via `workout_day_exercise_id`, mas então o histórico
morreria junto com a ficha: quando o professor trocasse a ficha do aluno, a
evolução do supino se perderia. Gravando o exercício direto, *"evolução do
supino nos últimos 6 meses"* atravessa quantas trocas de ficha houver — que é o
único jeito de o recurso ter valor. Por isso também o `ON DELETE SET NULL`:
tirar um exercício da ficha não apaga o que o aluno levantou.

**Sutileza 2 — mostrar a última carga ao lado do campo é obrigatório, não
enfeite.** O aluno precisa ver *"última vez: 20 kg × 10"* junto do campo de
entrada. Sem essa referência ele não sabe o que tentar hoje, e o recurso vira
digitação sem propósito. Com ela, o app pré-preenche cada série com a carga da
última sessão e o aluno só toca quando algo muda — o que transforma "18 campos
para preencher" em "dois toques". É a diferença entre o recurso ser usado e ser
abandonado na segunda semana.

Métricas derivadas (calculadas, nunca armazenadas): carga máxima por exercício,
volume da sessão (séries × reps × carga), recorde pessoal, evolução por
semana/mês.

**Este é o dado mais exposto a conexão ruim de todo o app** — é escrito no meio
do treino, no subsolo. A fila offline da melhoria 18 existe principalmente por
causa dele.

### 6.5 Anotações

```
notes
  id            uuid PK
  student_id    uuid FK → students.id
  content       text
  pinned        bool          -- fixa no topo para o aluno
  created_at    timestamptz
```

### 6.6 Financeiro

```
payments
  id                uuid PK
  student_id        uuid FK → students.id
  reference_month   date          -- sempre dia 1 do mês de referência
  amount            numeric(10,2) -- nunca float
  due_date          date
  paid_date         date          -- null = não pago. ÚNICA fonte da verdade.
  payment_method    text          -- pix, dinheiro, transferência (livre)
  notes             text
  created_at        timestamptz

  UNIQUE (student_id, reference_month)  -- sem cobrança duplicada do mesmo mês
```

**O status não é armazenado**, é calculado numa view:

```
payments_view  =  payments + status:
    paid_date preenchido            → 'paid'
    vazio e due_date >= hoje        → 'pending'
    vazio e due_date <  hoje        → 'overdue'
```

Assim "vencido" é sempre verdade no momento da consulta, sem nada rodando em
segundo plano.

**Geração das cobranças:** um botão "gerar cobranças do mês" cria de uma vez uma
linha para cada aluno ativo, usando `monthly_fee` e `due_day`. Um clique por
mês, sem tarefa agendada. A restrição de unicidade garante que clicar duas
vezes não duplica.

### 6.7 Regras de acesso ao banco (RLS), por tabela

| Tabela | Professor | Aluno |
|---|---|---|
| `profiles` | tudo | lê o próprio; edita nome/telefone/foto; **nunca** `role` |
| `students` | tudo | lê só o próprio registro |
| `student_invites` | tudo | nenhum acesso direto (validado pelo banco no primeiro acesso) |
| `exercises` | tudo | **lê todos** (precisa, para ver vídeo/how-to); não escreve |
| `workout_plans` / `_days` / `_day_exercises` | tudo | lê apenas o que pertence às próprias fichas |
| `attendance` | tudo | lê as próprias; **cria e conclui as próprias**; não apaga |
| `exercise_logs` | tudo (pode corrigir) | lê os próprios; **insere e edita os próprios**; não alcança de ninguém |
| `notes` | tudo | lê as próprias; não escreve |
| `payments` | tudo | lê as próprias; não escreve |

Toda tabela nasce com RLS ligado e **nenhuma** política — cada política é
escrita explicitamente. O padrão é negar.

---

## 7. Telas — Professor

**1. Login**

**2. Dashboard**
- **Precisa de atenção** (topo): alunos sem treinar há N dias, mensalidades vencidas, fichas vencendo/vencidas.
- Lista de alunos: nome, foto, frequência da semana, situação financeira, ativo/inativo.
- Busca e filtros (ativos, inadimplentes, sem ficha).
- "Novo aluno".

**3. Perfil do aluno** (centro de tudo, em abas)
- **Dados**: cadastro, meta semanal, objetivo, **restrições médicas em destaque**, valor e vencimento, gerar/reenviar convite.
- **Ficha**: ficha ativa, editar, criar nova, **duplicar de outro aluno ou de template**, histórico de fichas.
- **Frequência**: calendário do mês, aderência vs. meta, correção de registros.
- **Progressão**: por exercício, evolução da carga ao longo do tempo (gráfico simples), recorde, últimas sessões com as cargas de cada série. É aqui que o professor decide se aumenta o peso na próxima ficha.
- **Anotações**: lista + nova, com opção de fixar.
- **Financeiro**: mensalidades do aluno, "marcar como pago", cobrança avulsa.

**4. Editor de ficha**
- Cria as divisões (Treino A, B, C…).
- Adiciona exercícios buscando na biblioteca, ou cadastra um novo sem sair da tela.
- Define séries, repetições, descanso, carga sugerida e observação por exercício.
- Agrupa em bi-set/circuito (`A1`, `A2`).
- Reordena exercícios e divisões.
- **Salvar como template** e **duplicar ficha**.
- Ativar uma ficha arquiva a anterior automaticamente (histórico preservado).

**5. Biblioteca de exercícios**
- Grade com foto, nome e grupo muscular.
- Cadastrar/editar: nome, grupo, equipamento, link do vídeo, foto, how-to.
- Busca por nome, filtro por grupo muscular.
- Arquivar (nunca apagar).

**6. Financeiro geral**
- Todos os alunos com a situação do mês, filtro por status, total previsto vs. recebido.
- "Gerar cobranças do mês".

## 8. Telas — Aluno

**1. Login / Primeiro acesso** (email + código de convite)

**2. Dashboard**
- **Treino sugerido para hoje** (próximo da rotação A→B→C).
- Divisões da ficha em cards.
- Frequência da semana ("3 de 4 treinos").
- Recados do professor, fixados em destaque.

**3. Treino do dia** — a tela mais importante do app: usada de pé, na academia, com uma mão, com sinal ruim
- Exercícios com foto, séries, reps, descanso e carga sugerida.
- **Vídeo toca dentro do app**, sem jogar o aluno para o YouTube.
- How-to em texto, recolhível.
- Restrições médicas visíveis quando houver.
- Bi-sets visualmente agrupados.
- **Registro de carga por série**, com *"última vez: 20 kg × 10"* ao lado e o campo já pré-preenchido com a última carga (ver sutileza 2 da seção 6.4).
- Botão grande **"concluir treino"**.
- Legível e utilizável **sem internet** — a ficha vem do aparelho e o que for escrito espera na fila.

**4. Minha evolução** — por exercício, carga ao longo do tempo e recorde pessoal. É o que faz o aluno voltar ao app.

**5. Frequência** — calendário do mês, treinos concluídos, aderência vs. meta, sequência atual.

**6. Anotações** — recados do professor, somente leitura.

**7. Financeiro** — situação atual (em dia / a vencer / vencido), histórico e datas. Somente leitura.

---

## 9. Estrutura Técnica

### 9.1 Sem Supabase agora: camada de dados trocável

O app é construído inteiro contra uma **camada de dados local** e o Supabase
entra só na Fase 8. Isso permite montar e testar todas as telas sem depender de
conta, internet ou banco.

O truque é que as telas nunca falam com o banco diretamente. Elas chamam
funções (`db.listarAlunos()`, `db.fichaAtiva(alunoId)`, `db.registrarSerie(...)`),
e existem duas implementações com a **mesma assinatura**:

```
js/db.js            -- escolhe a implementação conforme config.js
js/db-local.js      -- guarda tudo no localStorage do navegador   (agora)
js/db-supabase.js   -- fala com o Supabase                        (Fase 8)
```

Trocar é mudar uma linha em `config.js`. Nenhuma tela precisa ser reescrita.

**O que a camada local reproduz bem:** todas as telas, todo o fluxo, o registro
de carga com histórico, os cálculos de frequência e progressão, o financeiro.
Dá para usar o app de ponta a ponta.

**O que ela não reproduz — e é importante não se enganar:**

- **Privacidade.** Aluno não ver dado de outro aluno é, na versão local, uma decisão do meu JavaScript — exatamente o que a seção 11 diz que não se pode confiar, porque roda no aparelho do aluno. A garantia real só existe com as regras do banco. Por isso o checklist da seção 11 só é **executado na Fase 8**, e não antes.
- **Login de verdade.** Não há senha nem sessão real: escolhe-se qual usuário simular. O fluxo de convite (seção 5) também só existe de verdade na Fase 8.
- **Dados compartilhados.** Tudo vive no `localStorage` daquele navegador: não sincroniza com o celular, não é compartilhado entre professor e aluno, e desaparece se os dados do site forem limpos. Testar no celular significa dados separados dos do computador.
- **Upload de foto.** Sem Storage, foto de exercício entra como **link** (URL), não como arquivo. E há um atalho que economiza trabalho nas duas fases: como o exercício já tem o link do vídeo do YouTube, o app **deriva a foto automaticamente da capa do vídeo** — o professor cola um link só e ganha a imagem de graça.

Os dados de teste (`js/seed.js`) precisam ser realistas o suficiente para as
telas serem julgáveis: 1 professor, 3 alunos em situações diferentes (em dia,
inadimplente, sem treinar há 10 dias), ~12 exercícios, uma ficha A/B/C completa,
histórico de frequência e **histórico de cargas** — sem cargas antigas não há
como avaliar o gráfico de progressão nem o *"última vez: 20 kg × 10"*, que é o
detalhe que decide o recurso (seção 6.4).

### 9.2 Arquivos

```
/Leo Personal Trainning
  index.html            -- app inteiro (roteador de hash)
  /css
    style.css           -- design system preto e branco
  /js
    config.js           -- qual camada de dados usar (local | supabase)
    db.js               -- interface única de dados
    db-local.js         -- implementação localStorage (agora)
    db-supabase.js      -- implementação Supabase (Fase 8)
    seed.js             -- dados de teste realistas
    auth.js             -- login, logout, controle de acesso por tela
    router.js           -- navegação por hash (#/professor/alunos)
    sync.js             -- fila offline (treino concluído + cargas)
    utils.js            -- vídeo/capa do YouTube, datas em fuso de SP, moeda
    views/              -- uma tela por arquivo
  /assets               -- ícones, logo
  /supabase             -- só entra na Fase 8
    schema.sql          -- tabelas
    policies.sql        -- regras de acesso (RLS)
    seed.sql            -- os mesmos dados de teste, em SQL
  manifest.json         -- instalar na tela inicial do celular
  PLANO.md
```

### Como rodar local

Abrir o arquivo direto no navegador **não funciona** (`file://` quebra o login e
as consultas). Sempre por servidor local — dentro da pasta do projeto:

```bash
npx serve .
```

Ou, com Python:

```bash
python -m http.server 5173
```

### Sobre as chaves do Supabase (válido a partir da Fase 8)

- A chave **pública** (`anon`) vai no front-end, e isso é correto e seguro por design — ela não libera nada; quem controla o acesso são as regras do banco.
- A chave **`service_role`** nunca entra no projeto, em circunstância nenhuma. Ela ignora todas as regras de acesso.
- Fotos de exercícios: bucket **público** (demonstrações genéricas).
- Fotos de perfil: bucket **privado**, com link temporário. Limite de tamanho e tipos definidos no bucket.

### Fuso horário

Toda data de "hoje" é calculada em `America/Sao_Paulo`. Sem isso, treino
registrado à noite cai no dia seguinte e a frequência sai errada.

### Plano gratuito do Supabase

Projetos free são **pausados após ~7 dias sem acesso**. Irrelevante para testes;
quando o app for para o seu amigo de verdade, uso diário já evita, e o plano
pago resolve de vez.

---

## 10. Design (preto e branco)

- Preto `#000`/`#111`, branco `#FFF`, cinzas `#666` `#999` `#E5E5E5`. Nenhuma cor de destaque: hierarquia vem de tipografia e espaço.
- Tipografia sem serifa, pesos bem contrastados (ex: Inter).
- Cards de borda fina, sem sombra pesada, ar generoso.
- Estado (feito, ativo, pago) mostrado por **preenchimento sólido**, não por cor.
- **Mobile-first de verdade**: o aluno usa de pé, com uma mão, e agora também *digita* durante o treino — campos numéricos grandes, teclado numérico, alvos de toque folgados.
- Acessibilidade: em preto e branco, "vencido" não pode depender de cor — precisa de rótulo ou ícone.

---

## 11. Testes obrigatórios de privacidade

> **Executados na Fase 8**, quando o Supabase entra. Antes disso não há o que
> testar: na camada local quem separa os dados é o JavaScript do app, e é
> justamente essa confiança que estes testes existem para não depositar.

Sem servidor próprio, a privacidade depende inteiramente das regras do banco — e
regra errada **falha em silêncio**, sem nenhum erro na tela. Então isso é teste,
não confiança:

1. Logado como **Aluno A**, pedir os pagamentos do **Aluno B** → volta vazio.
2. Aluno A pedir a ficha do Aluno B → vazio.
3. Aluno A pedir as anotações do Aluno B → vazio.
4. Aluno A pedir as **cargas** do Aluno B → vazio.
5. Aluno A tentar mudar o próprio `role` para `trainer` → recusado.
6. Aluno A tentar alterar ou apagar um pagamento → recusado.
7. Aluno A tentar registrar frequência ou carga no nome do Aluno B → recusado.
8. Aluno A **consegue** ler a biblioteca de exercícios → tem que funcionar (senão a ficha abre sem vídeo).
9. Professor vê e edita tudo de todos → tem que funcionar.

Rodar a lista ao final de **cada fase**, não só no fim do projeto.

---

## 12. Decisões

Todas fechadas. Nada bloqueando o início.

| # | Questão | Decisão |
|---|---|---|
| 1 | Primeiro acesso do aluno | Convite com código (seção 5). Usuários de teste criados à mão no painel para começar. |
| 2 | Quem marca a frequência | Os dois. Aluno marca no dia, professor corrige. `marked_by` registra quem foi. |
| 3 | Uma ficha ativa ou várias | Uma ativa por vez, com histórico. Musculação + cardio cabem como duas divisões da mesma ficha. |
| 4 | Cobrança mensal | Um clique por mês, usando valor e vencimento de cada aluno. Sem tarefa agendada, sem duplicata. |
| 5 | Login do aluno | **Email + senha.** Sem link mágico. |
| 6 | Registro de carga / progressão | **Dentro do MVP** (seções 6.4, 7.3, 8.3, 8.4). |
| 7 | Avaliação física (medidas/fotos) | **Fora de escopo.** |
| 8 | Estrutura do código | **Página única com roteador de hash.** |
| 9 | Nome do app | **Leo Personal Trainning** — aparece na tela de login, no cabeçalho, no ícone da tela inicial e no título da aba. |

---

## 13. Fases de execução

Cada fase termina em algo **testável na tela**, não em código pela metade.

As fases 0 a 7 rodam **inteiras na camada local**, sem Supabase (seção 9.1).

| Fase | Entrega | Pronto quando |
|---|---|---|
| **0 — Base local** | Estrutura, design system, roteador, camada de dados local, dados de teste, login simulado | Login separa professor de aluno e os dois painéis abrem com dados de teste |
| **1 — Professor: alunos** | Lista, criar/editar aluno, perfil do aluno | Professor cadastra um aluno e vê o perfil dele completo |
| **2 — Biblioteca** | Cadastro de exercícios com vídeo, capa automática e how-to | 10 exercícios cadastrados, vídeo tocando dentro do app |
| **3 — Fichas** | Editor, divisões, exercícios, bi-set, duplicar, template | Ficha completa montada em menos de 5 minutos |
| **4 — Área do aluno** | Ficha, treino do dia **com registro de carga**, concluir treino, minha evolução, frequência, anotações, financeiro | Testado **no celular**, e utilizável com a internet desligada |
| **5 — Progressão do professor** | Aba de progressão por exercício, gráfico, recorde, últimas sessões | Professor olha a evolução e decide a carga da próxima ficha |
| **6 — Financeiro do professor** | Visão geral, gerar cobranças, dar baixa | Um mês fechado com todos os alunos |
| **7 — Acabamento** | Dashboard por exceção, instalar na tela inicial, fila offline, logo e ícone, ajustes visuais | O app inteiro navegável e apresentável |
| **8 — Supabase** | Tabelas, regras de acesso (RLS), login e convite de verdade, migração dos dados de teste, troca de uma linha em `config.js` | **Checklist da seção 11 passa inteiro** |
| **9 — Hospedagem** | Subir no Lovable ou Git | Acessível por link, chaves fora do código-fonte |

Duas coisas sobre essa ordem, e nenhuma é acidental:

A **área do aluno vem antes do financeiro** porque é a tela que precisa
funcionar no lugar mais hostil — academia, sinal ruim, celular na mão, e agora
também digitando carga entre séries. Quanto mais cedo existir, mais tempo há
para ajustá-la com uso real.

O **Supabase vem no fim, mas o app é escrito desde o começo esperando por ele**.
Deixar o banco para depois só é seguro porque as telas nunca falam com dados
diretamente (seção 9.1); se em qualquer fase uma tela passar a ler
`localStorage` direto, a Fase 8 deixa de ser troca de uma linha e vira
reescrita. É a única regra de disciplina que o plano exige.
