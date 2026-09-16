const VERSAO = "2026.09.15-3";
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

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    await cache.addAll(ARQUIVOS_DO_APP);
    // O SDK também faz parte do app shell. Sem suas dependências, a primeira
    // reabertura offline poderia falhar mesmo com todo o código local salvo.
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

async function redePrimeiro(requisicao, fallback = null) {
  try {
    return await guardarEmRuntime(requisicao, await fetch(requisicao));
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
    evento.respondWith(redePrimeiro(requisicao, new URL("./index.html", self.registration.scope)));
    return;
  }

  const destino = requisicao.destination;
  const mudaComRelease = destino === "script" || destino === "style" || destino === "worker";
  evento.respondWith(mudaComRelease ? redePrimeiro(requisicao) : cachePrimeiro(requisicao));
});
