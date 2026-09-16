// Log de erros — a caixa-preta do app.
//
// O app roda no celular de outra pessoa, em outra cidade, às 6 da manhã. Quando
// algo quebra lá, ninguém abre o console do navegador: o aluno fecha o app e o
// professor fica sabendo que "não funcionou". Este arquivo é o que transforma
// isso em uma linha que dá para ler depois.
//
// **Por que uma tabela no banco e não um arquivo ou uma tela de desenvolvedor:**
// arquivo só existe no aparelho de quem teve o erro, e tela de desenvolvedor é
// interface para construir e manter sem ninguém olhar. A tabela chega sozinha,
// já vem consultável por SQL e o Claude Code lê direto pelo MCP do Supabase —
// sem login novo, sem tela nova, sem exportar nada à mão.
//
// Três regras que mantêm isso saudável:
// 1. **Registrar erro nunca pode causar erro.** Toda esta função é um try/catch
//    que engole tudo; falha de log é silêncio, jamais um segundo alerta.
// 2. **Sem repetição.** A mesma mensagem na mesma rota só vai uma vez por
//    minuto: um erro dentro de um loop encheria a tabela em segundos.
// 3. **Sem dado sensível.** Vai mensagem, rota e um contexto que o chamador
//    escolhe. Senha, token e conteúdo de campo não entram aqui.

import { DATA_SOURCE, RELEASE_ID } from "./config.js";

const CHAVE_LOCAL = "lpt:erros";
const JANELA_REPETICAO = 60_000;
const ultimos = new Map();

let sb = null;
let usuario = () => null;
let enviando = false;
const novoIdLocal = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const CHAVES_SENSIVEIS = /senha|password|token|authorization|cookie|secret|anonkey|apikey|chave/i;

// O contexto vem de muitos catches diferentes. Saneá-lo num único lugar é
// mais seguro que depender de cada chamador lembrar o que não pode registrar.
// IDs operacionais permanecem: eles permitem localizar a operação sem expor
// senha, token, email ou telefone digitado.
export function sanitizarParaLog(valor, chave = "", vistos = new WeakSet()) {
  if (CHAVES_SENSIVEIS.test(chave)) return "[removido]";
  if (valor == null || typeof valor === "boolean" || typeof valor === "number") return valor;
  if (typeof valor === "string") {
    return valor
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [removido]")
      .replace(/[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, "[token removido]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email removido]")
      .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g, "[telefone removido]");
  }
  if (typeof valor !== "object") return String(valor);
  if (vistos.has(valor)) return "[referência circular]";
  vistos.add(valor);
  if (Array.isArray(valor)) return valor.slice(0, 20).map((item) => sanitizarParaLog(item, chave, vistos));
  return Object.fromEntries(
    Object.entries(valor).slice(0, 40).map(([nome, item]) => [nome, sanitizarParaLog(item, nome, vistos)])
  );
}

// Injetado pelo app.js. Este módulo não importa db.js nem auth.js de propósito:
// ele precisa funcionar mesmo quando é justamente um deles que está quebrado.
export function configurarLog({ cliente, usuarioAtual }) {
  sb = cliente ?? null;
  if (usuarioAtual) usuario = usuarioAtual;
}

function guardarLocalmente(linha) {
  try {
    const anteriores = JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? "[]");
    // Só os 50 mais recentes: isto é rede de segurança, não arquivo morto.
    const identificada = linha._local_id ? linha : { ...linha, _local_id: novoIdLocal() };
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify([...anteriores, identificada].slice(-50)));
  } catch {
    /* sem espaço: paciência */
  }
}

function substituirErrosGuardados(linhas) {
  try {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(linhas.slice(-50)));
  } catch {
    /* registrar o erro continua sem poder derrubar o app */
  }
}

export function errosGuardados() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? "[]");
  } catch {
    return [];
  }
}

export function limparErrosGuardados() {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    /* idem */
  }
}

// Drena sem esperar outro erro acontecer. Linhas de outra conta permanecem no
// aparelho até aquela conta voltar, para respeitar a política de acesso.
export async function enviarErrosGuardados() {
  if (enviando || DATA_SOURCE !== "supabase" || !sb || !navigator.onLine) return;
  enviando = true;
  try {
    const todos = errosGuardados().map((linha) =>
      linha._local_id ? linha : { ...linha, _local_id: novoIdLocal() }
    );
    substituirErrosGuardados(todos);
    const idAtual = usuario()?.id ?? null;
    const enviados = new Set();
    for (const linha of todos) {
      if (linha.user_id != null && linha.user_id !== idAtual) {
        continue;
      }
      const { _local_id, ...linhaDoBanco } = linha;
      const { error } = await sb.from("app_errors").insert(linhaDoBanco);
      if (!error) enviados.add(_local_id);
    }
    // Relê antes de remover confirmações: erros que chegaram durante a rede
    // não faziam parte do lote e precisam continuar guardados.
    substituirErrosGuardados(errosGuardados().filter((linha) => !enviados.has(linha._local_id)));
  } catch {
    /* a falha do log permanece silenciosa */
  } finally {
    enviando = false;
  }
}

export async function registrarErro(erro, { origem = "tela", contexto = null } = {}) {
  try {
    const mensagem = sanitizarParaLog(String(erro?.message ?? erro ?? "erro sem mensagem")).slice(0, 500);
    const rota = location.hash.replace(/^#/, "") || "/";
    const chave = `${origem}|${rota}|${mensagem}`;
    const agora = Date.now();

    if (agora - (ultimos.get(chave) ?? 0) < JANELA_REPETICAO) return;
    ultimos.set(chave, agora);

    const u = usuario();
    const linha = {
      user_id: u?.id ?? null,
      papel: u?.role ?? null,
      rota,
      origem,
      mensagem,
      detalhe: sanitizarParaLog(String(erro?.stack ?? "")).slice(0, 2000) || null,
      contexto: sanitizarParaLog({ release: RELEASE_ID, codigo: erro?.code ?? null, ...contexto }),
      navegador: navigator.userAgent.slice(0, 300),
      online: navigator.onLine,
    };

    guardarLocalmente({ ...linha, created_at: new Date().toISOString() });
    await enviarErrosGuardados();
  } catch {
    // Log que derruba a tela seria pior que não ter log.
  }
}

// Erros que ninguém pegou: exceção solta e promessa rejeitada. É aqui que
// aparecem os erros de programação — os que a gente nem sabe que existem.
export function ligarCapturaGlobal() {
  window.addEventListener("error", (ev) => {
    registrarErro(ev.error ?? ev.message, {
      origem: "janela",
      contexto: { arquivo: ev.filename, linha: ev.lineno, coluna: ev.colno },
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    registrarErro(ev.reason, { origem: "promessa" });
  });
  window.addEventListener("online", enviarErrosGuardados);
  window.addEventListener("lpt:sessao", enviarErrosGuardados);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") enviarErrosGuardados();
  });
  enviarErrosGuardados();
}
