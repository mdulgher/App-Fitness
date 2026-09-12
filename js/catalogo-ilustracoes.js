// Ilustrações vetoriais do movimento, em duas posições.
//
// Fonte: RepDB (repdb.co), convertidas para o preto e branco do app por
// scripts/preparar-ilustracoes.mjs. A licença permite uso comercial dentro de
// aplicativos e exige atribuição visível — por isso `credito` acompanha cada
// referência, em vez de o texto ficar fixo na tela: já são duas fontes de
// mídia com licenças diferentes, e misturá-las daria crédito errado.
//
// A segunda posição é por convenção de nome (`-start` / `-peak`), não por
// tabela: assim acrescentar um exercício novo é só rodar o script e incluir o
// identificador na lista abaixo.

const DISPONIVEIS = ["bench-press"];

const CREDITO = {
  texto: "Ilustrações: RepDB",
  fonte: "https://repdb.co",
};

export function caminhoDaIlustracao(id, pose = "start") {
  return `assets/illustrations/bw/${id}-${pose}.png`;
}

export function referenciaDaIlustracao(photo) {
  const m = /^assets\/illustrations\/bw\/([a-z0-9-]+)-(?:start|peak)\.png$/.exec(photo ?? "");
  if (!m || !DISPONIVEIS.includes(m[1])) return null;
  return {
    photo_url: caminhoDaIlustracao(m[1], "start"),
    segundaFoto: caminhoDaIlustracao(m[1], "peak"),
    categoria: null,
    credito: CREDITO.texto,
    fonte: CREDITO.fonte,
  };
}

export function ilustracoesDisponiveis() {
  return [...DISPONIVEIS];
}
