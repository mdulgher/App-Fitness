// Leo Personal Trainning — roteador de hash
//
// Uma página só, navegação por #/caminho. Cada rota declara o papel exigido,
// então o controle de acesso fica num lugar só em vez de repetido em dez
// arquivos HTML — e não há "pisca" de conteúdo antes da verificação.

import { usuarioAtual, ehProfessor, rotaInicial, cumprePapel } from "./auth.js";
import { esc } from "./utils.js";
import { registrarErro } from "./log.js";

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

// `decodeURIComponent` estoura com URIError em sequência malformada — um "%"
// solto no fim do endereço basta, e é o que acontece quando alguém corta um
// link colado no WhatsApp. Estourando aqui, `resolver()` rejeitava e a tela
// ficava em branco sem nada na frente do usuário.
//
// O valor cru é a melhor resposta: um id que não decodifica também não existe
// no banco, então a tela cai no "não encontrado" que ela já sabe mostrar, em
// vez de num redirecionamento que parece bug.
function decodificar(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function casar(caminho) {
  for (const rota of rotas) {
    const m = caminho.match(rota.padrao);
    if (m) return { rota, params: m.slice(1).map(decodificar) };
  }
  return null;
}

let aoTrocar = () => {};
let limparView = () => {};
let versaoDaRota = 0;
let destinoPendente = null;

// Para onde ir depois do login: o link que o usuário tentou abrir, se o papel
// dele permitir, senão a própria área. Consome o destino — recusado ou usado,
// ele não vale para o próximo login.
export function destinoAposLogin(papel) {
  const caminho = destinoPendente;
  destinoPendente = null;
  if (!caminho) return rotaInicial();
  const achado = casar(caminho);
  if (!achado?.rota.papel || !cumprePapel(achado.rota.papel, papel)) return rotaInicial();
  return `#${caminho}`;
}

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

  // Precisa estar logado. O destino fica guardado: quem chega por um link
  // direto — a cobrança no WhatsApp aponta para o financeiro — cairia no
  // painel depois de entrar e teria que procurar a tela de novo.
  if (rota.papel && !usuario) {
    destinoPendente = caminho;
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

  // Carregar o módulo é rede: sem sinal e fora do cache do service worker, ou
  // depois de um deploy que trocou os arquivos, o import falha. Sem este
  // try/catch a promessa rejeitava e o app ficava na tela anterior para sempre.
  let modulo;
  try {
    modulo = await rota.view();
  } catch (err) {
    if (minhaVersao !== versaoDaRota) return;
    mostrarFalhaDaTela(err, caminho, "carregarModulo");
    return;
  }
  if (minhaVersao !== versaoDaRota) return;

  const alvo = document.getElementById("view");
  limparView();
  limparView = () => {};
  const recipiente = document.createElement("div");
  alvo.replaceChildren(recipiente);
  aoTrocar(caminho);

  let limpar;
  try {
    limpar = await modulo.render(recipiente, { params, fase: rota.fase });
  } catch (err) {
    if (minhaVersao !== versaoDaRota) return;
    mostrarFalhaDaTela(err, caminho, "renderizar");
    return;
  }

  if (minhaVersao !== versaoDaRota) {
    if (typeof limpar === "function") limpar();
    return;
  }
  limparView = typeof limpar === "function" ? limpar : () => {};
  window.scrollTo(0, 0);
}

// O último anteparo: uma tela que quebra no meio do `render` deixava a área de
// conteúdo vazia, sem texto e sem saída — e o usuário não tem console para
// descobrir o motivo. Aqui ele lê que falhou e tem os dois caminhos que
// resolvem quase sempre: tentar de novo e voltar para a própria área.
//
// Vale notar o limite: `render` que estourou não devolveu função de limpeza, e
// listener que ele tenha pendurado no `window` antes de quebrar fica solto. Os
// do próprio DOM vão embora com o conteúdo trocado aqui.
function mostrarFalhaDaTela(err, caminho, acao) {
  registrarErro(err, { origem: "rota", contexto: { rota: caminho, acao } });

  // A falha no import acontece antes de a tela anterior ser desmontada: sem
  // isto, o conteúdo dela sai do DOM aqui embaixo com a limpeza pendente.
  limparView();
  limparView = () => {};

  const alvo = document.getElementById("view");
  if (!alvo) return;

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <div class="eyebrow">Esta tela não abriu</div>
        <h1>Algo falhou aqui.</h1>
        <p class="muted page-description">
          ${acao === "carregarModulo"
            ? "Pode ser a conexão, ou uma versão nova do app que ainda está chegando."
            : "O restante do app continua funcionando."}
        </p>
      </div>
      <div class="card">
        <p class="muted small" style="margin:0 0 var(--sp-4)">${esc(err?.message ?? "Erro sem mensagem.")}</p>
        <button class="btn btn-primary btn-block" id="tentar-de-novo" type="button">Tentar de novo</button>
        <a class="btn btn-block" href="${esc(rotaInicial())}" style="margin-top:var(--sp-2)">Voltar para o início</a>
      </div>
    </div>`;

  alvo.querySelector("#tentar-de-novo").addEventListener("click", () => resolver());
}

export function iniciar() {
  window.addEventListener("hashchange", resolver);
  resolver();
}

export { ehProfessor };
