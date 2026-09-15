import assert from "node:assert/strict";
import { buscarTodasAsPaginas } from "../js/supabase-pagination.js";

function consultaSobre(dados, chamadas) {
  return () => ({
    async range(inicio, fim) {
      chamadas.push([inicio, fim]);
      return { data: dados.slice(inicio, fim + 1), error: null };
    },
  });
}

for (const total of [0, 1, 499, 500, 501, 1001, 10_000]) {
  const dados = Array.from({ length: total }, (_, id) => ({ id }));
  const chamadas = [];
  const resultado = await buscarTodasAsPaginas(consultaSobre(dados, chamadas), { tamanho: 500 });
  assert.deepEqual(resultado, dados, `${total} linhas devem voltar sem cortes`);
  assert.deepEqual(
    chamadas,
    Array.from({ length: Math.floor(total / 500) + 1 }, (_, pagina) => [pagina * 500, pagina * 500 + 499]),
    `${total} linhas devem usar todos os intervalos necessários`
  );
}

await assert.rejects(
  buscarTodasAsPaginas(consultaSobre([{ id: 1 }, { id: 2 }], []), { tamanho: 1, maximoDePaginas: 1 }),
  /ultrapassou o limite interno/
);

console.log("OK: paginação retorna 0, 500, 1.001 e 10.000 linhas sem truncar nem duplicar.");
