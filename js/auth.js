// Leo Personal Trainning — sessão e papel
//
// Fino de proposito: quem sabe autenticar é a camada de dados (db-local.js
// finge, db-supabase.js faz de verdade). Aqui só se guarda o perfil carregado
// e se responde "quem é" e "para onde vai".

import { db } from "./db.js";
import { registrarErro } from "./log.js";

let usuario = null;

// Aluno bloqueado não fica com o app pela metade: sem isso ele entraria e veria
// todas as telas vazias, porque a RLS recusa os dados dele — parecendo bug, e
// não a decisão que o professor tomou. A trava de verdade continua no banco;
// isto aqui é só o recado.
const ACESSO_BLOQUEADO = "Seu acesso está bloqueado. Fale com o professor.";

async function bloqueado() {
  if (!usuario || ehProfessor()) return false;
  try {
    return await db.meuAcessoBloqueado();
  } catch {
    // Falha de rede não vira bloqueio: quem recusa o dado é o banco, e se ele
    // não respondeu as telas vão tratar o erro delas.
    return false;
  }
}

export async function restaurarSessao() {
  try {
    const conta = await db.usuarioDaSessao();
    usuario = conta ? await db.buscarPerfil(conta.id) : null;
    if (await bloqueado()) {
      await db.sairDaConta();
      usuario = null;
    }
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
  if (await bloqueado()) {
    await db.sairDaConta();
    usuario = null;
    throw new Error(ACESSO_BLOQUEADO);
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

// Sair sempre encerra a sessão local, mesmo que o servidor recuse. Manter o
// usuário "logado" na tela porque o `signOut` falhou é o pior dos dois mundos:
// ele fica com uma sessão que não funciona mais e sem caminho para refazer o
// login. Quem chama trata o erro — a saída em si não é negociável.
export async function sair() {
  try {
    await db.sairDaConta();
  } finally {
    usuario = null;
  }
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
    // Limpar antes da guarda: no logout, `usuario` já é null e o timer antigo
    // continuava agendado. Ele não derrubava ninguém (a guarda de dentro segura),
    // mas ficava rodando sem dono.
    clearTimeout(timer);
    if (!usuario) return; // sem sessão, não há o que expirar
    timer = setTimeout(async () => {
      if (!usuario) return;
      // `aoExpirar()` tem de rodar mesmo se a saída der erro: o que protege o
      // aparelho emprestado é a tela voltar para o login. Sem este try, um
      // `signOut` recusado virava rejeição solta e a sessão expirada ficava na
      // tela como se nada tivesse acontecido.
      try {
        await sair();
      } catch (err) {
        registrarErro(err, { origem: "sessao", contexto: { acao: "expirarSessao" } });
      }
      aoExpirar();
    }, MS);
  }

  const EVENTOS = ["mousemove", "keydown", "touchstart", "click"];
  EVENTOS.forEach((ev) => document.addEventListener(ev, resetar, { passive: true }));

  // O login é o momento em que o relógio precisa começar, e era justamente o
  // que faltava. Esta função é chamada uma vez, na partida do app, quando em
  // geral ninguém está logado: `resetar()` caía na guarda e não agendava nada.
  // Depois só um evento de mouse ou toque religava a contagem — e o clique do
  // próprio "Entrar" não serve, porque ele borbulha até o `document` antes de
  // `entrar()` terminar e definir o usuário. Quem entrava e deixava o celular
  // na mesa ficava com a sessão aberta sem prazo.
  window.addEventListener("lpt:sessao", resetar);

  resetar(); // e conta desde já quando a sessão foi restaurada do armazenamento
}
