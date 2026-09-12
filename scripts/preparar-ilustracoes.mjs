// Converte as ilustrações do RepDB para o preto e branco do app.
//
// As originais vêm coloridas (fundo azul claro, camiseta azul, tom de pele) e
// o app não usa cor nenhuma. A licença do RepDB permite redimensionar, cortar e
// recolorir para uso dentro do aplicativo (termo 4) — e isto é conversão
// determinística, não restilização por IA, que o termo 5 proíbe.
//
// O fundo vira transparente em vez de branco: assim a figura "flutua" no card,
// que é o visual do Hevy, e funciona tanto no card claro quanto sobre fundo
// escuro.
//
// Uso: npm install sharp --no-save && node scripts/preparar-ilustracoes.mjs

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const ORIGEM = "assets/illustrations";
const DESTINO = "assets/illustrations/bw";
const POSES = ["start", "peak"];

// O fundo do RepDB é um azul claro uniforme. Detecta por luminância alta e
// tonalidade azulada, para não apagar o branco do tênis nem o cinza do banco.
const ehFundo = (r, g, b) => b > 200 && b >= r + 6 && g > 190 && r > 180;

async function prepararUma(pose) {
  const entrada = `${ORIGEM}/bench-press-${pose}.webp`;
  const { data, info } = await sharp(entrada)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = info.width * info.height;
  let transparentes = 0;

  for (let i = 0; i < px; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];

    if (ehFundo(r, g, b)) {
      data[p + 3] = 0;
      transparentes++;
      continue;
    }

    // Luminância perceptual (Rec. 709): converter por média achataria o azul da
    // camiseta e o tom de pele no mesmo cinza, apagando a separação entre eles.
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

    // Leve aumento de contraste em torno do meio-tom, para o contorno preto não
    // se perder e a figura não virar uma mancha cinza uniforme no card.
    const c = Math.max(0, Math.min(255, Math.round((y - 128) * 1.18 + 128)));
    data[p] = data[p + 1] = data[p + 2] = c;
  }

  await mkdir(DESTINO, { recursive: true });
  const saida = `${DESTINO}/bench-press-${pose}.png`;
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim() // corta a margem transparente que sobra em volta da figura
    .png({ compressionLevel: 9 })
    .toFile(saida);

  const meta = await sharp(saida).metadata();
  const pct = ((transparentes / px) * 100).toFixed(1);
  console.log(`${saida}: ${meta.width}x${meta.height}, ${pct}% de fundo removido.`);
}

for (const pose of POSES) await prepararUma(pose);
