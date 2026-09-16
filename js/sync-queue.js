// Núcleo testável da fila. Cada intenção tem uma versão; ao terminar uma
// requisição, só essa versão é removida. Uma correção feita durante o envio
// permanece na fila e será a próxima a subir.
//
// Tudo o mais entra por injeção para o teste rodar sem navegador. A única
// importação é a regra de recusa de acesso, que precisa ser a MESMA do
// snapshot: duas cópias divergiriam, e é justamente dessa classificação que
// depende o dado do aluno parar de aparecer quando ele perde o acesso.
import { ehRecusaDeAcesso } from "./utils.js";

const CHAVE = "lpt:fila-offline";
const chaveTreino = (alunoId, diaId, data) => `${alunoId}|${diaId}|${data}`;

export function pareceErroDeRede(err, online = true) {
  if (err?.code === "LOCAL_STORAGE") return false;
  // Recusa de acesso não é falta de rede. Tratada como rede, a fila parava com
  // `break` e tentava de novo para sempre: a série nunca subia, o aluno lia
  // "mando sozinho quando a rede voltar" e ninguém descobria que o banco tinha
  // recusado a escrita. Assim ela é bloqueada, a mensagem real fica na entrada
  // e o erro sobe para o log.
  if (ehRecusaDeAcesso(err)) return false;
  if (!online) return true;
  return /failed to fetch|fetch failed|network(?:error| request)?|load failed|timeout/i
    .test(String(err?.message ?? ""));
}

