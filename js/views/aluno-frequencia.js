// Frequência — quantas vezes o aluno treinou, e quando.
//
// A meta semanal não é um troféu: é o combinado com o professor. Por isso a
// tela mostra a semana corrente em primeiro lugar e só depois o histórico —
// o número que muda o comportamento é "faltam 2 treinos nesta semana", não
// "você treinou 38 vezes no ano".

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import {
  esc, plural, hoje, somarDias, inicioDaSemana, formatarData, textoTempoRelativo,
} from "../utils.js";
import { registrarErro } from "../log.js";
import { renderizarCalendario, nomeDoMes } from "../calendar-grid.js";

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
  const diasTreinados = new Map(concluidas.map((s) => [s.date, s]));
  const faltam = Math.max(0, semana.meta - semana.feitos);
  const pct = semana.meta ? Math.min(100, (semana.feitos / semana.meta) * 100) : 0;

  const [ano, mes] = hoje().split("-").map(Number);
  let mesSelecionado = mes;
  let anoSelecionado = ano;

  // Mês anterior (para o segundo calendário no desktop)
  const mesAnterior    = mes === 1 ? 12 : mes - 1;
  const anoMesAnterior = mes === 1 ? ano - 1 : ano;

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

      <!-- CALENDÁRIOS -->
      <div class="row-between" style="margin-bottom:var(--sp-3);align-items:center">
        <h2>Calendário</h2>
        <div class="row" style="gap:var(--sp-2)">
          <button class="btn btn-sm" id="mes-anterior" aria-label="Mês anterior">&larr;</button>
          <span class="muted small" style="min-width:120px;text-align:center" id="mes-titulo">
            ${MESES[mesSelecionado - 1]} de ${anoSelecionado}
          </span>
          <button class="btn btn-sm" id="mes-proximo" aria-label="Próximo mês">&rarr;</button>
        </div>
      </div>
      <div class="card calendarios-duplos" style="margin-bottom:var(--sp-5)">
        <div class="calendario-bloco">
          <div class="eyebrow" style="text-align:center;margin-bottom:var(--sp-2)" id="mes-titulo-anterior">
            ${MESES[mesAnterior - 1]} de ${anoMesAnterior}
          </div>
          <div class="calendario-mes" id="calendario-grid-anterior"></div>
        </div>
        <div class="calendario-bloco">
          <div class="eyebrow" style="text-align:center;margin-bottom:var(--sp-2)" id="mes-titulo-atual">
            ${MESES[mesSelecionado - 1]} de ${anoSelecionado}
          </div>
          <div class="calendario-mes" id="calendario-grid"></div>
        </div>
        <div class="muted small calendarios-legenda" style="text-align:center">
          preto = treino concluído (clique para desmarcar)
        </div>
      </div>

      <!-- SEMANA A SEMANA -->
      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Semana a semana</h2>
        <span class="muted small">meta de ${semana.meta}</span>
      </div>
      <div class="list" style="margin-bottom:var(--sp-5)">
        ${semanas(diasTreinados, semana.meta)}
      </div>
    </div>`;

  const recarregar = () => render(alvo);

  // Renderiza os dois calendários
  const calendarioGrid         = alvo.querySelector("#calendario-grid");
  const calendarioGridAnterior = alvo.querySelector("#calendario-grid-anterior");

  renderMes(calendarioGridAnterior, anoMesAnterior, mesAnterior, diasTreinados, alunoId, recarregar);
  renderMes(calendarioGrid, anoSelecionado, mesSelecionado, diasTreinados, alunoId, recarregar);

  function atualizarMesAnteriorVisual() {
    const ma = mesSelecionado === 1 ? 12 : mesSelecionado - 1;
    const aa = mesSelecionado === 1 ? anoSelecionado - 1 : anoSelecionado;
    alvo.querySelector("#mes-titulo-anterior").textContent = `${MESES[ma - 1]} de ${aa}`;
    renderMes(calendarioGridAnterior, aa, ma, diasTreinados, alunoId, recarregar);
  }

  // Navegação de mês (controla o calendário principal; o anterior acompanha)
  alvo.querySelector("#mes-anterior").addEventListener("click", () => {
    if (mesSelecionado === 1) { mesSelecionado = 12; anoSelecionado -= 1; }
    else { mesSelecionado -= 1; }
    renderMes(calendarioGrid, anoSelecionado, mesSelecionado, diasTreinados, alunoId, recarregar);
    alvo.querySelector("#mes-titulo").textContent = `${MESES[mesSelecionado - 1]} de ${anoSelecionado}`;
    alvo.querySelector("#mes-titulo-atual").textContent = `${MESES[mesSelecionado - 1]} de ${anoSelecionado}`;
    atualizarMesAnteriorVisual();
  });

  alvo.querySelector("#mes-proximo").addEventListener("click", () => {
    if (mesSelecionado === 12) { mesSelecionado = 1; anoSelecionado += 1; }
    else { mesSelecionado += 1; }
    renderMes(calendarioGrid, anoSelecionado, mesSelecionado, diasTreinados, alunoId, recarregar);
    alvo.querySelector("#mes-titulo").textContent = `${MESES[mesSelecionado - 1]} de ${anoSelecionado}`;
    alvo.querySelector("#mes-titulo-atual").textContent = `${MESES[mesSelecionado - 1]} de ${anoSelecionado}`;
    atualizarMesAnteriorVisual();
  });
}

function renderMes(container, ano, mes, diasTreinados, alunoId, aoRecarregar) {
  async function aoDesmarcar(sessaoId, data) {
    const confirmou = confirm(
      `Desmarcar treino concluído em ${formatarData(data)}? ` +
      `Seu professor ainda verá o histórico.`
    );
    if (!confirmou) return;

    const el = container.querySelector(`[data-sessao="${sessaoId}"]`);
    el.style.opacity = "0.5";
    el.style.pointerEvents = "none";

    try {
      await db.desconcluirSessao(sessaoId);
      await aoRecarregar();
    } catch (err) {
      registrarErro(err, {
        contexto: { tela: "frequencia", acao: "desconcluirSessao", sessaoId, data },
      });
      alert("Erro ao desmarcar: " + err.message);
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
    }
  }

  container.innerHTML = renderizarCalendario(ano, mes, diasTreinados, aoDesmarcar);

  // Eventos de clique para desmarcar
  container.querySelectorAll("[data-sessao]").forEach((el) => {
    el.addEventListener("click", () => aoDesmarcar(el.dataset.sessao, el.dataset.data));
  });
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

