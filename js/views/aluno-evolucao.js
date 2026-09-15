// Minha evolução — o histórico de carga por exercício.
//
// A pergunta que esta tela responde é uma só: "estou ficando mais forte neste
// movimento?". Por isso ela lista só os exercícios em que existe carga
// registrada (`exerciciosComHistorico`) — um seletor com a biblioteca inteira
// obrigaria o aluno a caçar, em 53 nomes, os 6 que ele de fato treina.
//
// O gráfico é SVG escrito à mão, sem biblioteca: são poucos pontos, o app não
// tem build e uma dependência de gráfico pesaria mais que a tela toda.

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import { esc, plural, formatarDataCurta, formatarData, textoTempoRelativo } from "../utils.js";

export async function render(alvo) {
  const alunoId = usuarioAtual().id;

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <div class="eyebrow">Seu histórico</div>
        <h1>Minha evolução.</h1>
        <p class="muted page-description">A carga que você registrou em cada exercício, do primeiro treino até hoje.</p>
      </div>
      <div id="corpo"></div>
    </div>`;

  const corpo = alvo.querySelector("#corpo");
  await renderizarProgressao(corpo, alunoId);
}

// O professor usa exatamente o mesmo histórico do aluno. Manter o componente
// compartilhado evita que as duas telas passem a calcular recorde ou volume de
// jeitos diferentes quando a regra evoluir.
export async function renderizarProgressao(alvo, alunoId, { visaoProfessor = false, nomeAluno = "" } = {}) {
  alvo.innerHTML = `<div class="empty">Carregando evolução…</div>`;
  const exercicios = await db.exerciciosComHistorico(alunoId);
  if (!alvo.isConnected) return;

  if (!exercicios.length) {
    alvo.innerHTML = `
      <div class="empty">
        <p>${visaoProfessor ? `${esc(nomeAluno || "Este aluno")} ainda não registrou carga em nenhum exercício.` : "Você ainda não registrou carga em nenhum exercício."}</p>
        <p class="small">${visaoProfessor ? "A progressão aparecerá depois do primeiro treino com peso registrado." : "Anote o peso durante o treino e a evolução aparece aqui sozinha."}</p>
      </div>`;
    return;
  }

  alvo.innerHTML = `
    <label class="field" style="max-width:420px">
      <span>Exercício</span>
      <select id="exercicio">
        ${exercicios.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("")}
      </select>
    </label>
    <div id="detalhe"><div class="empty">Carregando…</div></div>`;

  const seletor = alvo.querySelector("#exercicio");
  const detalhe = alvo.querySelector("#detalhe");

  async function desenhar() {
    const exercicio = exercicios.find((e) => e.id === seletor.value);
    detalhe.innerHTML = `<div class="empty">Carregando…</div>`;

    const { pontos, recorde } = await db.progressaoDoExercicio(alunoId, exercicio.id);
    if (!detalhe.isConnected || seletor.value !== exercicio.id) return;
    const comPeso = pontos.filter((p) => p.pesoMaximo != null);

    if (!comPeso.length) {
      detalhe.innerHTML = `<div class="empty">Ainda não há peso registrado em ${esc(exercicio.name)}.</div>`;
      return;
    }

    const primeiro = comPeso[0];
    const ultimo = comPeso.at(-1);
    const variacao = ultimo.pesoMaximo - primeiro.pesoMaximo;

    detalhe.innerHTML = `
      <div class="grid grid-3" style="margin:var(--sp-5) 0">
        ${cartao("Último treino", `${formatarPeso(ultimo.pesoMaximo)}`, `em ${formatarData(ultimo.data)}`)}
        ${cartao(visaoProfessor ? "Recorde" : "Seu recorde", formatarPeso(recorde?.pesoMaximo), recorde ? `em ${formatarData(recorde.data)}` : "—")}
        ${cartao(
          "Desde o início",
          `${variacao > 0 ? "+" : ""}${formatarPeso(variacao)}`,
          `${plural(comPeso.length, "treino registrado", "treinos registrados")}`
        )}
      </div>

      <div class="card" style="margin-bottom:var(--sp-5)">
        <div class="eyebrow" style="margin-bottom:var(--sp-3)">Peso máximo por treino</div>
        ${grafico(comPeso)}
      </div>

      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Treino a treino</h2>
        <span class="muted small">do mais recente para o mais antigo</span>
      </div>
      <div class="list">
        ${[...comPeso].reverse().map((p) => `
          <div class="list-item">
            <span class="list-item-main">
              <span class="row-between">
                <span class="list-item-title">${esc(formatarData(p.data))}</span>
                <span class="numeric" style="font-weight:700">${esc(formatarPeso(p.pesoMaximo))}</span>
              </span>
              <span class="muted small numeric">
                ${plural(p.series, "série", "séries")}
                ${p.volume ? ` · volume ${esc(formatarPeso(p.volume))}` : ""}
                · ${esc(textoTempoRelativo(p.data))}
              </span>
              ${detalhesDaSessao(p.detalhes)}
            </span>
          </div>`).join("")}
      </div>`;
  }

  seletor.addEventListener("change", desenhar);
  await desenhar();
}

function detalhesDaSessao(series = []) {
  if (!series.length) return "";
  const itens = series.map((s) => {
    const partes = [];
    if (s.peso != null) partes.push(formatarPeso(Number(s.peso)));
    if (s.repeticoes != null) partes.push(`${Number(s.repeticoes)} rep.`);
    return `Série ${Number(s.numero)}: ${partes.length ? partes.join(" × ") : "sem carga"}`;
  });
  return `<span class="muted small numeric" style="display:block;margin-top:var(--sp-1)">${esc(itens.join(" · "))}</span>`;
}

function cartao(rotulo, valor, apoio) {
  return `
    <div class="card">
      <div class="eyebrow">${esc(rotulo)}</div>
      <div class="numeric" style="font-size:24px;font-weight:800;letter-spacing:-0.03em;margin:var(--sp-1) 0">
        ${esc(valor)}
      </div>
      <div class="muted small">${esc(apoio)}</div>
    </div>`;
}

function formatarPeso(kg) {
  if (kg == null) return "—";
  return `${String(Number(kg.toFixed(2))).replace(".", ",")} kg`;
}

// Gráfico de linha em SVG. `viewBox` com `preserveAspectRatio` padrão faz ele
// acompanhar a largura do cartão sem cálculo de layout em JavaScript.
function grafico(pontos) {
  const L = 700, A = 220, margem = { esq: 44, dir: 12, topo: 16, baixo: 28 };
  const largura = L - margem.esq - margem.dir;
  const altura = A - margem.topo - margem.baixo;

  const pesos = pontos.map((p) => p.pesoMaximo);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  // Faixa nunca zero: com um ponto só, ou com todos iguais, a divisão explodiria
  // e a linha sumiria.
  const faixa = max - min || Math.max(1, max * 0.1);
  const base = min - faixa * 0.15;
  const teto = max + faixa * 0.15;

  const x = (i) => margem.esq + (pontos.length === 1 ? largura / 2 : (i / (pontos.length - 1)) * largura);
  const y = (v) => margem.topo + altura - ((v - base) / (teto - base)) * altura;

  const linha = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pesoMaximo).toFixed(1)}`).join(" ");

  // Poucos rótulos no eixo: primeiro, meio e último. Em seis meses de treino a
  // lista de datas viraria uma tarja preta ilegível.
  const indices = [...new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1])];

  return `
    <svg class="grafico-progressao" viewBox="0 0 ${L} ${A}" role="img"
         aria-label="Evolução do peso máximo: de ${formatarPeso(pesos[0])} a ${formatarPeso(pesos.at(-1))}">
      <line class="grade" x1="${margem.esq}" y1="${margem.topo}" x2="${margem.esq}" y2="${margem.topo + altura}" />
      <line class="grade" x1="${margem.esq}" y1="${margem.topo + altura}" x2="${L - margem.dir}" y2="${margem.topo + altura}" />
      <text class="rotulo" x="4" y="${(margem.topo + 4).toFixed(1)}">${esc(formatarPeso(max))}</text>
      <text class="rotulo" x="4" y="${(margem.topo + altura).toFixed(1)}">${esc(formatarPeso(min))}</text>
      <path class="linha" d="${linha}" />
      ${pontos.map((p, i) => `<circle class="ponto" cx="${x(i).toFixed(1)}" cy="${y(p.pesoMaximo).toFixed(1)}" r="4" />`).join("")}
      ${indices.map((i) => `
        <text class="rotulo" x="${x(i).toFixed(1)}" y="${A - 8}" text-anchor="middle">
          ${esc(formatarDataCurta(pontos[i].data))}
        </text>`).join("")}
    </svg>`;
}
