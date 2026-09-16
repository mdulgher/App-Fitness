// Confere o site NO AR contra este repositório, arquivo por arquivo.
//
// Por que existe: publicar é dar push, e até hoje a conferência do que o Pages
// realmente entrega era manual ("conferido pela fonte servida"). Dois erros
// reais desta classe já aconteceram — o service worker pré-cacheando o corpo
// antigo sob o nome da versão nova (`d0e0a08`) e a dúvida recorrente de "o
// push pegou?" quando o iPhone mostra tela velha. Ler o commit no GitHub não
// responde: quem responde é o byte que o servidor devolve.
//
// O que ele prova: cada arquivo do app shell servido por
// https://mdulgher.github.io/App-Fitness/ é idêntico ao arquivo local, e a
// release embutida no `service-worker.js` servido é a mesma daqui.
//
// O que ele NÃO prova: o que o service worker já guardou no aparelho de alguém.
// Cache de cliente só se confere no cliente — ver o roteiro do `TESTES.md`.
//
// ESTE TESTE É DE DEPOIS DO PUSH, não de antes. Com mudança local ainda não
// publicada ele fica vermelho com razão: o repositório está legitimamente à
// frente do que está no ar. Não entra na lista de verificações pré-publicação
// da seção 2 do TESTES.md — ele é o passo seguinte ao `git push`.
//
// Divergência nem sempre é bug: o Pages manda `max-age=600`, então logo depois
// de um push o servidor ainda pode estar entregando o arquivo anterior. Por
// isso o relatório imprime o `age` de cada divergência — se vier abaixo de 600,
// é propagação, não regressão. Rode de novo passados dez minutos.
//
//   node scripts/test-publicado.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://mdulgher.github.io/App-Fitness/";
const raiz = path.resolve(import.meta.dirname, "..");

const sw = await fs.readFile(path.join(raiz, "service-worker.js"), "utf8");
const blocoDoShell = sw.match(/const ARQUIVOS_DO_APP = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const arquivos = [...blocoDoShell.matchAll(/"(\.\/[^"]+)"/g)]
  .map((m) => m[1])
  .filter((url) => url !== "./")
  .map((url) => decodeURIComponent(url.slice(2)));

assert.ok(arquivos.length > 0, "app shell vazio: o formato de ARQUIVOS_DO_APP mudou?");

// O `service-worker.js` não entra no app shell (ele é quem cacheia), mas é
// justamente o arquivo cuja versão velha causa o bug — então entra aqui.
const paraConferir = [...arquivos, "service-worker.js", "index.html", "manifest.json"];

// Neste Windows o `core.autocrlf` deixa CRLF no working copy de todo arquivo
// que o git já entregou, enquanto o Pages serve o que está no commit, com LF.
// Comparar byte a byte acusaria meia dúzia de arquivos idênticos — ruído que
// treina a gente a ignorar o teste. Texto se compara normalizado; binário, não.
const EXTENSOES_DE_TEXTO = new Set([".js", ".mjs", ".css", ".html", ".json", ".webmanifest", ".svg", ".txt", ".md"]);
const ehTexto = (arquivo) => EXTENSOES_DE_TEXTO.has(path.extname(arquivo).toLowerCase());
const normalizar = (buffer) => buffer.toString("utf8").replaceAll("\r\n", "\n");

const divergentes = [];
const ausentes = [];
let iguais = 0;

for (const arquivo of paraConferir) {
  const local = await fs.readFile(path.join(raiz, arquivo));
  const resposta = await fetch(BASE + arquivo.split("/").map(encodeURIComponent).join("/"), {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!resposta.ok) {
    ausentes.push({ arquivo, status: resposta.status });
    continue;
  }
  const servido = Buffer.from(await resposta.arrayBuffer());
  const igual = ehTexto(arquivo)
    ? normalizar(servido) === normalizar(local)
    : servido.equals(local);
  if (igual) iguais++;
  else divergentes.push({ arquivo, local: local.length, servido: servido.length, age: resposta.headers.get("age") });
}

const releaseLocal = sw.match(/const RELEASE = "([^"]+)"/)?.[1] ?? sw.match(/(\d{4}\.\d{2}\.\d{2}-\d+)/)?.[1];
const swServido = await (await fetch(BASE + "service-worker.js", { cache: "no-store" })).text();
const releaseServida = swServido.match(/const RELEASE = "([^"]+)"/)?.[1] ?? swServido.match(/(\d{4}\.\d{2}\.\d{2}-\d+)/)?.[1];

if (ausentes.length) {
  console.error("Arquivos que o servidor não entregou:");
  for (const a of ausentes) console.error(`  ${a.arquivo} → HTTP ${a.status}`);
}
if (divergentes.length) {
  console.error("Servido diferente do local:");
  for (const d of divergentes) {
    const idade = d.age == null ? "sem age" : `age=${d.age}s`;
    console.error(`  ${d.arquivo} — local ${d.local}B, servido ${d.servido}B (${idade})`);
  }
  console.error("age abaixo de 600 costuma ser propagação do Pages; repita em dez minutos.");
}

assert.equal(ausentes.length, 0, "arquivo do app shell não está no ar");
assert.equal(divergentes.length, 0, "o que está no ar não é o que está no repositório");
assert.equal(releaseServida, releaseLocal, "a release servida não é a deste repositório");

console.log(
  `OK: ${iguais} arquivos idênticos entre o repositório e ${BASE}, release ${releaseServida} nos dois lados.`
);
