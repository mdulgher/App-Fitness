// "Instalar na tela inicial" — o convite para o app virar um app.
//
// O aluno usa isto na academia, com uma mão, e um atalho na tela inicial abre
// em tela cheia, sem barra de endereço, e guarda a sessão. A diferença prática
// é grande, mas quase ninguém descobre o menu do navegador sozinho.
//
// Os dois sistemas se comportam de formas diferentes, e isso não dá para
// esconder atrás de um botão só:
//
// - **Android/Chrome** dispara `beforeinstallprompt`. Dá para guardar o evento
//   e abrir o diálogo nativo no clique. Requisitos: HTTPS, manifest com
//   `display: standalone` e ícones de 192 e 512. Sem os ícones o evento
//   simplesmente nunca dispara — sem erro nenhum no console.
// - **iOS/Safari** não tem API de instalação. O único caminho é o usuário
//   tocar em Compartilhar → "Adicionar à Tela de Início". Então ali o botão
//   abre a instrução, não um diálogo.

const CHAVE_DISPENSADO = "lpt:instalar-dispensado";

let eventoAdiado = null;

export function jaInstalado() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true; // iOS
}

// iPhone e iPad. O iPad moderno se apresenta como Mac, então o toque é o que
// o distingue de um desktop de verdade.
export function ehIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function foiDispensado() {
  try {
    return localStorage.getItem(CHAVE_DISPENSADO) === "1";
  } catch {
    return false;
  }
}

export function dispensar() {
  try {
    localStorage.setItem(CHAVE_DISPENSADO, "1");
  } catch {
    /* navegação privada: o convite volta na próxima visita, e tudo bem */
  }
}

// Precisa ser registrado o quanto antes: o navegador dispara o evento uma vez
// só, e quem não estiver escutando na hora perde.
export function ligarCapturaDoConvite(aoMudar = () => {}) {
  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault(); // sem isto o Chrome mostra a própria barra
    eventoAdiado = ev;
    aoMudar();
  });
  window.addEventListener("appinstalled", () => {
    eventoAdiado = null;
    dispensar();
    aoMudar();
  });
}

export const podeInstalarDireto = () => eventoAdiado !== null;

// O convite só aparece quando tem o que oferecer: no Android, o evento; no
// iOS, a instrução. Em desktop sem suporte não aparece nada.
export function deveConvidar() {
  if (jaInstalado() || foiDispensado()) return false;
  return podeInstalarDireto() || ehIOS();
}

// Devolve 'instalado', 'recusado' ou 'instrucao' — quem chama decide o que
// mostrar. O evento serve uma vez só: depois de usado, some.
export async function instalar() {
  if (!eventoAdiado) return "instrucao";
  const evento = eventoAdiado;
  eventoAdiado = null;
  evento.prompt();
  const { outcome } = await evento.userChoice;
  if (outcome === "accepted") {
    dispensar();
    return "instalado";
  }
  return "recusado";
}
