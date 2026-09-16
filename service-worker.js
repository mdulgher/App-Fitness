const VERSAO = "2026.09.16-1";
const PREFIXO = "lpt-";
const CACHE_SHELL = `${PREFIXO}shell-${VERSAO}`;
const CACHE_RUNTIME = `${PREFIXO}runtime-${VERSAO}`;

// Interface completa, sem dados pessoais. Fotos grandes de exercícios e
// banners são guardadas sob demanda depois de o usuário realmente abri-las.
const ARQUIVOS_DO_APP = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Logo%20e%20banner.jpg",
  "./css/style.css",
  "./css/refinement.css",
  "./css/exercises.css",
  "./css/aluno.css",
  "./assets/brand/logo-leo.png",
  "./assets/icons/icone-180.png",
  "./assets/icons/icone-192.png",
  "./assets/icons/icone-192-maskable.png",
  "./assets/icons/icone-512.png",
  "./assets/icons/icone-512-maskable.png",
  "./js/app.js",
  "./js/auth.js",
  "./js/calendar-grid.js",
  "./js/catalogo-banners.js",
  "./js/catalogo-ilustracoes.js",
  "./js/catalogo-peito.js",
  "./js/config.js",
  "./js/db-local.js",
  "./js/db-supabase.js",
  "./js/db.js",
  "./js/exercise-validation.js",
  "./js/icons.js",
  "./js/instalar.js",
  "./js/log.js",
  "./js/offline-snapshot.js",
  "./js/pix.js",
  "./js/pwa.js",
  "./js/router.js",
  "./js/seed.js",
  "./js/supabase-pagination.js",
  "./js/sync-queue.js",
  "./js/sync.js",
  "./js/treinos-realizados.js",
  "./js/utils.js",
  "./js/views/aluno-anotacoes.js",
  "./js/views/aluno-evolucao.js",
  "./js/views/aluno-financeiro.js",
  "./js/views/aluno-frequencia.js",
  "./js/views/aluno-lista.js",
  "./js/views/aluno-painel.js",
  "./js/views/aluno-treino.js",
  "./js/views/em-construcao.js",
  "./js/views/login.js",
  "./js/views/perfil.js",
  "./js/views/professor-aluno.js",
  "./js/views/professor-alunos.js",
  "./js/views/professor-exercicios.js",
  "./js/views/professor-ficha.js",
  "./js/views/professor-financeiro.js",
  "./js/views/professor-painel.js",
  "./js/views/professor-perfil.js",
];

const DEPENDENCIAS_EXTERNAS = [
  "https://esm.sh/@supabase/supabase-js@2.45.4?bundle",
  "https://esm.sh/node/buffer.mjs",
  "https://esm.sh/@supabase/supabase-js@2.45.4/es2022/supabase-js.bundle.mjs",
];
const ORIGENS_ESTATICAS = new Set([
  self.location.origin,
  "https://esm.sh",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
]);

// O Pages responde `Cache-Control: max-age=600` em TUDO — inclusive neste
// arquivo — e manda ETag. Dentro desses 10 minutos o navegador devolve o corpo
// guardado sem falar com o servidor, e `fetch` dentro do service worker também
// passa por esse cache.
//
// Foi assim que uma versão nova pré-cacheou arquivo velho: em 15/09/2026 o
// shell `lpt-shell-2026.09.15-3` guardou o JS da versão anterior, e o app
// publicado mostrou texto antigo com o deploy já pronto. Bater o número da
// versão não resolvia nada, porque o problema não era o nome do cache.
//
// `no-cache` força requisição condicional, e o Pages responde 304 com corpo
// vazio quando o arquivo não mudou — custo quase zero. Não é `reload` de
// propósito: aquele ignora o cache e baixaria os 55 arquivos inteiros a cada
// verificação, no 4G do aluno dentro da academia.
const revalidando = (url) => new Request(url, { cache: "no-cache" });

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);

    // Busca tudo antes de gravar qualquer coisa. `addAll` é tudo-ou-nada, e
    // perder essa garantia deixaria um shell pela metade parecendo instalado —
    // pior que não instalar, porque o offline passaria a mentir.
    const respostas = await Promise.all(ARQUIVOS_DO_APP.map((url) => fetch(revalidando(url))));
    const ruim = respostas.find((r) => !r.ok);
    if (ruim) throw new Error(`Instalação abortada: HTTP ${ruim.status} em ${ruim.url}`);
    await Promise.all(respostas.map((resposta, i) => cache.put(ARQUIVOS_DO_APP[i], resposta)));

    // O SDK também faz parte do app shell. Sem suas dependências, a primeira
    // reabertura offline poderia falhar mesmo com todo o código local salvo.
    // Aqui o `addAll` normal serve: a versão está na própria URL (`@2.45.4`),
    // então esses arquivos não envelhecem sem trocar de endereço.
    await cache.addAll(DEPENDENCIAS_EXTERNAS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const atuais = new Set([CACHE_SHELL, CACHE_RUNTIME]);
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter((nome) => nome.startsWith(PREFIXO) && !atuais.has(nome))
      .map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

async function guardarEmRuntime(requisicao, resposta) {
  if (!(resposta.ok || resposta.type === "opaque")) return resposta;
  const cache = await caches.open(CACHE_RUNTIME);
  await cache.put(requisicao, resposta.clone());
  return resposta;
}

// `paraBuscar` permite ir à rede com revalidação sem trocar a chave do cache,
// que continua sendo a requisição original — senão o que ficaria guardado não
// casaria com o que a página pede depois.
async function redePrimeiro(requisicao, { fallback = null, paraBuscar = requisicao } = {}) {
  try {
    return await guardarEmRuntime(requisicao, await fetch(paraBuscar));
  } catch {
    return (await caches.match(requisicao))
      ?? (fallback ? await caches.match(fallback) : null)
      ?? Response.error();
  }
}

async function cachePrimeiro(requisicao) {
  const salva = await caches.match(requisicao);
  if (salva) return salva;
  return redePrimeiro(requisicao);
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (!ORIGENS_ESTATICAS.has(url.origin)) return;

  if (requisicao.mode === "navigate") {
    evento.respondWith(redePrimeiro(requisicao, {
      fallback: new URL("./index.html", self.registration.scope),
    }));
    return;
  }

  const destino = requisicao.destination;
  const mudaComRelease = destino === "script" || destino === "style" || destino === "worker";

  // Só o que é nosso vai com revalidação. O SDK externo tem a versão na URL,
  // então revalidar seria pedido condicional a cada abertura sem nada a ganhar.
  const nosso = url.origin === self.location.origin;

  evento.respondWith(
    mudaComRelease
      ? redePrimeiro(requisicao, nosso ? { paraBuscar: revalidando(requisicao.url) } : {})
      : cachePrimeiro(requisicao)
  );
});
