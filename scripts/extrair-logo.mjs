// Extrai o mascote da arte original como PNG com fundo transparente.
//
// Antes, a logo era um recorte por CSS sobre "Logo e banner.jpg" com
// mix-blend-mode. Como a arte tem fundo verde e um brilho ao redor, sobrava
// verde no cabeçalho. Recortar melhor não resolveria: o verde está DENTRO da
// região do logotipo, encostado no desenho.
//
// Aqui o fundo é removido por preenchimento a partir das bordas: só vira
// transparente o que está conectado à borda do recorte. Assim o branco de
// dentro do mascote (camisa, olhos) é preservado, em vez de virar buraco —
// que é o que aconteceria removendo "tudo que é claro".
//
// Roda só quando a arte original mudar; o PNG gerado é versionado.
// Uso: npm install jimp --no-save && node scripts/extrair-logo.mjs

import { Jimp } from "jimp";
import { mkdir } from "node:fs/promises";

const ORIGEM = "Logo e banner.jpg";
const DESTINO = "assets/brand/logo-leo.png";

// Região do mascote na arte original (2816x1536), folgada de propósito:
// o recorte fino fica por conta do autocrop depois de remover o fundo.
const RECORTE = { x: 1130, y: 95, w: 560, h: 187 };

const ehVerde = (r, g, b) => g > r + 22 && g > b + 22;
const ehClaro = (r, g, b) => (r + g + b) / 3 > 165;

async function main() {
  const img = await Jimp.read(ORIGEM);
  img.crop({ x: RECORTE.x, y: RECORTE.y, w: RECORTE.w, h: RECORTE.h });

  const { width: L, height: A, data } = img.bitmap;
  const visitado = new Uint8Array(L * A);
  const fila = [];

  const ehFundo = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return ehVerde(r, g, b) || ehClaro(r, g, b);
  };

  const enfileirar = (x, y) => {
    if (x < 0 || y < 0 || x >= L || y >= A) return;
    const p = y * L + x;
    if (visitado[p]) return;
    if (!ehFundo(p * 4)) return;
    visitado[p] = 1;
    fila.push(p);
  };

  // Semeia por todas as bordas: o fundo é o que encosta na moldura.
  for (let x = 0; x < L; x++) { enfileirar(x, 0); enfileirar(x, A - 1); }
  for (let y = 0; y < A; y++) { enfileirar(0, y); enfileirar(L - 1, y); }

  while (fila.length) {
    const p = fila.pop();
    const x = p % L, y = (p / L) | 0;
    enfileirar(x + 1, y); enfileirar(x - 1, y);
    enfileirar(x, y + 1); enfileirar(x, y - 1);
  }

  let removidos = 0;
  for (let p = 0; p < L * A; p++) {
    if (!visitado[p]) continue;
    data[p * 4 + 3] = 0;
    removidos++;
  }

  // Sobra um halo de pixels meio-verdes na borda do desenho (o brilho da arte
  // original). Neutraliza a cor sem apagar o pixel, para o contorno não ficar
  // serrilhado nem esverdeado.
  for (let p = 0; p < L * A; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (!ehVerde(r, g, b)) continue;
    const cinza = Math.round((r + b) / 2);
    data[i] = data[i + 1] = data[i + 2] = cinza;
  }

  // Apara pela transparência, e não pelo autocrop do Jimp: ele compara cores e
  // deixava as laterais vazias. Aqui a régua é o alfa, que é o que importa.
  let x0 = L, y0 = A, x1 = -1, y1 = -1;
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      if (data[(y * L + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  img.crop({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });

  await mkdir("assets/brand", { recursive: true });
  await img.write(DESTINO);

  const pct = ((removidos / (L * A)) * 100).toFixed(1);
  console.log(`${DESTINO}: ${img.bitmap.width}x${img.bitmap.height}, ${pct}% do recorte virou transparente.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
