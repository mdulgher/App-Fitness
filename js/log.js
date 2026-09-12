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

import { DATA_SOURCE } from "./config.js";

const CHAVE_LOCAL = "lpt:erros";
const JANELA_REPETICAO = 60_000;
const ultimos = new Map();

let sb = null;
let usuario = () => null;

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
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify([...anteriores, linha].slice(-50)));
  } catch {
    /* sem espaço: paciência */
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

export async function registrarErro(erro, { origem = "tela", contexto = null } = {}) {
  try {
    const mensagem = String(erro?.message ?? erro ?? "erro sem mensagem").slice(0, 500);
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
      detalhe: String(erro?.stack ?? "").slice(0, 2000) || null,
      contexto,
      navegador: navigator.userAgent.slice(0, 300),
      online: navigator.onLine,
    };

    // Sem banco (modo local) ou sem rede: fica no aparelho. A próxima chamada
    // com rede leva o que está guardado junto.
    if (DATA_SOURCE !== "supabase" || !sb || !navigator.onLine) {
      guardarLocalmente({ ...linha, created_at: new Date().toISOString() });
      return;
    }

    const pendentes = errosGuardados();
    const { error } = await sb.from("app_errors").insert(pendentes.length ? [...pendentes, linha] : linha);
    if (error) guardarLocalmente({ ...linha, created_at: new Date().toISOString() });
    else if (pendentes.length) limparErrosGuardados();
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
}
