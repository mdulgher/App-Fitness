// A fila persiste toda edição antes do envio. Assim a mesma regra protege
// tanto uma queda de rede quanto o fechamento do app durante uma requisição.
import { db } from "./db.js";
import { usuarioAtual } from "./auth.js";
import { registrarErro } from "./log.js";
import { criarFila, pareceErroDeRede } from "./sync-queue.js";

const fila = criarFila({
  db,
  storage: localStorage,
  usuarioAtual,
  online: () => navigator.onLine,
  lock: (nome, fn) => navigator.locks ? navigator.locks.request(nome, fn) : fn(),
  avisar: () => window.dispatchEvent(new CustomEvent("lpt:fila")),
  registrarErro,
});

export const pendentes = fila.pendentes;
export const pendentesDoTreino = fila.pendentesDoTreino;
export const dataPendenteDoTreino = fila.dataPendenteDoTreino;
export const precisamAtencao = fila.precisamAtencao;
export const seriesNaFila = fila.seriesNaFila;
export const conclusaoNaFila = fila.conclusaoNaFila;
export const enfileirarSerie = fila.enfileirarSerie;
export const enfileirarConclusao = fila.enfileirarConclusao;
export const sincronizar = fila.sincronizar;
export const erroNaFila = fila.erroNaFila;
export const textoParaRecuperar = fila.textoParaRecuperar;
export const textoParaRecuperarTudo = fila.textoParaRecuperarTudo;
export const descartarTreino = fila.descartarTreino;
export const descartarComAtencao = fila.descartarComAtencao;
export const pareceFaltaDeRede = (err) => pareceErroDeRede(err, navigator.onLine);

let ligada = false;
export function ligarSincronizacaoAutomatica() {
  if (ligada) return;
  ligada = true;
  const tentar = () => sincronizar().catch((err) => registrarErro(err, { origem: "fila" }));
  window.addEventListener("online", tentar);
  window.addEventListener("lpt:sessao", tentar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tentar();
  });
  setInterval(tentar, 60_000);
  tentar();
}
