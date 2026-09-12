// Leo Personal Trainning — roteador de hash
//
// Uma página só, navegação por #/caminho. Cada rota declara o papel exigido,
// então o controle de acesso fica num lugar só em vez de repetido em dez
// arquivos HTML — e não há "pisca" de conteúdo antes da verificação.

import { usuarioAtual, ehProfessor, rotaInicial } from "./auth.js";

const rotas = [
  { padrao: /^\/login$/, papel: null, view: () => import("./views/login.js") },

  // Professor
  { padrao: /^\/professor$/, papel: "trainer", view: () => import("./views/professor-painel.js") },
  { padrao: /^\/professor\/alunos$/, papel: "trainer", view: () => import("./views/professor-alunos.js") },
  { padrao: /^\/professor\/aluno\/([^/]+)$/, papel: "trainer", view: () => import("./views/professor-aluno.js") },
  { padrao: /^\/professor\/exercicios$/, papel: "trainer", view: () => import("./views/professor-exercicios.js") },
  { padrao: /^\/professor\/financeiro$/, papel: "trainer", view: () => import("./views/professor-financeiro.js") },

  // Aluno
  { padrao: /^\/aluno$/, papel: "student", view: () => import("./views/aluno-painel.js") },
  { padrao: /^\/aluno\/treino\/([^/]+)$/, papel: "student", view: () => import("./views/em-construcao.js"), fase: "4 — Treino do dia com registro de carga" },
  { padrao: /^\/aluno\/evolucao$/, papel: "student", view: () => import("./views/em-construcao.js"), fase: "4 — Minha evolução" },
  { padrao: /^\/aluno\/frequencia$/, papel: "student", view: () => import("./views/em-construcao.js"), fase: "4 — Frequência" },
  { padrao: /^\/aluno\/anotacoes$/, papel: "student", view: () => import("./views/em-construcao.js"), fase: "4 — Anotações" },
  { padrao: /^\/aluno\/financeiro$/, papel: "student", view: () => import("./views/aluno-financeiro.js") },
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

export function navegar(hash) {
  if (location.hash === hash) resolver();
  else location.hash = hash;
}

export function definirCallbackDeTroca(fn) {
  aoTrocar = fn;
}

export async function resolver() {
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
  if (rota.papel && rota.papel !== usuario.role) {
    navegar(rotaInicial());
    return;
  }

  // Já logado tentando ver o login
  if (caminho === "/login" && usuario) {
    navegar(rotaInicial());
    return;
  }

  const modulo = await rota.view();
  const alvo = document.getElementById("view");
  alvo.innerHTML = "";
  aoTrocar(caminho);
  await modulo.render(alvo, { params, fase: rota.fase });
  window.scrollTo(0, 0);
}

export function iniciar() {
  window.addEventListener("hashchange", resolver);
  resolver();
}

export { ehProfessor };
