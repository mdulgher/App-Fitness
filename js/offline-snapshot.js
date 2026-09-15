// Snapshot mínimo para o aluno conseguir reabrir o próprio treino sem rede.
// Não substitui o Supabase e nunca é fonte para gravação: ao reconectar, a
// leitura nova sobrescreve o snapshot e a fila envia as intenções pendentes.

const PREFIXO = "lpt:snapshot:";

function chave(usuarioId, nome) {
  return `${PREFIXO}${usuarioId}:${nome}`;
}

export function pareceFalhaDeRede(err, online = globalThis.navigator?.onLine !== false) {
  if (!online) return true;
  return /failed to fetch|fetch failed|network(?:error| request)?|load failed|timeout/i
    .test(String(err?.message ?? ""));
}

export function lerSnapshot(usuarioId, nome, storage = globalThis.localStorage) {
  if (!usuarioId || !storage) return { encontrado: false, valor: null };
  try {
    const bruto = storage.getItem(chave(usuarioId, nome));
    if (!bruto) return { encontrado: false, valor: null };
    const registro = JSON.parse(bruto);
    if (!registro || !("valor" in registro)) return { encontrado: false, valor: null };
    return { encontrado: true, valor: registro.valor, salvoEm: registro.salvoEm ?? null };
  } catch {
    return { encontrado: false, valor: null };
  }
}

export function gravarSnapshot(usuarioId, nome, valor, storage = globalThis.localStorage) {
  if (!usuarioId || !storage) return;
  try {
    storage.setItem(chave(usuarioId, nome), JSON.stringify({
      salvoEm: new Date().toISOString(),
      valor,
    }));
  } catch {
    // Falta de espaço não pode derrubar uma leitura que veio do banco.
  }
}

export async function comSnapshot(usuarioId, nome, buscar, {
  storage = globalThis.localStorage,
  online = globalThis.navigator?.onLine !== false,
} = {}) {
  try {
    const valor = await buscar();
    gravarSnapshot(usuarioId, nome, valor, storage);
    return valor;
  } catch (err) {
    if (!pareceFalhaDeRede(err, online)) throw err;
    const salvo = lerSnapshot(usuarioId, nome, storage);
    if (!salvo.encontrado) throw err;
    return salvo.valor;
  }
}

export function apagarSnapshots(usuarioId, storage = globalThis.localStorage) {
  if (!usuarioId || !storage) return;
  const inicio = `${PREFIXO}${usuarioId}:`;
  try {
    const remover = [];
    for (let i = 0; i < storage.length; i += 1) {
      const item = storage.key(i);
      if (item?.startsWith(inicio)) remover.push(item);
    }
    remover.forEach((item) => storage.removeItem(item));
  } catch {
    // Logout continua mesmo se o armazenamento local estiver indisponível.
  }
}
