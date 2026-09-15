// Leo Personal Trainning — ponto de entrada

import { APP_NAME, DATA_SOURCE, SUPABASE } from "./config.js";
import { db } from "./db.js";
import { restaurarSessao, usuarioAtual, ehProfessor, sair, rotaInicial, ligarTimeoutDeSessao } from "./auth.js";
import { iniciar, resolver, navegar, definirCallbackDeTroca, destinoAposLogin } from "./router.js";
import { esc, primeiroNome, iniciais, urlDeAvatarSeguro } from "./utils.js";
import { icone } from "./icons.js";
import { ligarSincronizacaoAutomatica } from "./sync.js";
import { configurarLog, ligarCapturaGlobal } from "./log.js";
import { ligarCapturaDoConvite, deveConvidar, podeInstalarDireto, instalar, dispensar, reabrirConvite, podeOferecerInstalacao } from "./instalar.js";
import { registrarPWA } from "./pwa.js";

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

  // Só aparece quando há o que fazer: some sozinho depois que o app é instalado.
  document.getElementById("instalar-app")
    .classList.toggle("hidden", !podeOferecerInstalacao());

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

// Sem este item, dispensar a faixa trancava a porta: o app não tinha mais
// nenhum lugar que ensinasse a instalar.
document.getElementById("instalar-app").addEventListener("click", () => {
  fecharMenuDaConta();
  reabrirConvite();
  conviteDesenhado = null;
  desenharConviteDeInstalar();
  document.getElementById("convite-instalar").scrollIntoView({ block: "nearest" });
});

document.getElementById("sair").addEventListener("click", async () => {
  fecharMenuDaConta();
  await sair();
  navegar("#/login");
  resolver();
});

// O convite aparece inclusive na tela de login, e isso é de propósito: quem
// entra pelo navegador e só depois instala abre o app recém-instalado sem sessão
// e precisa logar de novo. Instalando antes, loga uma vez só — dentro do app.
//
// iPhone e Android recebem coisas diferentes, e não é detalhe: o Android tem
// diálogo nativo, o iPhone não tem API nenhuma. Na primeira versão os dois
// viam o mesmo botão e o do iPhone abria uma instrução — que o CSS do celular
// escondia, porque a instrução mora num `.small` e `.small` estava com
// `display:none` abaixo de 700px. No aparelho, tocar o botão não fazia nada
// visível. Agora o iPhone recebe a instrução já escrita, sem intermediário.
let conviteDesenhado = null;

function desenharConviteDeInstalar() {
  const caixa = document.getElementById("convite-instalar");
  if (!deveConvidar()) {
    caixa.classList.add("hidden");
    caixa.innerHTML = "";
    conviteDesenhado = null;
    return;
  }

  const modo = podeInstalarDireto() ? "botao" : "ios";
  if (conviteDesenhado === modo) return;
  conviteDesenhado = modo;

  const fechar = `<button class="convite-fechar" id="convite-fechar" aria-label="Agora não">&times;</button>`;

  caixa.innerHTML = modo === "botao"
    ? `<img class="convite-icone" src="assets/icons/icone-192.png" alt="" aria-hidden="true" />
       <div class="convite-texto">
         <strong>Deixe o treino a um toque</strong>
         <span class="convite-detalhe">Instale na tela inicial e abra sem o navegador.</span>
       </div>
       <button class="btn btn-sm" id="convite-instalar-botao">Instalar</button>
       ${fechar}`
    : `<img class="convite-icone" src="assets/icons/icone-192.png" alt="" aria-hidden="true" />
       <div class="convite-texto">
         <strong>Deixe o treino a um toque</strong>
         <span class="convite-detalhe">
           Toque em <b>Compartilhar</b> ${icone("compartilhar")} aqui embaixo
           e escolha <b>Adicionar à Tela de Início</b>.
         </span>
       </div>
       ${fechar}`;

  caixa.classList.remove("hidden");

  caixa.querySelector("#convite-fechar").addEventListener("click", () => {
    dispensar();
    caixa.classList.add("hidden");
    conviteDesenhado = null;
  });

  caixa.querySelector("#convite-instalar-botao")?.addEventListener("click", async () => {
    const desfecho = await instalar();
    // "recusado" deixa a faixa no lugar: ele pode mudar de ideia.
    if (desfecho !== "recusado") {
      caixa.classList.add("hidden");
      conviteDesenhado = null;
    }
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
registrarPWA().catch((err) => registrarErro(err, { origem: "pwa", contexto: { acao: "registrarServiceWorker" } }));

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
  // Volta para o link que o usuario tentou abrir antes de entrar, quando havia um.
  navegar(usuarioAtual() ? destinoAposLogin(usuarioAtual().role) : rotaInicial());
  resolver();
});

// O nome no cabeçalho vem do perfil: quando ele muda em "Meu cadastro", o
// cabeçalho precisa ser redesenhado sem recarregar a página.
window.addEventListener("lpt:perfil", () => {
  desenharCabecalho(location.hash.replace(/^#/, ""));
});
