// Leo Personal Trainning — ponto de entrada

import { APP_NAME, DATA_SOURCE, SUPABASE } from "./config.js";
import { db } from "./db.js";
import { restaurarSessao, usuarioAtual, ehProfessor, sair, rotaInicial } from "./auth.js";
import { iniciar, resolver, navegar, definirCallbackDeTroca } from "./router.js";
import { esc, primeiroNome } from "./utils.js";
import { icone } from "./icons.js";

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
  brand.innerHTML = `<span class="logo-crop" aria-hidden="true"></span><span class="brand-name">LEO<span>PERSONAL TRAINNING</span></span>`;
  brand.setAttribute("aria-label", APP_NAME);
  nav.setAttribute("aria-label", "Navegação principal");

  const itens = ehProfessor() ? NAV_PROFESSOR : NAV_ALUNO;
  nav.innerHTML = itens
    .map(([href, rotulo], indice) => {
      const ativo = href.replace("#", "") === caminhoAtual || (href === "#/professor/alunos" && caminhoAtual.startsWith("/professor/aluno/")) || (href === "#/aluno" && caminhoAtual.startsWith("/aluno/treino/"));
      const simbolos = ehProfessor() ? ["painel", "alunos", "treino", "financeiro"] : ["treino", "evolucao", "frequencia", "recados", "financeiro"];
      return `<a class="navlink" href="${href}"${ativo ? ' aria-current="page"' : ""}>${icone(simbolos[indice])}<span>${esc(rotulo)}</span></a>`;
    })
    .join("");
}

// A barra só aparece no modo local, e diz exatamente o que aquele modo NÃO
// garante — para ninguém confundir o protótipo com o app de verdade.
function desenharBarraDeModo() {
  const barra = document.getElementById("devbar");
  if (DATA_SOURCE !== "local") {
    barra.classList.add("hidden");
    return;
  }
  barra.classList.remove("hidden");
  barra.innerHTML = `
    <strong>Ambiente de teste</strong> — dados neste navegador, sem banco e sem senha.
    <a href="#" id="resetar" style="color:#fff">Recarregar dados</a>`;
  barra.querySelector("#resetar").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!confirm("Recarregar os dados de teste? Tudo que você alterou será perdido.")) return;
    await db.reiniciarDados();
    location.reload();
  });
}

document.getElementById("sair").addEventListener("click", async () => {
  await sair();
  navegar("#/login");
  resolver();
});

desenharBarraDeModo();

definirCallbackDeTroca(desenharCabecalho);

await restaurarSessao();
iniciar();

// Reage ao login/logout feito dentro das telas.
window.addEventListener("lpt:sessao", () => {
  navegar(rotaInicial());
  resolver();
});
