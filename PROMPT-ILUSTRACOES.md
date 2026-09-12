# Prompt para gerar as ilustrações dos exercícios

Este arquivo tem duas partes:

1. **O prompt** — para colar na IA de imagens. Começa em "PROMPT PARA COLAR".
2. **Notas para quem integra no app** (última seção) — não faz parte do prompt.

Anexe junto ao prompt os dois arquivos de referência de estilo:

- `assets/illustrations/bw/bench-press-start.png`
- `assets/illustrations/bw/bench-press-peak.png`

Sem eles, "vetorial preto e branco" é vago demais e cada exercício volta com um
traço diferente. O objetivo é que os 106 arquivos pareçam ter saído da mesma mão.

---

# PROMPT PARA COLAR

## O que eu preciso

Ilustrações de exercícios de academia para um aplicativo de treino. **53
exercícios, 2 imagens cada = 106 arquivos.** As duas imagens de cada exercício
mostram o mesmo boneco, no mesmo enquadramento, em dois momentos do movimento —
é a comparação entre elas que ensina o exercício.

As duas imagens em anexo (supino reto com barra) são o **padrão de estilo a ser
seguido**. Tudo o que descrevo abaixo é a leitura desse padrão; quando houver
dúvida entre o texto e a imagem, a imagem manda.

## Estilo

- **Vetorial**, traço limpo, contorno preto de espessura constante. Sem textura,
  sem gradiente, sem sombra difusa, sem brilho, sem efeito 3D.
- **Escala de cinza apenas.** Nenhuma cor — o app inteiro é preto e branco.
- Figura masculina atlética, corpo inteiro, proporções realistas (não cartoon,
  não stick figure).
- **Rosto sem traços**: só o volume do cabelo curto escuro. Nada de olhos, boca
  ou expressão. Isso é proposital — o boneco representa qualquer aluno.
- Musculatura sugerida por linhas internas de sombreamento, como na referência.
- Roupa: regata cinza médio, bermuda preta, tênis branco com contorno preto.
- Equipamento (barra, banco, halteres, máquina, polia) em cinzas claros, com as
  anilhas/pesos em cinza bem escuro para contrastar.
- **Fundo transparente.** Nada de fundo branco, nada de moldura, nada de
  legenda, número, seta, texto ou marca d'água dentro da imagem.
- Uma sombra de chão sutil, cinza claro, só onde o corpo ou o equipamento toca o
  piso — igual à referência.

### Paleta (use exatamente estes tons, nos 106 arquivos)

| Uso | Tom |
|---|---|
| Contorno | `#111111` |
| Pele / músculo (base) | `#C9C9C9` |
| Pele / músculo (sombra) | `#9A9A9A` |
| Pele / músculo (luz) | `#E4E4E4` |
| Regata | `#B0B0B0` |
| Bermuda | `#1C1C1C` |
| Tênis | `#FFFFFF` |
| Equipamento (metal) | `#D6D6D6` |
| Equipamento (sombra) | `#8C8C8C` |
| Anilhas / pesos | `#3A3A3A` |
| Sombra no chão | `#E8E8E8` |

## Enquadramento

- **O mesmo ângulo de câmera nas duas imagens do mesmo exercício.** Só os
  ângulos das articulações mudam entre elas. Se a câmera girar, a comparação
  entre as duas se perde e o aluno não entende o movimento.
- Escolha o ângulo que melhor mostra **o que muda** no exercício:
  - movimento que abre e fecha os braços (crucifixo, crossover, peck deck) →
    vista frontal;
  - movimento que sobe e desce na vertical (agachamento, desenvolvimento, leg
    press) → vista lateral ou 3/4;
  - supinos e flexões → como na referência.
- O boneco ocupa a maior parte do quadro, com uma margem pequena e igual dos
  dois lados. Corpo inteiro sempre visível, nunca cortado.
- **Mantenha a mesma escala e a mesma posição dentro do quadro nas duas imagens.**
  O boneco não pode "pular" de tamanho ou de lugar quando o app troca de uma
  para a outra.

## As duas posições

Para cada exercício:

- **`-start`** — posição inicial, onde o movimento começa.
- **`-peak`** — o outro extremo do movimento (maior alongamento ou maior
  contração, o que for o oposto da inicial).

A diferença entre as duas precisa ser **óbvia à primeira vista**. Se as duas
imagens ficarem parecidas demais, exagere um pouco a amplitude — a função aqui é
ensinar, não documentar.

Exemplo, no supino em anexo: `-start` é com os braços estendidos, a barra em
cima; `-peak` é com a barra descida junto ao peito.

