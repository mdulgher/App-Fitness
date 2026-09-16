import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { criarFila } from "../js/sync-queue.js";
import { sanitizarParaLog } from "../js/log.js";
import { metaEfetiva } from "../js/utils.js";

function ambiente() {
  let texto = "{}";
  let liberarPrimeiro;
  const primeiro = new Promise((resolve) => { liberarPrimeiro = resolve; });
  let iniciouPrimeiro;
  const primeiroIniciado = new Promise((resolve) => { iniciouPrimeiro = resolve; });
  const enviados = [];
  let chamadas = 0;
  const usuario = { id: "aluno-1" };
  const storage = {
    getItem: () => texto,
    setItem: (_chave, valor) => { texto = valor; },
  };
  const db = {
    abrirSessao: async () => ({ id: "sessao-1" }),
    registrarSerie: async (dados) => {
      chamadas += 1;
      if (chamadas === 1) {
        iniciouPrimeiro();
        await primeiro;
      }
      enviados.push(dados);
    },
    concluirSessao: async () => {},
  };
  const fila = criarFila({ db, storage, usuarioAtual: () => usuario, online: () => true });
  return { fila, storage, usuario, enviados, liberarPrimeiro, primeiroIniciado, ler: () => JSON.parse(texto) };
}

const dados = {
  alunoId: "aluno-1", diaId: "dia-1", data: "2026-09-12",
  itemId: "item-1", exercicioId: "ex-1", serie: 1, peso: 20, reps: 10,
};

// Uma correção durante o envio não pode ser apagada pela confirmação antiga.
const a = ambiente();
await a.fila.enfileirarSerie(dados);
assert.equal(a.fila.dataPendenteDoTreino(dados.alunoId, dados.diaId), dados.data);
const envio = a.fila.sincronizar();
await a.primeiroIniciado;
await a.fila.enfileirarSerie({ ...dados, peso: 25 });
a.liberarPrimeiro();
await envio;
assert.deepEqual(a.enviados.map((s) => s.peso), [20, 25]);
assert.equal(a.fila.pendentes(), 0);

// Uma conta nunca envia a fila pertencente a outra.
await a.fila.enfileirarSerie(dados);
a.usuario.id = "aluno-2";
assert.equal(a.fila.pendentes(), 0);
assert.equal((await a.fila.sincronizar()).enviados, 0);
assert.equal(Object.keys(a.ler()).length, 1);
assert.equal(a.fila.dataPendenteDoTreino("aluno-1", "dia-1"), null);

// Falha ao persistir deve chegar à tela, sem confirmação falsa de salvamento.
const quebrado = criarFila({
  db: {}, usuarioAtual: () => ({ id: "aluno-1" }), online: () => false,
  storage: { getItem: () => "{}", setItem: () => { throw new Error("quota"); } },
});
await assert.rejects(quebrado.enfileirarSerie(dados), (err) => err.code === "LOCAL_STORAGE");

// Erro permanente não pode fingir falta de internet nem ser repetido a cada
// minuto. A intenção fica acessível, uma tentativa manual pode forçar novo
// envio e uma edição nova libera a fila automaticamente.
let textoComErro = "{}";
let tentativasComErro = 0;
let recusar = true;
const usuarioComErro = { id: "aluno-1" };
const enviadosDepoisDaCorrecao = [];
const filaComErro = criarFila({
  usuarioAtual: () => usuarioComErro,
  online: () => true,
  storage: {
    getItem: () => textoComErro,
    setItem: (_chave, valor) => { textoComErro = valor; },
  },
  db: {
    abrirSessao: async () => {
      tentativasComErro += 1;
      if (recusar) throw new Error("permission denied for table attendance");
      return { id: "sessao-recuperada" };
    },
    registrarSerie: async (registro) => enviadosDepoisDaCorrecao.push(registro),
    concluirSessao: async () => {},
  },
});

await filaComErro.enfileirarSerie(dados);
const recusada = await filaComErro.sincronizar();
assert.equal(recusada.restantes, 1);
assert.equal(recusada.precisamAtencao, 1);
assert.equal(filaComErro.pendentesDoTreino(dados.alunoId, dados.diaId, dados.data), 1);
assert.match(filaComErro.erroNaFila(dados.alunoId, dados.diaId, dados.data), /permission denied/);
assert.equal(tentativasComErro, 1);

