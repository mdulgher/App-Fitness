// Núcleo testável da fila. Cada intenção tem uma versão; ao terminar uma
// requisição, só essa versão é removida. Uma correção feita durante o envio
// permanece na fila e será a próxima a subir.
const CHAVE = "lpt:fila-offline";
const chaveTreino = (alunoId, diaId, data) => `${alunoId}|${diaId}|${data}`;

export function pareceErroDeRede(err, online = true) {
  if (err?.code === "LOCAL_STORAGE") return false;
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
      fila[chave] = treino;
    });
  }

  function limparSeVazio(fila, chave) {
    const treino = fila[chave];
    if (treino && !Object.keys(treino.series ?? {}).length && !treino.concluir) delete fila[chave];
  }

  async function enviar() {
    let enviados = 0;
    let erro = null;
    const alunoId = usuarioAtual()?.id;
    if (!alunoId || !online()) return { enviados, restantes: contar(), erro };

    const bloqueados = new Set();
    while (online() && usuarioAtual()?.id === alunoId) {
      const entrada = minhas(ler(true)).find(([chave]) => !bloqueados.has(chave));
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
            if (atual && atual.series?.[id]?.versao === serie.versao) delete atual.series[id];
            limparSeVazio(fila, chave);
          });
          enviados += 1;
        } else if (treino.concluir) {
          const versao = treino.concluir;
          await db.concluirSessao(sessao.id, "student");
          await alterar((fila) => {
            if (fila[chave]?.concluir === versao) fila[chave].concluir = false;
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
        await alterar((fila) => { if (fila[chave]) fila[chave].erro = err.message; });
        registrarErro(err, { origem: "fila", contexto: { acao: "sincronizar", diaId: treino.diaId } });
      }
    }
    return { enviados, restantes: contar(), erro };
  }

  function sincronizar() {
    if (!rodando) {
      rodando = Promise.resolve()
        .then(() => lock(`${CHAVE}:envio`, enviar))
        .finally(() => { rodando = null; });
    }
    return rodando;
  }

  return {
    pendentes: () => contar(),
    seriesNaFila: (...args) => doTreino(...args)?.series ?? {},
    conclusaoNaFila: (...args) => Boolean(doTreino(...args)?.concluir),
    erroNaFila: (...args) => doTreino(...args)?.erro ?? null,
    enfileirarSerie: (dados) => enfileirar(dados, false),
    enfileirarConclusao: (dados) => enfileirar(dados, true),
    sincronizar,
  };
}
