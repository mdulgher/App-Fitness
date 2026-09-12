// Fila offline — o treino registrado sem sinal.
//
// O lugar onde este app é usado é a academia: subsolo, parede de concreto,
// celular no modo econômico. Sem fila, uma série digitada nesse momento some
// com um aviso vermelho, e o aluno para de registrar — o que mata a progressão,
// que é o motivo do app existir.
//
// O que a fila guarda **não é a chamada de banco**, e sim a intenção: "no dia
// tal, no treino tal, a série 2 do exercício tal foi 22,5 kg × 10". Só quando a
// rede volta é que isso vira `abrirSessao` + `registrarSerie`. Guardar o id da
// sessão seria impossível: criar a sessão já exige rede.
//
// Reenviar é seguro porque as três operações do banco são idempotentes:
// `abrirSessao` devolve a sessão do dia se ela já existir, `registrarSerie` faz
// upsert na chave (sessão, exercício, série) e `concluirSessao` só reescreve a
// hora. Mandar duas vezes não duplica nada.

import { db } from "./db.js";
import { registrarErro } from "./log.js";

const CHAVE = "lpt:fila-offline";

const chaveDoTreino = (alunoId, diaId, data) => `${alunoId}|${diaId}|${data}`;

function ler() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
  } catch {
    // localStorage corrompido não pode derrubar a tela de treino.
    return {};
  }
}

function salvar(fila) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // Sem espaço ou em navegação privada: o app continua, só não guarda.
  }
  window.dispatchEvent(new CustomEvent("lpt:fila", { detail: { pendentes: contarPendentes(fila) } }));
}

function contarPendentes(fila = ler()) {
  return Object.values(fila).reduce(
    (t, treino) => t + Object.keys(treino.series ?? {}).length + (treino.concluir ? 1 : 0),
    0
  );
}

export function pendentes() {
  return contarPendentes();
}

// O que está na fila para este treino de hoje, para a tela mostrar o que o
// aluno digitou mesmo tendo recarregado a página offline.
export function seriesNaFila(alunoId, diaId, data) {
  const treino = ler()[chaveDoTreino(alunoId, diaId, data)];
  return treino?.series ?? {};
}

export function conclusaoNaFila(alunoId, diaId, data) {
  return Boolean(ler()[chaveDoTreino(alunoId, diaId, data)]?.concluir);
}

export function enfileirarSerie({ alunoId, diaId, data, itemId, exercicioId, serie, peso, reps }) {
  const fila = ler();
  const chave = chaveDoTreino(alunoId, diaId, data);
  const treino = fila[chave] ?? { alunoId, diaId, data, series: {}, concluir: false };
  // A mesma série digitada de novo sobrescreve a anterior: a fila guarda o
  // estado final, não o histórico de tentativas.
  treino.series[`${itemId}:${serie}`] = { itemId, exercicioId, serie, peso, reps };
  fila[chave] = treino;
  salvar(fila);
}

export function enfileirarConclusao({ alunoId, diaId, data }) {
  const fila = ler();
  const chave = chaveDoTreino(alunoId, diaId, data);
  const treino = fila[chave] ?? { alunoId, diaId, data, series: {}, concluir: false };
  treino.concluir = true;
  fila[chave] = treino;
  salvar(fila);
}

// Erro de rede é o único que vai para a fila. "Permissão negada" ou dado
// inválido reenviados mil vezes continuariam falhando, e esconder isso do aluno
// seria pior do que o aviso.
export function pareceFaltaDeRede(err) {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError) return true; // fetch abortado pelo navegador
  const msg = String(err?.message ?? "").toLowerCase();
  return ["failed to fetch", "network", "load failed", "timeout", "networkerror"]
    .some((t) => msg.includes(t));
}

let rodando = false;

export async function sincronizar() {
  const fila = ler();
  const chaves = Object.keys(fila);
  if (rodando || !chaves.length || !navigator.onLine) return { enviados: 0, restantes: contarPendentes(fila) };

  rodando = true;
  let enviados = 0;

  try {
    for (const chave of chaves) {
      const treino = fila[chave];
      try {
        const sessao = await db.abrirSessao(treino.alunoId, treino.diaId, treino.data);

        for (const [id, s] of Object.entries(treino.series)) {
          await db.registrarSerie({
            alunoId: treino.alunoId,
            sessaoId: sessao.id,
            workoutDayExerciseId: s.itemId,
            exercicioId: s.exercicioId,
            serie: s.serie,
            peso: s.peso,
            reps: s.reps,
          });
          delete treino.series[id];
          enviados += 1;
        }

        if (treino.concluir) {
          await db.concluirSessao(sessao.id, "student");
          treino.concluir = false;
          enviados += 1;
        }

        delete fila[chave];
      } catch (err) {
        // Se a rede caiu de novo, para por aqui e tenta na próxima. Se o erro
        // for de verdade (dado inválido, permissão), o treino fica na fila com
        // a marca — não se joga fora o que o aluno digitou.
        treino.erro = err.message;
        if (pareceFaltaDeRede(err)) break;
        registrarErro(err, {
          origem: "fila",
          contexto: { diaId: treino.diaId, data: treino.data, series: Object.keys(treino.series).length },
        });
      }
    }
  } finally {
    salvar(fila);
    rodando = false;
  }

  return { enviados, restantes: contarPendentes() };
}

// Tenta sozinho: quando a rede volta, quando o app volta para a frente (voltar
// do bloqueio de tela é o caso comum no vestiário) e a cada 60 segundos.
export function ligarSincronizacaoAutomatica() {
  window.addEventListener("online", () => sincronizar());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
  });
  setInterval(() => sincronizar(), 60_000);
  sincronizar();
}
