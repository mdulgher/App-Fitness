// Frequência — quantas vezes o aluno treinou, e quando.
//
// A meta semanal não é um troféu: é o combinado com o professor. Por isso a
// tela mostra a semana corrente em primeiro lugar e só depois o histórico —
// o número que muda o comportamento é "faltam 2 treinos nesta semana", não
// "você treinou 38 vezes no ano".
//
// O calendário é dos últimos três meses. Mais que isso vira parede de
// quadradinhos, e a pergunta "faltei muito em julho?" já é respondida pela
// lista de semanas.

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import {
  esc, plural, hoje, somarDias, inicioDaSemana, formatarData, textoTempoRelativo,
} from "../utils.js";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function render(alvo) {
  const alunoId = usuarioAtual().id;
  const de = somarDias(hoje(), -90);

  const [semana, sessoes, aluno] = await Promise.all([
    db.resumoDaSemana(alunoId),
    db.listarSessoes(alunoId, { de }),
    db.buscarAluno(alunoId),
  ]);

  const concluidas = sessoes.filter((s) => s.completed_at);
  const diasTreinados = new Set(concluidas.map((s) => s.date));
  const faltam = Math.max(0, semana.meta - semana.feitos);
  const pct = semana.meta ? Math.min(100, (semana.feitos / semana.meta) * 100) : 0;

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <div class="eyebrow">Seu compromisso</div>
        <h1>Frequência.</h1>
        <p class="muted page-description">
          Sua meta com o professor é ${plural(semana.meta, "treino", "treinos")} por semana.
        </p>
      </div>

      <div class="card" style="margin-bottom:var(--sp-5)">
        <div class="row-between" style="flex-wrap:wrap;gap:var(--sp-3)">
          <div>
            <div class="eyebrow">Esta semana</div>
            <div class="numeric" style="font-size:32px;font-weight:800;letter-spacing:-.03em">
              ${semana.feitos}<span style="color:var(--gray-400)">/${semana.meta}</span>
            </div>
            <div class="muted small">
              ${faltam === 0
                ? "meta da semana batida"
                : `${plural(faltam, "treino", "treinos")} até bater a meta`}
            </div>
          </div>
          <div class="muted small" style="text-align:right">
            ${esc(formatarData(semana.inicio))}<br />a ${esc(formatarData(semana.fim))}
          </div>
        </div>
        <div class="meter" style="margin-top:var(--sp-3)"><span style="width:${pct}%"></span></div>
      </div>

      <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
        ${cartao("Últimos 90 dias", String(concluidas.length), "treinos concluídos")}
        ${cartao("Último treino", aluno?.resumo.ultimoTreino ? textoTempoRelativo(aluno.resumo.ultimoTreino) : "—",
          aluno?.resumo.ultimoTreino ? formatarData(aluno.resumo.ultimoTreino) : "nenhum registro ainda")}
        ${cartao("Média por semana", media(concluidas.length), "nos últimos 90 dias")}
      </div>

      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Semana a semana</h2>
        <span class="muted small">meta de ${semana.meta}</span>
      </div>
      <div class="list" style="margin-bottom:var(--sp-5)">
        ${semanas(diasTreinados, semana.meta)}
      </div>

      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Calendário</h2>
        <span class="muted small">dia preto = treino concluído</span>
      </div>
      <div class="stack">${calendarios(diasTreinados)}</div>
    </div>`;
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

function media(total) {
  return String(Math.round((total / 13) * 10) / 10).replace(".", ",");
}

// Oito semanas para trás, da atual para a mais antiga.
function semanas(diasTreinados, meta) {
  const linhas = [];
  for (let i = 0; i < 8; i++) {
    const segunda = somarDias(inicioDaSemana(hoje()), -7 * i);
    const domingo = somarDias(segunda, 6);
    const feitos = [...diasTreinados].filter((d) => d >= segunda && d <= domingo).length;
    const bateu = meta > 0 && feitos >= meta;

    linhas.push(`
      <div class="list-item">
        <span class="list-item-main">
          <span class="row-between">
            <span class="list-item-title">
              ${i === 0 ? "Esta semana" : `${esc(formatarData(segunda))} a ${esc(formatarData(domingo))}`}
            </span>
            <span class="${bateu ? "tag tag-solid" : "tag tag-quiet"}">
              ${feitos}${meta ? `/${meta}` : ""}
            </span>
          </span>
          ${i === 0
            ? `<span class="muted small">${esc(formatarData(segunda))} a ${esc(formatarData(domingo))}</span>`
            : ""}
        </span>
      </div>`);
  }
  return linhas.join("");
}

function calendarios(diasTreinados) {
  const [ano, mes] = hoje().split("-").map(Number);
  const meses = [];
  for (let i = 2; i >= 0; i--) {
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    meses.push(mesEmGrade(data.getUTCFullYear(), data.getUTCMonth() + 1, diasTreinados));
  }
  return meses.join("");
}

function mesEmGrade(ano, mes, diasTreinados) {
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  // 0 = segunda, para a grade começar na mesma coluna que o resto do app conta
  // a semana.
  const deslocamento = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7;

  const celulas = [];
  for (let i = 0; i < deslocamento; i++) celulas.push(`<span class="dia-celula vazia"></span>`);

  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const classes = ["dia-celula"];
    if (diasTreinados.has(iso)) classes.push("treinou");
    if (iso === hoje()) classes.push("hoje");
    celulas.push(`<span class="${classes.join(" ")}" title="${esc(formatarData(iso))}">${d}</span>`);
  }

  return `
    <div class="card">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">${MESES[mes - 1]} de ${ano}</div>
      <div class="calendario-mes">
        ${["S", "T", "Q", "Q", "S", "S", "D"].map((r) => `<span class="dia-rotulo">${r}</span>`).join("")}
        ${celulas.join("")}
      </div>
    </div>`;
}