// Sincronização automática ignora a entrada bloqueada; botão explícito força
// uma nova tentativa, mas nunca apaga a intenção quando ela falha outra vez.
await filaComErro.sincronizar();
assert.equal(tentativasComErro, 1);
await filaComErro.sincronizar({ forcar: true });
assert.equal(tentativasComErro, 2);
assert.equal(filaComErro.pendentes(), 1);
assert.match(
  filaComErro.textoParaRecuperar(dados.alunoId, dados.diaId, dados.data),
  /peso 20 kg.*repetições 10/
);
assert.match(filaComErro.textoParaRecuperarTudo(), /Registros de treino ainda não sincronizados/);

recusar = false;
await filaComErro.enfileirarSerie({ ...dados, peso: 25 });
assert.equal(filaComErro.precisamAtencao(), 0);
await filaComErro.sincronizar();
assert.deepEqual(enviadosDepoisDaCorrecao.map((s) => s.peso), [25]);
assert.equal(filaComErro.pendentes(), 0);

// Logger é uma fronteira única: nenhum catch precisa saber mascarar segredo,
// email, telefone ou token por conta própria.
const contextoSaneado = sanitizarParaLog({
  email: "aluno@example.com",
  telefone: "(11) 99999-8888",
  senha: "NaoPodeSair123",
  cabecalho: "Bearer abcdefghijklmnopqrstuvwxyz.abcdefghijklmnop.qrstuvwxyzabcdefghijkl",
});
assert.equal(contextoSaneado.email, "[email removido]");
assert.equal(contextoSaneado.telefone, "[telefone removido]");
assert.equal(contextoSaneado.senha, "[removido]");
assert.doesNotMatch(contextoSaneado.cabecalho, /abcdefghijklmnop/);

// Remoção é uma saída deliberada e isolada: outra conta não consegue apagar.
recusar = true;
await filaComErro.enfileirarSerie(dados);
await filaComErro.sincronizar();
usuarioComErro.id = "aluno-2";
assert.equal(await filaComErro.descartarTreino(dados.alunoId, dados.diaId, dados.data), false);
assert.equal(await filaComErro.descartarComAtencao(), 0);
usuarioComErro.id = "aluno-1";
assert.equal(await filaComErro.descartarComAtencao(), 1);
assert.equal(filaComErro.pendentes(), 0);

// A contagem semanal usa as chaves (datas) do Map, inclusive o domingo.
const dias = new Map([["2026-09-13", { id: "domingo" }]]);
const feitos = [...dias.keys()].filter((data) => data >= "2026-09-07" && data <= "2026-09-13").length;
assert.equal(feitos, 1);

// As duas implementações de dados precisam expor as MESMAS funções (regra 2 do
// CLAUDE.md). Quando divergem, a tela quebra só no banco em que ninguém testou
// naquele dia — foi assim que `desconcluirSessao` ficou meses existindo apenas
// no Supabase enquanto a Frequência a chamava, e desmarcar treino estourava no
// modo local. Nenhum dos dois arquivos pode ser importado aqui (um quer
// localStorage, o outro busca o SDK na rede), então a conferência é no texto.
//
// Só `entrarComoId` fica de fora: é o atalho de entrar sem senha nos dados
// fictícios, e existir no Supabase seria justamente o problema.
const SO_NO_LOCAL = new Set(["entrarComoId"]);
const exportadas = async (arquivo) => {
  const texto = await readFile(new URL(`../js/${arquivo}`, import.meta.url), "utf8");
  return new Set([...texto.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]));
};

const noLocal = await exportadas("db-local.js");
const noSupabase = await exportadas("db-supabase.js");
const faltamNoSupabase = [...noLocal].filter((n) => !noSupabase.has(n) && !SO_NO_LOCAL.has(n));
const faltamNoLocal = [...noSupabase].filter((n) => !noLocal.has(n));

assert.deepEqual(faltamNoSupabase, [], `faltam em db-supabase.js: ${faltamNoSupabase.join(", ")}`);
assert.deepEqual(faltamNoLocal, [], `faltam em db-local.js: ${faltamNoLocal.join(", ")}`);

