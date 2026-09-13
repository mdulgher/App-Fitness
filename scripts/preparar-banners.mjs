// Recorta as artes de `arte/` para o banner da divisão de treino.
//
// O dono entregou as imagens já com chroma key (fundo verde puro, ~(20,240,10)).
// Aqui o verde vira transparência, a figura é recortada na caixa que ela ocupa
// de verdade e sai em PNG com alfa — a arte fica sobre o banner preto do
// cabeçalho sem retângulo em volta.
//
// Por que não deixar o JPG original no repositório: são 2 MB cada, 12 MB no
// total, num repositório público servido pelo GitHub Pages. O banner mostra a
// figura com ~180 px de altura; carregar 1536 px para isso gasta a franquia de
// dados do aluno na academia sem nenhum ganho visível.
//
// Uso: node scripts/preparar-banners.mjs

import sharp from "sharp";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const ORIGEM = "arte";
const DESTINO = "assets/banners";
const ALTURA = 400; // 2x o tamanho de exibição, para telas retina

// A transição não é dura de propósito: o verde tem borda suavizada contra o
// contorno branco da figura, e cortar em degrau deixaria serrilhado.
const VERDE_TOTAL = 120; // daqui para cima é fundo
const VERDE_NENHUM = 40; // daqui para baixo é figura

// Acentos e maiúsculas no nome do arquivo viram problema em URL e em servidor
// que diferencia caixa. O slug é o que vai para o banco.
const slug = (nome) => nome
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function prepararUma(arquivo) {
  const nome = slug(path.parse(arquivo).name);
  const { data, info } = await sharp(path.join(ORIGEM, arquivo))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const verde = g - Math.max(r, b);

      let alfa = 255;
      if (verde >= VERDE_TOTAL) alfa = 0;
      else if (verde > VERDE_NENHUM) {
        alfa = Math.round(255 * (1 - (verde - VERDE_NENHUM) / (VERDE_TOTAL - VERDE_NENHUM)));
      }
      data[p + 3] = alfa;

      if (alfa === 0) continue;

      // Tira o verde que sobra na borda semitransparente. Sem isso a figura
      // ganha um halo esverdeado visível sobre o preto do banner.
      if (g > Math.max(r, b)) data[p + 1] = Math.max(r, b);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error(`${arquivo}: a imagem inteira foi lida como fundo.`);

  const recortada = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ height: ALTURA, withoutEnlargement: true });

  const saida = path.join(DESTINO, `${nome}.png`);
  const { size } = await recortada.png({ compressionLevel: 9, palette: true }).toFile(saida);
  const dim = await sharp(saida).metadata();
  console.log(`${nome.padEnd(10)} ${String(dim.width).padStart(4)}x${dim.height}  ${(size / 1024).toFixed(0)} kB`);
  return nome;
}

await mkdir(DESTINO, { recursive: true });
const arquivos = (await readdir(ORIGEM)).filter((f) => /\.(jpe?g|png)$/i.test(f));
if (!arquivos.length) throw new Error(`Nenhuma arte em ${ORIGEM}/.`);

const nomes = [];
for (const arquivo of arquivos) nomes.push(await prepararUma(arquivo));
console.log(`\nOK: ${nomes.length} banners em ${DESTINO}/ — ${nomes.join(", ")}`);
