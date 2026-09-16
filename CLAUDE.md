# Regras do projeto — Leo Personal Trainning

App para um personal trainer. Página única, **JavaScript puro, sem framework e
sem passo de build**, publicada no GitHub Pages e apoiada no Supabase.

Este arquivo é o contrato curto. O contexto completo está em
[`CONTEXTO.md`](CONTEXTO.md) — leia a **seção 8 (armadilhas conhecidas)** antes
de alterar qualquer comportamento: cada item ali já foi a causa de um erro real.

| Arquivo | Para quê |
|---|---|
| `CONTEXTO.md` | Arquitetura, contrato de dados, design system, 25 armadilhas |
| `PLANO.md` | Roteiro das fases |
| `TESTES.md` | Roteiro de validação — use antes de publicar |
| `AUDITORIA.md` | Diagnóstico de 12/09/2026 e as lições que ficaram |

---

## As regras que não se quebram

1. **Nenhuma view toca em `localStorage`, em SQL ou no cliente do Supabase.**
   Toda leitura e escrita passa por `js/db.js`. É o que faz a troca de banco ser
   uma linha em `config.js` em vez de uma reescrita de todas as telas.

2. **Função de dados nova nasce nas duas implementações** — `db-local.js` e
   `db-supabase.js` — com assinatura idêntica. Todas `async`, inclusive as
   locais que não precisariam ser.

3. **Sem framework, sem estado global, sem re-render automático.** Cada arquivo
   em `js/views/` exporta uma única `render(alvo, { params, fase })` que monta
   `alvo.innerHTML` e registra os próprios listeners. Não introduza React, Vue,
   Tailwind, bundler ou TypeScript. Não reorganize em `src/components/`.

4. **Nomes de função e de variável em português**, como o resto do código.

5. **Sempre `esc()` em texto que vai para `innerHTML`.**

6. **Datas em `America/Sao_Paulo`** via `hoje()` de `utils.js`, nunca
   `new Date().toISOString()`. E **nunca `<input type="date">`** — use
   `ligarMascaraDeData()` + `dataBRParaIso()`.

7. **Dinheiro:** `numeric(10,2)` no banco, `ligarMascaraDeMoeda()` na tela,
   `moedaParaNumero()` na leitura. Nunca `float`, nunca `<input type="number">`.

## Redundâncias que são propositais — não "simplifique"

Parecem duplicação ou lacuna e não são. Estão detalhadas em `CONTEXTO.md` §8:

- **`exercise_logs.exercise_id` é redundante de propósito** (armadilha 5). Sem
  ele o histórico de carga morre quando o professor troca a ficha.
- **Status de pagamento é derivado, nunca coluna** (armadilha 2). Armazenado,
  "vencido" apodrece.
- **Falta não é registro** (armadilha 3). Só se grava treino feito; a frequência
  é calculada contra a meta da ficha.
- **A frequência semanal não é um campo** (armadilha 14). É a contagem dos dias
  marcados na ficha.
- **A meta semanal é da ficha, e só dela** (armadilha 26). Use `metaEfetiva()`.
  `students.weekly_target` sai do banco na migration
  `20260916184600_remove_weekly_target_de_students` — este repositório já
  assume que a coluna não existe mais. Sem meta é resposta válida — a tela
  escreve "sem meta", não inventa um número.

## Design system

Preto, branco e cinzas, **sem nenhuma cor de destaque**. Hierarquia vem de
tipografia, espaço e preenchimento. Tokens em `:root` no `css/style.css`.

- `--tap: 48px` é a altura mínima de botão e campo — o aluno usa de pé, com uma mão.
- Inputs têm `font-size: 16px` de propósito: abaixo disso o iOS dá zoom sozinho.
- **Como não há cor, estado nunca depende só dela.** Todo status carrega rótulo
  em texto e preenchimento distinto (`tag-solid` / `tag-quiet`).
- Não esconda conteúdo por breakpoint sem olhar o que mora dentro (armadilha 23).

---

## Como rodar e como publicar

Abrir o `index.html` com dois cliques **não funciona** (CORS em `file://`):

```bash
node scripts/preview.cjs
```

Esse servidor só entrega os arquivos públicos do app. Use `--demo` para os
dados fictícios e `--lan` somente quando precisar testar em outro aparelho da
rede local. Não use um servidor genérico na raiz, pois ele pode expor arquivos
locais ignorados pelo Git.

**Publicar é dar push.** Branch única `main`, sem CI, sem staging, sem build —
todo push vai direto para produção e o Leo pode estar com a tela aberta. Teste
no `localhost` antes.

Neste Windows o push exige zerar o helper de credencial antes do `gh`:

```bash
git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin main
```

Nunca altere a configuração de git do dono sem pedir.

### Commits

Mensagens **em português**, com prefixo `feat:` / `fix:` / `refactor:` / `docs:`,
direto na `main`. Não crie branch nem PR sem pedido explícito.

---

## Como verificar

A lição mais cara do projeto está no `AUDITORIA.md`: um RPC foi criado no banco,
o smoke test ficou verde por um dia inteiro, e o app continuou sem chamá-lo —
o teste batia no endpoint HTTP, não no caminho real do professor.

> **Teste que não passa pelo código do app não prova o app.**
> Confira a fonte, não a documentação nem o teste verde.

Antes de publicar, rode as verificações da seção 2 do `TESTES.md`
(`node --check` em todos os JS, `test-exercises.mjs`, `test-regressions.mjs`,
`test-pagination.mjs`, `test-offline-snapshot.mjs`, `test-pwa.mjs`,
`test-supabase-smoke.mjs`, `test-treinos-realizados.mjs`) e consulte
`app_errors` — um fluxo visualmente
correto ainda pode ter falhado em segundo plano.

Não existe framework de teste unitário aqui e não é para introduzir um sem
pedido. As views se validam pelo roteiro manual do `TESTES.md`.

**Cuidado com o cache do PWA no iPhone:** o app instalado guarda JS e CSS. Uma
mudança pode parecer não ter efeito até fechar pelo app switcher e reabrir.
Verifique o commit no GitHub antes de depurar.

## Segurança

O guard do roteador é de navegação, **não é privacidade** (armadilha 9). Quem
impede o dado de sair são as regras de RLS no banco. Não trate um
redirecionamento na tela como prova de que o dado está protegido.

As definições do servidor — políticas SQL, triggers, permissões, views e Edge
Functions — não vivem neste repositório. Mudança que dependa delas se verifica
no painel do Supabase, não lendo o código daqui.

Ao testar, use somente as contas fictícias de `CREDENCIAIS.local.md`. Nunca
altere aluno real sem autorização. Nunca envie WhatsApp durante teste. Nunca
versione senha, token ou chave.

## Decisões que são do dono

Não decida sozinho — pergunte. Em aberto hoje (`CONTEXTO.md` §9): esconder ou
não os valores de mensalidade na lista de alunos; proteção contra senhas
vazadas (só no plano Pro) ou entrada com Google; e manter ou limpar os 16
alunos fictícios depois da avaliação do Leo. A mídia dos exercícios será
fornecida pelo professor; não gerar ilustrações.