// E toda função que as telas chamam precisa existir nas duas.
const telas = await readdir(new URL("../js/views/", import.meta.url));
const chamadas = new Set();
for (const tela of telas.filter((t) => t.endsWith(".js"))) {
  const texto = await readFile(new URL(`../js/views/${tela}`, import.meta.url), "utf8");
  for (const m of texto.matchAll(/\bdb\.(\w+)\s*\(/g)) chamadas.add(m[1]);
}
const semImplementacao = [...chamadas].filter(
  (n) => !(noLocal.has(n) && noSupabase.has(n)) && n !== "importarCatalogoPeito"
);
assert.deepEqual(semImplementacao, [], `telas chamam sem as duas implementações: ${semImplementacao.join(", ")}`);

// O release visto no log e o cache instalado precisam apontar para o mesmo
// conjunto. Divergir aqui tornaria o diagnóstico de produção ambíguo.
const config = await readFile(new URL("../js/config.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const release = /RELEASE_ID\s*=\s*"([^"]+)"/.exec(config)?.[1];
const versaoWorker = /VERSAO\s*=\s*"([^"]+)"/.exec(worker)?.[1];
assert.equal(release, versaoWorker);

// AT-16/18: conferir o caminho completo, não apenas a existência das colunas
// no modelo. O professor edita e o aluno recebe rótulo explícito; a execução
// usa uma data fixa em todos os enfileiramentos.
const editor = await readFile(new URL("../js/views/professor-ficha.js", import.meta.url), "utf8");
const treino = await readFile(new URL("../js/views/aluno-treino.js", import.meta.url), "utf8");
const listaAlunos = await readFile(new URL("../js/views/professor-alunos.js", import.meta.url), "utf8");
for (const campo of ["load_notes", "group_label"]) {
  assert.match(editor, new RegExp(`data-campo=["']${campo}["']`));
  assert.match(treino, new RegExp(`item\\.${campo}`));
}
assert.match(treino, /data:\s*dataTreino/);
assert.doesNotMatch(treino, /data:\s*hoje\(\)/);
assert.match(listaAlunos, /filtro-situacao/);
assert.match(listaAlunos, /filtro-atencao/);

// AT-12: a meta é da ficha e só dela. `students.weekly_target` é
// `not null default 3`, então enquanto ele fosse fallback nenhuma tela poderia
// dizer "sem meta" — o 3 do cadastro sempre responderia primeiro. Este teste
// falha se o fallback voltar, inclusive por alguém "consertar" um null.
assert.equal(metaEfetiva({ weekly_target: 5 }), 5);
assert.equal(metaEfetiva({ weekly_target: null }), null, "ficha sem meta não pode herdar do cadastro");
assert.equal(metaEfetiva(null), null, "aluno sem ficha ativa não tem meta");
assert.equal(metaEfetiva(undefined), null);
assert.equal(metaEfetiva.length, 1, "metaEfetiva não pode voltar a receber o aluno");
// Direto, sem depender da aridade declarada: um segundo argumento tem de ser
// ignorado. Sem esta linha, reintroduzir o fallback por `arguments[1]` passava.
assert.equal(
  metaEfetiva({ weekly_target: null }, { weekly_target: 3 }), null,
  "metaEfetiva voltou a considerar um segundo argumento"
);

// Nenhuma tela pode ler a coluna do cadastro de novo — foi assim que a
// Frequência e o editor passaram a mostrar números diferentes em 13/09.
for (const arquivo of await readdir(new URL("../js/views/", import.meta.url))) {
  if (!arquivo.endsWith(".js")) continue;
  const fonte = await readFile(new URL(`../js/views/${arquivo}`, import.meta.url), "utf8");
  assert.doesNotMatch(
    fonte, /aluno\.weekly_target|aluno\?\.weekly_target/,
    `${arquivo} voltou a ler a meta do cadastro; a meta é da ficha (AT-12)`
  );
  assert.doesNotMatch(
    fonte, /metaEfetiva\([^)]*,/,
    `${arquivo} passa um segundo argumento para metaEfetiva (AT-12)`
  );
}

// A camada de dados também não: a consulta a `students.weekly_target` saiu do
// resumo da semana junto com o fallback.
for (const camada of ["db-local.js", "db-supabase.js"]) {
  const fonte = await readFile(new URL(`../js/${camada}`, import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /metaEfetiva\([^)]*,/, `${camada} passa aluno para metaEfetiva`);
}

console.log(
  `OK: fila concorrente, isolamento, data estável, log saneado, release, prescrição, filtros, domingo, ` +
  `meta da ficha e ` +
  `contrato de dados (${noLocal.size} funções nas duas, ${chamadas.size} usadas pelas telas).`
);