## Formato e tamanho dos arquivos

O app roda no celular e precisa carregar rápido. **Peso é requisito, não
detalhe.** As imagens da referência têm 100 KB cada — 106 arquivos assim dariam
10 MB, pesado demais. Preciso de bem menos.

### Formato preferido: SVG

Como o desenho é vetorial, o ideal é receber vetor de verdade:

- `viewBox="0 0 512 512"`, sem `width`/`height` fixos.
- Só formas e traçados. **Nada de imagem raster embutida** (`<image>`,
  `data:image/png`) — isso é um PNG disfarçado de SVG e não serve.
- Sem `filter`, sem `mask`, sem gradiente, sem `blur`: pesam e renderizam
  devagar no celular.
- Preenchimentos chapados, só com os tons da paleta acima.
- Otimizado (SVGO ou equivalente), **alvo de até 8 KB por arquivo**.

### Se não der SVG: WebP

- Gere em `1024 × 1024`, fundo transparente.
- Recorte no conteúdo (sem margem morta) e redimensione para **no máximo 512 px
  no lado maior**.
- Exporte em **WebP com transparência, qualidade ~82**.
- **Alvo de até 20 KB por arquivo**, teto absoluto de 40 KB.
- Se só for possível PNG, mando converter aqui — mas então entregue o PNG já
  recortado e em 512 px, também com fundo transparente.

## Nomes dos arquivos

Exatamente estes, tudo minúsculo, sem acento e sem espaço. A extensão é `.svg`
ou `.webp` conforme o formato:

```
<identificador>-start.svg
<identificador>-peak.svg
```

Exemplo: `agachamento-livre-start.svg` e `agachamento-livre-peak.svg`.

Os nomes são lidos por código. Um arquivo fora do padrão simplesmente não
aparece no app, sem mensagem de erro.

## Os 53 exercícios

### Braço

| Exercício | Equipamento | Identificador |
|---|---|---|
| Rosca alternada | Halter | `rosca-alternada` |
| Rosca direta | Barra | `rosca-direta` |
| Tríceps na corda | Máquina (polia) | `triceps-na-corda` |
| Tríceps testa | Barra | `triceps-testa` |

### Cardio

| Exercício | Equipamento | Identificador |
|---|---|---|
| Esteira — caminhada inclinada | Máquina | `esteira-caminhada-inclinada` |

### Core

| Exercício | Equipamento | Identificador |
|---|---|---|
| Abdominal supra no solo | Peso do corpo | `abdominal-supra-no-solo` |
| Prancha abdominal | Peso do corpo | `prancha-abdominal` |

### Costas

| Exercício | Equipamento | Identificador |
|---|---|---|
| Puxada frontal | Máquina | `puxada-frontal` |
| Remada baixa | Máquina | `remada-baixa` |
| Remada curvada com barra | Barra | `remada-curvada-com-barra` |

### Ombro

| Exercício | Equipamento | Identificador |
|---|---|---|
| Desenvolvimento com halteres | Halter | `desenvolvimento-com-halteres` |
| Elevação lateral | Halter | `elevacao-lateral` |

### Peito

