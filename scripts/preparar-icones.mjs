// Ícones do app instalado na tela inicial.
//
// Sem ícone de 192 e 512 no manifest, o Chrome não considera o site
// instalável e `beforeinstallprompt` nunca dispara — o botão "instalar" fica
// invisível para sempre sem nenhum erro no console. Era o caso aqui:
// `"icons": []`.
//
// Dois formatos, e a diferença importa:
// - `any`: a arte ocupa quase todo o quadrado, para quem desenha o ícone como está.
// - `maskable`: o Android recorta o ícone em círculo/squircle conforme o
//   aparelho. A arte fica dentro da "zona segura" (~80% central), senão os
//   braços do logo são cortados fora.
//
// Uso: node scripts/preparar-icones.mjs

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const LOGO = "assets/brand/logo-leo.png";
const DESTINO = "assets/icons";
const FUNDO = "#ffffff"; // o logo é arte preta com preenchimento branco: sobre preto ele some

// O arquivo do logo tem margem transparente em volta. Sem aparar, ela entra na
// conta do redimensionamento e a figura sai ainda menor dentro do quadrado —
// num ícone de 48 px isso é a diferença entre reconhecer o boneco e ver um
// borrão.
const logoAparado = await sharp(LOGO).trim().toBuffer();

async function gerar(tamanho, mascaravel) {
  // A arte é larga (uns 2,8:1): em `contain` quem manda é a largura, então
  // ocupação alta significa "encosta nas laterais". 80% na versão mascarável é
  // a zona segura do Android, que recorta o ícone em círculo no aparelho.
  const ocupacao = mascaravel ? 0.8 : 0.98;
  const arte = await sharp(logoAparado)
    .resize({
      width: Math.round(tamanho * ocupacao),
      height: Math.round(tamanho * ocupacao),
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const nome = `${DESTINO}/icone-${tamanho}${mascaravel ? "-maskable" : ""}.png`;
  const { size } = await sharp({
    create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO },
  })
    .composite([{ input: arte, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(nome);

  console.log(`${nome.padEnd(40)} ${(size / 1024).toFixed(0)} kB`);
}

await mkdir(DESTINO, { recursive: true });
for (const tamanho of [192, 512]) {
  await gerar(tamanho, false);
  await gerar(tamanho, true);
}
// O iOS ignora o manifest e usa `apple-touch-icon`, que não aceita
// transparência: fundo preto chapado já resolve.
await gerar(180, false);
console.log("\nOK: ícones em assets/icons/");
