// Leo Personal Trainning — sessão e papel
//
// Fino de proposito: quem sabe autenticar é a camada de dados (db-local.js
// finge, db-supabase.js faz de verdade). Aqui só se guarda o perfil carregado
// e se responde "quem é" e "para onde vai".

import { db } from "./db.js";

let usuario = null;

export async function restaurarSessao() {
  try {
    const conta = await db.usuarioDaSessao();
    usuario = conta ? await db.buscarPerfil(conta.id) : null;
  } catch {
    usuario = null;
  }
  return usuario;
}

export function usuarioAtual() {
  return usuario;
}

export function ehProfessor() {
  return usuario?.role === "trainer";
}

export async function entrar(email, senha) {
  const conta = await db.entrarComSenha(email, senha);
  usuario = await db.buscarPerfil(conta.id);
  if (!usuario) {
    // Conta existe mas o perfil não foi criado (gatilho falhou, ou cadastro
    // feito fora do app). Melhor falhar com mensagem clara do que deixar o
    // app rodar com um usuário sem papel.
    await db.sairDaConta();
    throw new Error("Sua conta existe mas está sem perfil. Avise o professor.");
  }
  return usuario;
}

export async function criarConta(email, senha, nome) {
  const conta = await db.criarConta(email, senha, nome);
  usuario = conta ? await db.buscarPerfil(conta.id) : null;
  // Perfil vazio aqui significa que o cadastro não abriu sessão: o Supabase
  // está exigindo confirmação por email. Sem tratar isso, a tela ficava
  // travada sem dizer nada ao usuário.
  return { precisaConfirmar: !usuario, usuario };
}

// Só existe no modo local: atalho para testar sem digitar email.
export async function entrarComoId(id) {
  if (!db.entrarComoId) throw new Error("Atalho indisponível com o banco conectado.");
  await db.entrarComoId(id);
  usuario = await db.buscarPerfil(id);
  return usuario;
}

export async function sair() {
  await db.sairDaConta();
  usuario = null;
}

export function rotaInicial() {
  if (!usuario) return "#/login";
  return ehProfessor() ? "#/professor" : "#/aluno";
}