| Exercício | Equipamento | Identificador |
|---|---|---|
| Crossover na polia alta | Polia | `crossover-na-polia-alta` |
| Crossover na polia baixa | Polia | `crossover-na-polia-baixa` |
| Crossover unilateral na polia | Polia | `crossover-unilateral-na-polia` |
| Crucifixo com halteres | Halter | `crucifixo-com-halteres` |
| Crucifixo declinado com halteres | Halter | `crucifixo-declinado-com-halteres` |
| Crucifixo inclinado com halteres | Halter | `crucifixo-inclinado-com-halteres` |
| Crucifixo inclinado na polia | Polia | `crucifixo-inclinado-na-polia` |
| Crucifixo reto na polia | Polia | `crucifixo-reto-na-polia` |
| Crucifixo unilateral com halter | Halter | `crucifixo-unilateral-com-halter` |
| Flexão com mãos afastadas | Peso do corpo | `flexao-com-maos-afastadas` |
| Flexão com mãos elevadas | Peso do corpo | `flexao-com-maos-elevadas` |
| Flexão com pés elevados | Peso do corpo | `flexao-com-pes-elevados` |
| Flexão de braços | Peso do corpo | `flexao-de-bracos` |
| Flexão na fita de suspensão | Fita de suspensão | `flexao-na-fita-de-suspensao` |
| Paralelas com foco no peito | Barras paralelas | `paralelas-com-foco-no-peito` |
| Peck deck — crucifixo na máquina | Máquina | `peck-deck-crucifixo-na-maquina` |
| Pullover com halter | Halter | `pullover-com-halter` |
| Supino declinado com barra | Barra | `supino-declinado-com-barra` |
| Supino declinado com halteres | Halter | `supino-declinado-com-halteres` |
| Supino declinado na máquina articulada | Máquina | `supino-declinado-na-maquina-articulada` |
| Supino declinado no Smith | Smith | `supino-declinado-no-smith` |
| Supino em pé na polia | Polia | `supino-em-pe-na-polia` |
| Supino inclinado com barra | Barra | `supino-inclinado-com-barra` |
| Supino inclinado com halteres | Halter | `supino-inclinado-com-halteres` |
| Supino inclinado com pegada neutra | Halter | `supino-inclinado-com-pegada-neutra` |
| Supino inclinado na máquina articulada | Máquina | `supino-inclinado-na-maquina-articulada` |
| Supino inclinado na polia | Polia | `supino-inclinado-na-polia` |
| Supino inclinado no Smith | Smith | `supino-inclinado-no-smith` |
| Supino na máquina | Máquina | `supino-na-maquina` |
| **Supino reto com barra** | Barra | `supino-reto-com-barra` |
| Supino reto com halteres | Halter | `supino-reto-com-halteres` |
| Supino reto com pegada neutra | Halter | `supino-reto-com-pegada-neutra` |
| Supino reto no Smith | Smith | `supino-reto-no-smith` |
| Supino sentado na polia | Polia | `supino-sentado-na-polia` |
| Supino unilateral com halter | Halter | `supino-unilateral-com-halter` |
| Svend press com anilhas | Anilhas | `svend-press-com-anilhas` |

### Perna

| Exercício | Equipamento | Identificador |
|---|---|---|
| Agachamento livre | Barra | `agachamento-livre` |
| Cadeira extensora | Máquina | `cadeira-extensora` |
| Leg press 45° | Máquina | `leg-press-45` |
| Mesa flexora | Máquina | `mesa-flexora` |
| Panturrilha em pé | Máquina | `panturrilha-em-pe` |

> **Sim, o supino reto com barra está na lista** — o mesmo da referência. Quero
> ele refeito no seu traço, junto com os outros 52, para os 53 ficarem
> visualmente idênticos entre si. A referência anexada é de outra fonte e vai
> ser substituída.

## Como entregar

Comece por **3 exercícios de famílias diferentes**, para eu aprovar antes de
você gerar os 106:

- `agachamento-livre` (vista lateral, corpo inteiro, movimento vertical)
- `crucifixo-com-halteres` (vista frontal, abre e fecha)
- `puxada-frontal` (sentado em máquina, puxada vertical)

Com esses três aprovados, gere o resto. Entregue em uma pasta única, arquivos
soltos, sem subpastas.

## Erros que inviabilizam o arquivo

- Fundo branco em vez de transparente.
- Câmera diferente entre o `-start` e o `-peak` do mesmo exercício.
- Boneco em escala ou posição diferente entre as duas imagens.
- Qualquer cor fora da escala de cinza.
- Texto, seta, número ou marca d'água dentro da imagem.
- Rosto com olhos ou boca.
- Arquivo acima de 40 KB (raster) ou com raster embutido dentro do SVG.
- Nome de arquivo com acento, espaço ou maiúscula.

---

# Notas para a integração no app (não faz parte do prompt)

- Os arquivos vão em `assets/illustrations/bw/`. A convenção `-start` / `-peak`
  já é lida por `js/catalogo-ilustracoes.js`; hoje a lista `DISPONIVEIS` tem só
  `bench-press`.
- **O crédito precisa ser separado antes de entrar imagem nova.**
  `catalogo-ilustracoes.js` carimba "Ilustrações: RepDB" em qualquer arquivo que
  case com o padrão do nome. Ilustração gerada por IA não é do RepDB, e atribuir
  a eles seria errado. Ao substituir o supino pelo desenho novo, o vínculo com o
  RepDB some junto — e com ele a obrigação de atribuição e a restrição de não
  republicar o dataset, hoje anotada no `.gitignore`.
- Se vier SVG, `js/exercise-validation.js` precisa aceitar a extensão: a
  expressão atual exige `.png`.
- Orçamento de peso: 106 SVGs de 8 KB ≈ 850 KB no total; 106 WebPs de 20 KB ≈
  2,1 MB. Os PNGs atuais, no mesmo volume, dariam ~10 MB.
- Vale servir com `loading="lazy"` na lista de exercícios, o que o app já faz.
