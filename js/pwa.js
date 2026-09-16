// Registro e atualização do app instalado.
//
// O service worker assume a nova versão imediatamente, mas a página só recarrega
// em ponto seguro. Recarregar na hora é o que parecia certo e não é: a troca de
// versão chega quando chega, e se chegar com o aluno na tela de treino ele perde
// o campo que estava digitando e o cronômetro de descanso — no meio da série,
// com o celular na mão. Uma atualização nunca vale isso.
//
// "Seguro" é decidido por quem chama (`ehSeguroRecarregar`), porque só o app
// sabe o que está em andamento. Página escondida dispensa a pergunta: o usuário
// não está olhando, e volta já na versão nova.

export async function registrarPWA({ ehSeguroRecarregar = () => true } = {}) {
  if (!("serviceWorker" in navigator)) return null;

  const jaEraControlado = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;
  let pendente = false;

  function tentarRecarregar() {
    if (!pendente || recarregando) return;
    if (document.visibilityState !== "hidden" && !ehSeguroRecarregar()) return;
    recarregando = true;
    location.reload();
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Sem controlador antes significa primeira visita: não havia versão velha
    // na tela, então não há o que recarregar.
    if (!jaEraControlado) return;
    pendente = true;
    tentarRecarregar();
  });

  // Os três momentos em que vale tentar de novo: o aluno saiu do app, trocou de
  // tela, ou a fila esvaziou (era ela que podia estar segurando).
  document.addEventListener("visibilitychange", tentarRecarregar);
  window.addEventListener("hashchange", tentarRecarregar);
  window.addEventListener("lpt:fila", tentarRecarregar);

  const registro = await navigator.serviceWorker.register("./service-worker.js");
  // Navegadores já verificam periodicamente, mas isto evita deixar uma versão
  // antiga aberta por dias quando o aluno usa sempre o mesmo atalho.
  registro.update().catch(() => {});
  return registro;
}
