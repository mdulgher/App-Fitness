import fs from 'node:fs/promises';
const base = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/';
const data = JSON.parse(await fs.readFile(new URL('../assets/illustrations/source.json', import.meta.url),'utf8'));
const sample = data.find(e=>e.id==='bench-press');
if (!sample?.images?.flat?.start || !sample.images.flat.peak) throw Error('Ilustrações de supino não encontradas.');
for (const [pose,source] of Object.entries(sample.images.flat)) {
  const res=await fetch(base+source); if(!res.ok) throw Error(`HTTP ${res.status}`);
  await fs.writeFile(new URL(`../assets/illustrations/bench-press-${pose}.webp`,import.meta.url),Buffer.from(await res.arrayBuffer()));
}
const license = await fetch(base+'LICENSE-DATA.md');
if(!license.ok) throw Error('Licença indisponível.');
await fs.writeFile(new URL('../assets/illustrations/LICENSE-DATA.md',import.meta.url),await license.text());
console.log('Modelo de supino: duas ilustrações e licença salvas.');