export function criarFila({ db, storage, usuarioAtual, online, avisar = () => {}, registrarErro = () => {}, lock = (_nome, fn) => fn() }) {
  let rodando = null;
  const novaVersao = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const erroLocal = () => Object.assign(
    new Error("Não foi possível guardar o registro neste aparelho. Libere espaço ou habilite o armazenamento e tente novamente."),
    { code: "LOCAL_STORAGE" }
  );

  function ler(seguro = false) {
    try {
      const dados = JSON.parse(storage.getItem(CHAVE) ?? "{}");
      if (!dados || Array.isArray(dados) || typeof dados !== "object") throw erroLocal();
      return dados;
    } catch {
      if (seguro) return {};
      throw erroLocal();
    }
  }

  function minhas(fila = ler()) {
    const id = usuarioAtual()?.id;
    return Object.entries(fila).filter(([, treino]) => treino?.alunoId === id);
  }

  function contar(fila = ler(true)) {
    return minhas(fila).reduce(
      (total, [, treino]) => total + Object.keys(treino.series ?? {}).length + (treino.concluir ? 1 : 0), 0
    );
  }

  function contarAtencao(fila = ler(true)) {
    return minhas(fila).reduce((total, [, treino]) => {
      if (!treino.precisaAtencao) return total;
      return total + Object.keys(treino.series ?? {}).length + (treino.concluir ? 1 : 0);
    }, 0);
  }

  async function alterar(fn) {
    const resultado = await lock(`${CHAVE}:storage`, () => {
      const fila = ler();
      const valor = fn(fila);
      try {
        storage.setItem(CHAVE, JSON.stringify(fila));
      } catch {
        throw erroLocal();
      }
      return valor;
    });
    avisar();
    return resultado;
  }

  function doTreino(alunoId, diaId, data) {
    if (usuarioAtual()?.id !== alunoId) return null;
    return ler(true)[chaveTreino(alunoId, diaId, data)] ?? null;
  }

  function contarTreino(alunoId, diaId, data) {
    const treino = doTreino(alunoId, diaId, data);
    return treino
      ? Object.keys(treino.series ?? {}).length + (treino.concluir ? 1 : 0)
      : 0;
  }

  async function enfileirar(dados, conclusao) {
    if (usuarioAtual()?.id !== dados.alunoId) {
      throw new Error("Sua sessão mudou. Entre novamente para registrar o treino.");
    }
    return alterar((fila) => {
      const chave = chaveTreino(dados.alunoId, dados.diaId, dados.data);
      const treino = fila[chave] ?? {
        alunoId: dados.alunoId, diaId: dados.diaId, data: dados.data, series: {}, concluir: false,
      };
      const versao = novaVersao();
      if (conclusao) {
        treino.concluir = versao;
      } else {
        const { itemId, exercicioId, serie, peso, reps } = dados;
        treino.series[`${itemId}:${serie}`] = { itemId, exercicioId, serie, peso, reps, versao };
      }
      delete treino.erro;
      delete treino.precisaAtencao;
      fila[chave] = treino;
    });
  }

  function limparSeVazio(fila, chave) {
    const treino = fila[chave];
    if (treino && !Object.keys(treino.series ?? {}).length && !treino.concluir) delete fila[chave];
  }

  async function enviar({ forcar = false } = {}) {
    let enviados = 0;
    let erro = null;
    const alunoId = usuarioAtual()?.id;
    if (!alunoId || !online()) {
      return { enviados, restantes: contar(), precisamAtencao: contarAtencao(), erro };
    }

    const bloqueados = new Set();
    while (online() && usuarioAtual()?.id === alunoId) {
      const entrada = minhas(ler(true)).find(
        ([chave, treino]) => !bloqueados.has(chave) && (forcar || !treino.precisaAtencao)
      );
      if (!entrada) break;
      const [chave, treino] = entrada;
      try {
        const sessao = await db.abrirSessao(alunoId, treino.diaId, treino.data);
        if (usuarioAtual()?.id !== alunoId) break;
        const primeira = Object.entries(treino.series ?? {})[0];
        if (primeira) {
          const [id, serie] = primeira;
          await db.registrarSerie({
            alunoId, sessaoId: sessao.id, workoutDayExerciseId: serie.itemId,
            exercicioId: serie.exercicioId, serie: serie.serie, peso: serie.peso, reps: serie.reps,
          });
          await alterar((fila) => {
            const atual = fila[chave];
            if (atual && atual.series?.[id]?.versao === serie.versao) {
              delete atual.series[id];
              delete atual.erro;
              delete atual.precisaAtencao;
            }
            limparSeVazio(fila, chave);
          });
          enviados += 1;
        } else if (treino.concluir) {
          const versao = treino.concluir;
          await db.concluirSessao(sessao.id, "student");
          await alterar((fila) => {
            if (fila[chave]?.concluir === versao) {
              fila[chave].concluir = false;
              delete fila[chave].erro;
              delete fila[chave].precisaAtencao;
            }
            limparSeVazio(fila, chave);
          });
          enviados += 1;
        } else {
          await alterar((fila) => limparSeVazio(fila, chave));
        }
      } catch (err) {
        erro = err;
        if (err.code === "LOCAL_STORAGE") throw err;
        if (pareceErroDeRede(err, online())) break;
        bloqueados.add(chave);
        await alterar((fila) => {
          if (!fila[chave]) return;
          fila[chave].erro = err.message;
          fila[chave].precisaAtencao = true;
        });
        registrarErro(err, { origem: "fila", contexto: { acao: "sincronizar", diaId: treino.diaId } });
      }
    }
    return { enviados, restantes: contar(), precisamAtencao: contarAtencao(), erro };
  }

  function sincronizar(opcoes) {
    if (!rodando) {
      rodando = Promise.resolve()
        .then(() => lock(`${CHAVE}:envio`, () => enviar(opcoes)))
        .finally(() => { rodando = null; });
    }
    return rodando;
  }

  function textoParaRecuperar(alunoId, diaId, data) {
    const treino = doTreino(alunoId, diaId, data);
    if (!treino) return "";
    const linhas = [
      "Registros de treino ainda não sincronizados",
      `Data: ${treino.data}`,
      `Divisão: ${treino.diaId}`,
    ];
    Object.values(treino.series ?? {})
      .sort((a, b) => String(a.itemId).localeCompare(String(b.itemId)) || a.serie - b.serie)
      .forEach((serie) => linhas.push(
        `Exercício ${serie.exercicioId} · série ${serie.serie} · ` +
        `peso ${serie.peso ?? "—"} kg · repetições ${serie.reps ?? "—"}`
      ));
    if (treino.concluir) linhas.push("Conclusão do treino: pendente");
    if (treino.erro) linhas.push(`Motivo informado pelo app: ${treino.erro}`);
    return linhas.join("\n");
  }

  function textoParaRecuperarTudo() {
    return minhas(ler(true))
      .filter(([, treino]) => treino.precisaAtencao)
      .map(([, treino]) => textoParaRecuperar(treino.alunoId, treino.diaId, treino.data))
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  async function descartarTreino(alunoId, diaId, data) {
    if (usuarioAtual()?.id !== alunoId) return false;
    return alterar((fila) => {
      const chave = chaveTreino(alunoId, diaId, data);
      if (!Object.prototype.hasOwnProperty.call(fila, chave)) return false;
      delete fila[chave];
      return true;
    });
  }

  async function descartarComAtencao() {
    const alunoId = usuarioAtual()?.id;
    if (!alunoId) return 0;
    return alterar((fila) => {
      let removidos = 0;
      for (const [chave, treino] of Object.entries(fila)) {
        if (treino?.alunoId !== alunoId || !treino.precisaAtencao) continue;
        removidos += Object.keys(treino.series ?? {}).length + (treino.concluir ? 1 : 0);
        delete fila[chave];
      }
      return removidos;
    });
  }

  return {
    pendentes: () => contar(),
    pendentesDoTreino: contarTreino,
    precisamAtencao: () => contarAtencao(),
    seriesNaFila: (...args) => doTreino(...args)?.series ?? {},
    conclusaoNaFila: (...args) => Boolean(doTreino(...args)?.concluir),
    erroNaFila: (...args) => doTreino(...args)?.erro ?? null,
    textoParaRecuperar,
    textoParaRecuperarTudo,
    descartarTreino,
    descartarComAtencao,
    enfileirarSerie: (dados) => enfileirar(dados, false),
    enfileirarConclusao: (dados) => enfileirar(dados, true),
    sincronizar,
  };
}
