// Leo Personal Trainning — sessão e controle de acesso
//
// FASE LOCAL: não existe senha de verdade. A tela de login é a definitiva,
// mas a verificação apenas confere se o email existe nos dados de teste.
// Na Fase 8 só o corpo de entrar() e sair() muda — o resto do app não sabe
// a diferença.

import { db } from "./db.js";

const CHAVE = "lpt.session.v1";

let usuario = null;

export async function restaurarSessao() {
  try {
    const id = localStorage.getItem(CHAVE);
    if (!id) return null;
    usuario = await db.buscarPerfil(id);
    return usuario;
  } catch {
    return null;
  }
}

export function usuarioAtual() {
  return usuario;
}

export function ehProfessor() {
  return usuario?.role === "trainer";
}

export async function entrar(email) {
  const perfis = await db.listarPerfis();
  const alvo = perfis.find(
    (p) => p.email?.toLowerCase().trim() === email.toLowerCase().trim()
  );
  if (!alvo) {
    throw new Error("Email não encontrado.");
  }
  usuario = alvo;
  try {
    localStorage.setItem(CHAVE, alvo.id);
  } catch {
    // Sem localStorage a sessão dura só enquanto a aba estiver aberta.
  }
  return alvo;
}

export async function entrarComoId(id) {
  usuario = await db.buscarPerfil(id);
  if (usuario) {
    try {
      localStorage.setItem(CHAVE, id);
    } catch {}
  }
  return usuario;
}

export function sair() {
  usuario = null;
  try {
    localStorage.removeItem(CHAVE);
  } catch {}
}

// Área inicial de cada papel.
export function rotaInicial() {
  if (!usuario) return "#/login";
  return ehProfessor() ? "#/professor" : "#/aluno";
}
