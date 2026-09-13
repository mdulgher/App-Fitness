// Leo Personal Trainning — ponto de entrada

import { APP_NAME, DATA_SOURCE, SUPABASE } from "./config.js";
import { db } from "./db.js";
import { restaurarSessao, usuarioAtual, ehProfessor, sair, rotaInicial, ligarTimeoutDeSessao } from "./auth.js";
import { iniciar, resolver, navegar, definirCallbackDeTroca } from "./router.js";
import { esc, primeiroNome, iniciais, urlDeAvatarSeguro } from "./utils.js";
import { icone } from "./icons.js";
import { ligarSincronizacaoAutomatica } from "./sync.js";
import { configurarLog, ligarCapturaGlobal } from "./log.js";
import { ligarCapturaDoConvite, deveConvidar, podeInstalarDireto, instalar, dispensar, ehIOS } from "./instalar.js";

const NAV_PROFESSOR = [
  ["#/professor", "Painel"],
  ["#/professor/alunos", "Alunos"],
  ["#/professor/exercicios", "Exercícios"],
  ["#/professor/financeiro", "Financeiro"],
];

const NAV_ALUNO = [
  ["#/aluno", "Meu treino"],
  ["#/aluno/lista", "Minha lista"],
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
  const cadastro = document.getElementById("meu-cadastro");
  cadastro.href = ehProfessor() ? "#/professor/perfil" : "#/aluno/perfil";
  cadastro.setAttribute("aria-current", caminhoAtual.endsWith("/perfil") ? "page" : "false");

  // A conta vira nome + avatar. O menu fecha a cada troca de tela: ele é
  // absoluto sobre o conteúdo e ficaria aberto por cima da tela nova.
  document.getElementById("conta-nome").textContent = primeiroNome(usuario.full_name);
  document.getElementById("conta-botao").setAttribute(
    "aria-label", `Conta de ${usuario.full_name}`
  );
  const avatarSeguro = urlDeAvatarSeguro(usuario.avatar_url);
  document.getElementById("conta-avatar").innerHTML = avatarSeguro
    ? `<img src="${esc(avatarSeguro)}" alt="" referrerpolicy="no-referrer" />`
    : esc(iniciais(usuario.full_name));
  fecharMenuDaConta();
  brand.href = rotaInicial();
  brand.innerHTML = `<span class="logo-crop" aria-hidden="true"></span><span class="brand-name">LEO<span>PERSONAL TRAINNING</span></span>`;
  brand.setAttribute("aria-label", APP_NAME);
  nav.setAttribute("aria-label", "Navegação principal");

  const itens = ehProfessor() ? NAV_PROFESSOR : NAV_ALUNO;
  nav.innerHTML = itens
    .map(([href, rotulo], indice) => {
      const ativo = href.replace("#", "") === caminhoAtual || (href === "#/professor/alunos" && caminhoAtual.startsWith("/professor/aluno/")) || (href === "#/aluno" && caminhoAtual.startsWith("/aluno/treino/"));
      const simbolos = ehProfessor()
        ? ["painel", "alunos", "treino", "financeiro"]
        : ["treino", "lista", "evolucao", "frequencia", "recados", "financeiro"];
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

/* ---------- menu da conta ---------- */

const contaBotao = document.getElementById("conta-botao");
const contaMenu = document.getElementById("conta-menu");

function fecharMenuDaConta() {
  contaMenu.classList.add("hidden");
  contaBotao.setAttribute("aria-expanded", "false");
}

contaBotao.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const aberto = contaBotao.getAttribute("aria-expanded") === "true";
  contaMenu.classList.toggle("hidden", aberto);
  contaBotao.setAttribute("aria-expanded", String(!aberto));
});

// Clicar em qualquer lugar fora fecha, inclusive num item do próprio menu: os
// dois itens levam para outro lugar, e menu aberto por cima da tela nova é bug.
document.addEventListener("click", (ev) => {
  if (ev.target.closest("#conta-botao")) return;
  fecharMenuDaConta();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  fecharMenuDaConta();
});

document.getElementById("sair").addEventListener("click", async () => {
  fecharMenuDaConta();
  await sair();
  navegar("#/login");
  resolver();
});

// O convite de instalar aparece só para quem está logado: na tela de login o
// usuário ainda não sabe se este app é dele, e um convite ali é propaganda.
function desenharConviteDeInstalar() {
  const caixa = document.getElementById("convite-instalar");
  if (!usuarioAtual() || !deveConvidar()) {
    caixa.classList.add("hidden");
    caixa.innerHTML = "";
    return;
  }
  if (caixa.dataset.desenhado === "1") return;
  caixa.dataset.desenhado = "1";

  caixa.innerHTML = `
    <img class="convite-icone" src="assets/icons/icone-192.png" alt="" aria-hidden="true" />
    <div class="convite-texto">
      <strong>Deixe o treino a um toque</strong>
      <span class="small">Instale na tela inicial e abra sem o navegador.</span>
    </div>
    <button class="btn btn-sm" id="convite-instalar-botao">${ehIOS() ? "Como instalar" : "Instalar"}</button>
    <button class="convite-fechar" id="convite-fechar" aria-label="Agora não">&times;</button>`;

  caixa.classList.remove("hidden");

  caixa.querySelector("#convite-fechar").addEventListener("click", () => {
    dispensar();
    caixa.classList.add("hidden");
  });

  caixa.querySelector("#convite-instalar-botao").addEventListener("click", async () => {
    if (podeInstalarDireto()) {
      const desfecho = await instalar();
      if (desfecho === "instalado") caixa.classList.add("hidden");
      if (desfecho === "recusado") return; // deixa o convite, ele pode mudar de ideia
      if (desfecho !== "instrucao") return;
    }
    // iOS, ou o evento se perdeu: só resta ensinar o caminho.
    caixa.innerHTML = `
      <img class="convite-icone" src="assets/icons/icone-192.png" alt="" aria-hidden="true" />
      <div class="convite-texto">
        <strong>No iPhone, são dois toques</strong>
        <span class="small">
          Toque em <b>Compartilhar</b> na barra do Safari e escolha
          <b>Adicionar à Tela de Início</b>.
        </span>
      </div>
      <button class="convite-fechar" id="convite-fechar" aria-label="Fechar">&times;</button>`;
    caixa.querySelector("#convite-fechar").addEventListener("click", () => {
      dispensar();
      caixa.classList.add("hidden");
    });
  });
}

// O log sobe antes de tudo: erro na partida é exatamente o que ninguém vê.
// O cliente do Supabase é injetado em vez de importado para o log continuar
// funcionando quando o problema for a própria camada de dados.
configurarLog({
  cliente: DATA_SOURCE === "supabase" ? (await import("./db-supabase.js")).sb : null,
  usuarioAtual,
});
ligarCapturaGlobal();

desenharBarraDeModo();

// Antes de qualquer await: o Chrome dispara `beforeinstallprompt` uma vez só,
// e quem não estiver escutando na hora perde o evento para sempre.
ligarCapturaDoConvite(() => desenharConviteDeInstalar());

definirCallbackDeTroca((caminho) => {
  desenharCabecalho(caminho);
  desenharConviteDeInstalar();
});

await restaurarSessao();
// A fila precisa saber qual aluno está autenticado antes da primeira tentativa.
ligarSincronizacaoAutomatica();
ligarTimeoutDeSessao(5, () => {
  navegar("#/login");
  resolver();
});
iniciar();

// Reage ao login/logout feito dentro das telas.
window.addEventListener("lpt:sessao", () => {
  navegar(rotaInicial());
  resolver();
});

// O nome no cabeçalho vem do perfil: quando ele muda em "Meu cadastro", o
// cabeçalho precisa ser redesenhado sem recarregar a página.
window.addEventListener("lpt:perfil", () => {
  desenharCabecalho(location.hash.replace(/^#/, ""));
});
