// Registro e atualização do app instalado. O service worker assume a nova
// versão imediatamente; se já havia uma versão controlando a página, recarrega
// uma única vez para não misturar HTML antigo com módulos novos.

export async function registrarPWA() {
  if (!("serviceWorker" in navigator)) return null;

  const jaEraControlado = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!jaEraControlado || recarregando) return;
    recarregando = true;
    location.reload();
  });

  const registro = await navigator.serviceWorker.register("./service-worker.js");
  // Navegadores já verificam periodicamente, mas isto evita deixar uma versão
  // antiga aberta por dias quando o aluno usa sempre o mesmo atalho.
  registro.update().catch(() => {});
  return registro;
}
