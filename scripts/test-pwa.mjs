import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const raiz = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await fs.readFile(path.join(raiz, "manifest.json"), "utf8"));
const sw = await fs.readFile(path.join(raiz, "service-worker.js"), "utf8");

assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.id, "./");

for (const icone of manifest.icons) {
  const arquivo = path.join(raiz, icone.src);
  const meta = await sharp(arquivo).metadata();
  const [largura, altura] = icone.sizes.split("x").map(Number);
  assert.equal(meta.width, largura, `${icone.src}: largura`);
  assert.equal(meta.height, altura, `${icone.src}: altura`);
}

for (const pasta of ["js", "css"]) {
  const arquivos = [];
  async function percorrer(dir) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const completo = path.join(dir, item.name);
      if (item.isDirectory()) await percorrer(completo);
      else arquivos.push(path.relative(raiz, completo).replaceAll(path.sep, "/"));
    }
  }
  await percorrer(path.join(raiz, pasta));
  for (const arquivo of arquivos) {
    assert.match(sw, new RegExp(`\\./${arquivo.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`), `${arquivo} no app shell`);
  }
}

const blocoDoShell = sw.match(/const ARQUIVOS_DO_APP = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const arquivosDoShell = [...blocoDoShell.matchAll(/"(\.\/[^\"]+)"/g)].map((m) => m[1]);
for (const url of arquivosDoShell) {
  if (url === "./") continue;
  const relativo = decodeURIComponent(url.slice(2));
  await fs.access(path.join(raiz, relativo));
}

assert.doesNotMatch(sw, /CREDENCIAIS|SENHAS-TESTE|\.local\.md/);
console.log(`OK: manifest, ${manifest.icons.length} ícones, ${arquivosDoShell.length} itens do app shell e política de atualização da PWA.`);
