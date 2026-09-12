// Leo Personal Trainning — ponto de entrada

import { APP_NAME } from "./config.js";
import { db } from "./db.js";
import { restaurarSessao, usuarioAtual, ehProfessor, sair, rotaInicial } from "./auth.js";
import { iniciar, resolver, navegar, definirCallbackDeTroca } from "./router.js";
import { esc, primeiroNome } from "./utils.js";

const NAV_PROFESSOR = [
  ["#/professor", "Painel"],
  ["#/professor/alunos", "Alunos"],
  ["#/professor/exercicios", "Exercícios"],
  ["#/professor/financeiro", "Financeiro"],
];

const NAV_ALUNO = [
  ["#/aluno", "Meu treino"],
  ["#/aluno/evolucao", "Evolução"],
  ["#/aluno/frequencia", "Frequência"],
  ["#/aluno/anotacoes", "Recados"],
  ["#/aluno/financeiro", "Financeiro"],
];

function desenharCabecalho(caminhoAtual) {
  const topbar = document.getElementById("topbar");
  const nav = document.getElementById("nav");
  const brand = document.getElementById("brand");
  const usuario = usuarioAtual();

  if (!usuario) {
    topbar.classList.add("hidden");
    return;
  }

  topbar.classList.remove("hidden");
  brand.href = rotaInicial();
  brand.textContent = ehProfessor() ? APP_NAME : primeiroNome(usuario.full_name);

  const itens = ehProfessor() ? NAV_PROFESSOR : NAV_ALUNO;
  nav.innerHTML = itens
    .map(([href, rotulo]) => {
      const ativo = href.replace("#", "") === caminhoAtual;
      return `<a class="navlink" href="${href}"${ativo ? ' aria-current="page"' : ""}>${esc(rotulo)}</a>`;
    })
    .join("");
}

document.getElementById("sair").addEventListener("click", () => {
  sair();
  navegar("#/login");
});

document.getElementById("resetar").addEventListener("click", async (e) => {
  e.preventDefault();
  if (!confirm("Recarregar os dados de teste? Tudo que você alterou será perdido.")) return;
  await db.reiniciarDados();
  location.reload();
});

definirCallbackDeTroca(desenharCabecalho);

await restaurarSessao();
iniciar();

// Reage ao login/logout feito dentro das telas.
window.addEventListener("lpt:sessao", () => {
  navegar(rotaInicial());
  resolver();
});
