// Snapshot mínimo para o aluno conseguir reabrir o próprio treino sem rede.
// Não substitui o Supabase e nunca é fonte para gravação: ao reconectar, a
// leitura nova sobrescreve o snapshot e a fila envia as intenções pendentes.

import { ehRecusaDeAcesso } from "./utils.js";

const PREFIXO = "lpt:snapshot:";

function chave(usuarioId, nome) {
  return `${PREFIXO}${usuarioId}:${nome}`;
}

export function pareceFalhaDeRede(err, online = globalThis.navigator?.onLine !== false) {
  // Antes de olhar o `online`: recusa de acesso não é falta de rede. Sessão
  // expirada respondida com snapshot deixa o usuário navegando numa cópia velha
  // em vez de mandá-lo entrar de novo. A explicação completa, e o caso que NÃO
  // passa por aqui, estão em `ehRecusaDeAcesso`.
  if (ehRecusaDeAcesso(err)) return false;
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

// Algumas telas já têm tudo de que precisam dentro de um snapshot maior. A
// ficha ativa, por exemplo, contém todas as divisões. Se o aluno abre uma delas
// pela primeira vez sem sinal, ainda não existe `dia:id`, mas não há motivo
// para negar o treino que já está no aparelho. A derivação só acontece em erro
// real de rede; resposta vazia ou recusa de acesso nunca ressuscita dado velho.
export async function comSnapshotOuDerivado(usuarioId, nome, buscar, derivar, {
  storage = globalThis.localStorage,
  online = globalThis.navigator?.onLine !== false,
} = {}) {
  try {
    return await comSnapshot(usuarioId, nome, buscar, { storage, online });
  } catch (err) {
    if (!pareceFalhaDeRede(err, online)) throw err;
    const valor = derivar?.(storage);
    if (valor == null) throw err;
    gravarSnapshot(usuarioId, nome, valor, storage);
    return valor;
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
