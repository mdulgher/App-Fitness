// Perfil do aluno, visto pelo professor
//
// Fase 0: leitura. A edição, o editor de ficha e a aba de progressão entram
// nas fases 1, 3 e 5. O objetivo aqui é provar que a camada de dados entrega
// tudo que as telas vão precisar.

import { db, statusPagamento, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import {
  esc,
  iniciais,
  moeda,
  formatarData,
  textoTempoRelativo,
  plural,
  nomeDoMes,
} from "../utils.js";

export async function render(alvo, { params }) {
  const [id] = params;
  const aluno = await db.buscarAluno(id);

  if (!aluno) {
    alvo.innerHTML = `<div class="wrap"><div class="empty">Aluno não encontrado.</div></div>`;
    return;
  }

  const [ficha, semana, anotacoes, pagamentos, sessoes] = await Promise.all([
    db.fichaAtiva(id),
    db.resumoDaSemana(id),
    db.listarAnotacoes(id),
    db.listarPagamentos(id),
    db.listarSessoes(id),
  ]);

  const concluidas = sessoes.filter((s) => s.completed_at);

  alvo.innerHTML = `
    <div class="wrap">
      <a class="muted small" href="#/professor/alunos">&larr; Alunos</a>

      <div class="page-head row" style="margin-top:var(--sp-4)">
        <span class="avatar" style="width:56px;height:56px;flex-basis:56px;font-size:17px">
          ${esc(iniciais(aluno.full_name))}
        </span>
        <div>
          <h1>${esc(aluno.full_name)}</h1>
          <div class="muted small">
            ${esc(aluno.goal ?? "Sem objetivo")} ·
            meta de ${plural(aluno.weekly_target, "treino", "treinos")}/semana
          </div>
        </div>
      </div>

      ${blocoRestricoes(aluno)}

      <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
        ${cartao("Semana", `${semana.feitos}/${semana.meta}`, "treinos concluídos")}
        ${cartao("Último treino", aluno.resumo.ultimoTreino ? textoTempoRelativo(aluno.resumo.ultimoTreino) : "—", `${concluidas.length} no total`)}
        ${cartao("Mensalidade", moeda(aluno.monthly_fee), `vence dia ${aluno.due_day}`)}
      </div>

      <hr class="hr" />
      ${blocoFicha(ficha)}

      <hr class="hr" />
      ${blocoAnotacoes(anotacoes)}

      <hr class="hr" />
      ${blocoFinanceiro(pagamentos)}
    </div>
  `;
}

function blocoRestricoes(aluno) {
  if (!aluno.health_restrictions) return "";
  // Em destaque de propósito: precisa ser lido antes de prescrever.
  return `
    <div class="alert" style="margin-bottom:var(--sp-5)">
      <div class="eyebrow">Restrições e lesões</div>
      <p style="margin:var(--sp-2) 0 0">${esc(aluno.health_restrictions)}</p>
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

function blocoFicha(ficha) {
  if (!ficha) {
    return `
      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Ficha</h2>
      </div>
      <div class="empty">
        Nenhuma ficha ativa. O editor de fichas entra na Fase 3.
      </div>`;
  }

  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)">
      <h2>Ficha ativa</h2>
      <span class="muted small">
        ${formatarData(ficha.start_date)} &rarr; ${ficha.end_date ? formatarData(ficha.end_date) : "sem prazo"}
      </span>
    </div>

    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="list-item-title">${esc(ficha.title)}</div>
      ${ficha.description ? `<div class="muted small">${esc(ficha.description)}</div>` : ""}
    </div>

    <div class="stack">
      ${ficha.dias.map(blocoDia).join("")}
    </div>`;
}

function blocoDia(dia) {
  return `
    <div class="card">
      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h3>${esc(dia.label)}</h3>
        <span class="muted small">${esc(dia.weekday_suggestion ?? "")}</span>
      </div>
      <div class="list">
        ${dia.exercicios.map(linhaExercicio).join("")}
      </div>
    </div>`;
}

function linhaExercicio(item) {
  const nome = item.exercicio?.name ?? "(exercício removido)";
  return `
    <div class="list-item">
      ${item.group_label ? `<span class="tag tag-quiet">${esc(item.group_label)}</span>` : ""}
      <span class="list-item-main">
        <span class="list-item-title">${esc(nome)}</span>
        <span class="muted small numeric" style="display:block">
          ${item.sets} x ${esc(item.reps)} ·
          descanso ${item.rest_seconds}s ·
          ${esc(item.load_notes ?? "carga livre")}
        </span>
        ${item.trainer_notes ? `<span class="small" style="display:block;margin-top:2px">${esc(item.trainer_notes)}</span>` : ""}
      </span>
    </div>`;
}

function blocoAnotacoes(anotacoes) {
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)">
      <h2>Anotações</h2>
      <span class="muted small">${plural(anotacoes.length, "recado", "recados")}</span>
    </div>
    ${
      anotacoes.length
        ? `<div class="stack">${anotacoes
            .map(
              (n) => `
        <div class="card">
          <div class="row-between" style="margin-bottom:var(--sp-2)">
            <span class="eyebrow">${formatarData(String(n.created_at).slice(0, 10))}</span>
            ${n.pinned ? `<span class="tag tag-solid">Fixado</span>` : ""}
          </div>
          <div>${esc(n.content)}</div>
        </div>`
            )
            .join("")}</div>`
        : `<div class="empty">Nenhuma anotação.</div>`
    }`;
}

function blocoFinanceiro(pagamentos) {
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)">
      <h2>Financeiro</h2>
      <span class="muted small">visível só para você e para o aluno</span>
    </div>
    ${
      pagamentos.length
        ? `<div class="list">${pagamentos
            .map((p) => {
              const st = statusPagamento(p);
              return `
          <div class="list-item">
            <span class="list-item-main">
              <span class="row-between">
                <span class="list-item-title">${esc(nomeDoMes(p.reference_month))}</span>
                <span class="${CLASSE_STATUS[st]}">${ROTULO_STATUS[st]}</span>
              </span>
              <span class="muted small numeric">
                ${moeda(p.amount)} ·
                vence ${formatarData(p.due_date)}
                ${p.paid_date ? ` · pago ${formatarData(p.paid_date)}` : ""}
                ${p.payment_method ? ` · ${esc(p.payment_method)}` : ""}
              </span>
            </span>
          </div>`;
            })
            .join("")}</div>`
        : `<div class="empty">Nenhuma cobrança lançada.</div>`
    }`;
}
