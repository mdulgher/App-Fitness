import fs from 'node:fs/promises';
import { CATALOGO_PEITO } from '../js/catalogo-peito.js';
const source = JSON.parse(await fs.readFile(new URL('../assets/exercises/source-chest.json', import.meta.url), 'utf8'));
const base = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/';
const jobs = CATALOGO_PEITO.flatMap(item => {
  const original = source.find(e => e.id === item.sourceId);
  if (!original || original.images.length !== 2) throw Error(`Fonte incompleta: ${item.sourceId}`);
  return original.images.map(image => ({ image, target: new URL(`../assets/exercises/${image}`, import.meta.url) }));
});
// Downloads sem transformação: as fotos originais são preservadas.
for (let i = 0; i < jobs.length; i += 6) {
  await Promise.all(jobs.slice(i, i + 6).map(async ({ image, target }) => {
    try { if ((await fs.stat(target)).size > 1000) return; } catch {}
    const r = await fetch(`${base}exercises/${image}`);
    if (!r.ok) throw Error(`${image}: HTTP ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes[0] !== 255 || bytes[1] !== 216) throw Error(`JPEG inválido: ${image}`);
    await fs.mkdir(new URL('.', target), { recursive: true });
    await fs.writeFile(target, bytes);
  }));
}
const license = await fetch(`${base}LICENSE.md`);
if (!license.ok) throw Error(`Licença: HTTP ${license.status}`);
await fs.writeFile(new URL('../assets/exercises/LICENSE.md', import.meta.url), await license.text());
console.log(`${CATALOGO_PEITO.length} exercícios, ${jobs.length} fotos locais verificadas.`);
