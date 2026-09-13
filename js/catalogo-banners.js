// As artes que o professor pode pôr no cabeçalho de cada divisão de treino.
//
// O banco guarda só o slug (`workout_days.banner`). O caminho do arquivo vive
// aqui: trocar a pasta ou a extensão das artes não vira migration, e uma arte
// removida daqui simplesmente deixa de ser desenhada, sem quebrar a ficha que
// ainda aponta para ela.
//
// Os arquivos saem de `node scripts/preparar-banners.mjs`, que recorta o chroma
// key das artes originais em `arte/`.

export const BANNERS = [
  { slug: "peito", rotulo: "Peito" },
  { slug: "costas", rotulo: "Costas" },
  { slug: "bracos", rotulo: "Braços" },
  { slug: "abdomen", rotulo: "Abdômen" },
  { slug: "gluteos", rotulo: "Glúteos" },
  { slug: "quad", rotulo: "Pernas" },
];

const PORslug = new Map(BANNERS.map((b) => [b.slug, b]));

export const bannerExiste = (slug) => PORslug.has(slug);

// Devolve null para slug desconhecido em vez de um caminho quebrado: assim a
// tela some com a arte em vez de mostrar o ícone de imagem partida.
export function caminhoDoBanner(slug) {
  return PORslug.has(slug) ? `assets/banners/${slug}.png` : null;
}

export const rotuloDoBanner = (slug) => PORslug.get(slug)?.rotulo ?? null;
