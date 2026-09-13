// Leo Personal Trainning — sessão e papel
//
// Fino de proposito: quem sabe autenticar é a camada de dados (db-local.js
// finge, db-supabase.js faz de verdade). Aqui só se guarda o perfil carregado
// e se responde "quem é" e "para onde vai".

import { db } from "./db.js";
import { registrarErro } from "./log.js";

let usuario = null;

export async function restaurarSessao() {
  try {
    const conta = await db.usuarioDaSessao();
    usuario = conta ? await db.buscarPerfil(conta.id) : null;
  } catch (err) {
    registrarErro(err, { origem: "sessao", contexto: { acao: "restaurarSessao" } });
    usuario = null;
  }
  return usuario;
}

export function usuarioAtual() {
  return usuario;
}

// 'admin' tem os mesmos poderes do professor e vê as mesmas telas — é assim
// que o banco também enxerga (`is_trainer()` responde sim para os dois). O que
// muda é só o rótulo: o dono do sistema não é "o professor".
export const PAPEIS_DE_PROFESSOR = ["trainer", "admin"];

export function ehProfessor() {
  return PAPEIS_DE_PROFESSOR.includes(usuario?.role);
}

// O papel declarado na rota é o poder exigido, não a string exata do perfil:
// uma rota que pede "trainer" também aceita quem é admin.
export function cumprePapel(exigido, papel) {
  return exigido === "trainer" ? PAPEIS_DE_PROFESSOR.includes(papel) : exigido === papel;
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

// Depois de editar o próprio cadastro, o perfil em memória fica velho: o nome
// no cabeçalho e a saudação do painel continuariam mostrando o antigo até o
// próximo login.
export async function recarregarPerfil() {
  if (!usuario) return null;
  usuario = await db.buscarPerfil(usuario.id);
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

// Liga timeout de inatividade. Após `minutos` sem interação, chama `aoExpirar`.
// Eventos considerados "atividade": toque, clique, tecla, movimento do mouse.
// Só conta enquanto há sessão ativa — o timer para sozinho após o logout.
export function ligarTimeoutDeSessao(minutos, aoExpirar) {
  const MS = minutos * 60 * 1000;
  let timer = null;

  function resetar() {
    if (!usuario) return; // sem sessão, não agenda
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!usuario) return;
      await sair();
      aoExpirar();
    }, MS);
  }

  const EVENTOS = ["mousemove", "keydown", "touchstart", "click"];
  EVENTOS.forEach((ev) => document.addEventListener(ev, resetar, { passive: true }));

  resetar(); // começa a contar ao ligar
}
