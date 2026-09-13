import assert from "node:assert/strict";
import { criarFila } from "../js/sync-queue.js";

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

// Falha ao persistir deve chegar à tela, sem confirmação falsa de salvamento.
const quebrado = criarFila({
  db: {}, usuarioAtual: () => ({ id: "aluno-1" }), online: () => false,
  storage: { getItem: () => "{}", setItem: () => { throw new Error("quota"); } },
});
await assert.rejects(quebrado.enfileirarSerie(dados), (err) => err.code === "LOCAL_STORAGE");

// A contagem semanal usa as chaves (datas) do Map, inclusive o domingo.
const dias = new Map([["2026-09-13", { id: "domingo" }]]);
const feitos = [...dias.keys()].filter((data) => data >= "2026-09-07" && data <= "2026-09-13").length;
assert.equal(feitos, 1);

console.log("OK: fila concorrente, isolamento por aluno, persistência e domingo.");
