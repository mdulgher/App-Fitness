// Leo Personal Trainning — roteador de hash
//
// Uma página só, navegação por #/caminho. Cada rota declara o papel exigido,
// então o controle de acesso fica num lugar só em vez de repetido em dez
// arquivos HTML — e não há "pisca" de conteúdo antes da verificação.

import { usuarioAtual, ehProfessor, rotaInicial, cumprePapel } from "./auth.js";

const rotas = [
  { padrao: /^\/login$/, papel: null, view: () => import("./views/login.js") },

  // Professor
  { padrao: /^\/professor$/, papel: "trainer", view: () => import("./views/professor-painel.js") },
  { padrao: /^\/professor\/alunos$/, papel: "trainer", view: () => import("./views/professor-alunos.js") },
  { padrao: /^\/professor\/aluno\/([^/]+)$/, papel: "trainer", view: () => import("./views/professor-aluno.js") },
  { padrao: /^\/professor\/aluno\/([^/]+)\/ficha$/, papel: "trainer", view: () => import("./views/professor-ficha.js") },
  { padrao: /^\/professor\/exercicios$/, papel: "trainer", view: () => import("./views/professor-exercicios.js") },
  { padrao: /^\/professor\/financeiro$/, papel: "trainer", view: () => import("./views/professor-financeiro.js") },
  { padrao: /^\/professor\/perfil$/, papel: "trainer", view: () => import("./views/perfil.js") },

  // Aluno
  { padrao: /^\/aluno$/, papel: "student", view: () => import("./views/aluno-painel.js") },
  { padrao: /^\/aluno\/treino\/([^/]+)$/, papel: "student", view: () => import("./views/aluno-treino.js") },
  { padrao: /^\/aluno\/lista$/, papel: "student", view: () => import("./views/aluno-lista.js") },
  { padrao: /^\/aluno\/evolucao$/, papel: "student", view: () => import("./views/aluno-evolucao.js") },
  { padrao: /^\/aluno\/frequencia$/, papel: "student", view: () => import("./views/aluno-frequencia.js") },
  { padrao: /^\/aluno\/anotacoes$/, papel: "student", view: () => import("./views/aluno-anotacoes.js") },
  { padrao: /^\/aluno\/financeiro$/, papel: "student", view: () => import("./views/aluno-financeiro.js") },
  { padrao: /^\/aluno\/perfil$/, papel: "student", view: () => import("./views/perfil.js") },
];

function caminhoAtual() {
  const h = location.hash.replace(/^#/, "");
  return h || "/login";
}

function casar(caminho) {
  for (const rota of rotas) {
    const m = caminho.match(rota.padrao);
    if (m) return { rota, params: m.slice(1).map(decodeURIComponent) };
  }
  return null;
}

let aoTrocar = () => {};
let limparView = () => {};
let versaoDaRota = 0;

export function navegar(hash) {
  if (location.hash === hash) resolver();
  else location.hash = hash;
}

export function definirCallbackDeTroca(fn) {
  aoTrocar = fn;
}

export async function resolver() {
  const minhaVersao = ++versaoDaRota;
  const caminho = caminhoAtual();
  const achado = casar(caminho);
  const usuario = usuarioAtual();

  // Rota inexistente
  if (!achado) {
    navegar(rotaInicial());
    return;
  }

  const { rota, params } = achado;

  // Precisa estar logado
  if (rota.papel && !usuario) {
    navegar("#/login");
    return;
  }

  // Papel errado: manda para a própria área em vez de mostrar erro
  if (rota.papel && !cumprePapel(rota.papel, usuario.role)) {
    navegar(rotaInicial());
    return;
  }

  // Já logado tentando ver o login
  if (caminho === "/login" && usuario) {
    navegar(rotaInicial());
    return;
  }

  const modulo = await rota.view();
  if (minhaVersao !== versaoDaRota) return;
  const alvo = document.getElementById("view");
  limparView();
  limparView = () => {};
  const recipiente = document.createElement("div");
  alvo.replaceChildren(recipiente);
  aoTrocar(caminho);
  const limpar = await modulo.render(recipiente, { params, fase: rota.fase });
  if (minhaVersao !== versaoDaRota) {
    if (typeof limpar === "function") limpar();
    return;
  }
  limparView = typeof limpar === "function" ? limpar : () => {};
  window.scrollTo(0, 0);
}

export function iniciar() {
  window.addEventListener("hashchange", resolver);
  resolver();
}

export { ehProfessor };
