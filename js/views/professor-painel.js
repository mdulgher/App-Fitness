// Painel do professor — dashboard por exceção
//
// O topo mostra o que precisa de ação, não uma lista plana: é isso que separa
// uma ferramenta de um cadastro.

import { db, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import { DIAS_SEM_TREINAR_ALERTA } from "../config.js";
import {
  esc,
  iniciais,
  moeda,
  hoje,
  diasEntre,
  textoTempoRelativo,
  plural,
  mesDeReferencia,
  nomeDoMes,
  primeiroNome,
} from "../utils.js";

export async function render(alvo) {
  const alunos = await db.listarAlunos();
  const mes = mesDeReferencia();
  const pagamentosDoMes = await db.listarPagamentosDoMes(mes);

  const alertas = montarAlertas(alunos);
  const previsto = pagamentosDoMes.reduce((t, p) => t + (p.amount ?? 0), 0);
  const recebido = pagamentosDoMes
    .filter((p) => p.paid_date)
    .reduce((t, p) => t + (p.amount ?? 0), 0);

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Painel</div>
          <h1>${plural(alunos.length, "aluno ativo", "alunos ativos")}</h1>
        </div>
        <a class="btn btn-primary" href="#/professor/alunos">Novo aluno</a>
      </div>

      ${secaoAtencao(alertas)}

      <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
        ${cartao("Treinos esta semana", `${alunos.reduce((t, a) => t + a.resumo.treinosNaSemana, 0)}`, "somando todos os alunos")}
        ${cartao(`Previsto em ${nomeDoMes(mes)}`, moeda(previsto), `${moeda(recebido)} recebido`)}
        ${cartao("Sem ficha ativa", `${alunos.filter((a) => !a.resumo.temFichaAtiva).length}`, "alunos aguardando treino")}
      </div>

      <h2 style="margin-bottom:var(--sp-3)">Alunos</h2>
      <div class="list">
        ${alunos.map(linhaAluno).join("")}
      </div>
    </div>
  `;
}

function montarAlertas(alunos) {
  const H = hoje();
  const itens = [];

  for (const a of alunos) {
    const r = a.resumo;

    if (r.diasSemTreinar == null) {
      itens.push({
        aluno: a,
        texto: `${primeiroNome(a.full_name)} nunca registrou um treino`,
      });
    } else if (r.diasSemTreinar >= DIAS_SEM_TREINAR_ALERTA) {
      itens.push({
        aluno: a,
        texto: `${primeiroNome(a.full_name)} não treina ${textoTempoRelativo(r.ultimoTreino)}`,
      });
    }

    if (r.statusFinanceiro === "overdue") {
      itens.push({
        aluno: a,
        texto: `${primeiroNome(a.full_name)} está com mensalidade vencida`,
      });
    }

    if (!r.temFichaAtiva) {
      itens.push({
        aluno: a,
        texto: `${primeiroNome(a.full_name)} está sem ficha ativa`,
      });
    } else if (r.fichaVenceEm && diasEntre(H, r.fichaVenceEm) <= 7) {
      const d = diasEntre(H, r.fichaVenceEm);
      itens.push({
        aluno: a,
        texto:
          d < 0
            ? `A ficha de ${primeiroNome(a.full_name)} venceu`
            : `A ficha de ${primeiroNome(a.full_name)} vence em ${plural(d, "dia", "dias")}`,
      });
    }
  }

  return itens;
}

function secaoAtencao(alertas) {
  if (!alertas.length) {
    return `
      <div class="card card-invert" style="margin-bottom:var(--sp-5)">
        <div class="eyebrow">Precisa de atenção</div>
        <p style="margin:var(--sp-2) 0 0">Nada pendente. Todos treinando e em dia.</p>
      </div>`;
  }

  return `
    <div style="margin-bottom:var(--sp-5)">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">
        Precisa de atenção · ${alertas.length}
      </div>
      <div class="stack">
        ${alertas
          .map(
            (i) => `
          <a class="alert alert-quiet card-link" href="#/professor/aluno/${esc(i.aluno.id)}">
            <div class="row-between">
              <span>${esc(i.texto)}</span>
              <span class="muted small">ver &rarr;</span>
            </div>
          </a>`
          )
          .join("")}
      </div>
    </div>`;
}

function cartao(rotulo, valor, apoio) {
  return `
    <div class="card">
      <div class="eyebrow">${esc(rotulo)}</div>
      <div class="numeric" style="font-size:28px;font-weight:800;letter-spacing:-0.03em;margin:var(--sp-1) 0">
        ${esc(valor)}
      </div>
      <div class="muted small">${esc(apoio)}</div>
    </div>`;
}

function linhaAluno(a) {
  const r = a.resumo;
  const pct = r.metaSemanal ? Math.min(100, (r.treinosNaSemana / r.metaSemanal) * 100) : 0;
  const status = r.statusFinanceiro;

  return `
    <a class="list-item" href="#/professor/aluno/${esc(a.id)}">
      <span class="avatar">${esc(iniciais(a.full_name))}</span>
      <span class="list-item-main">
        <span class="row-between">
          <span class="list-item-title truncate">${esc(a.full_name)}</span>
          <span class="${CLASSE_STATUS[status]}">${ROTULO_STATUS[status]}</span>
        </span>
        <span class="muted small" style="display:block;margin:2px 0 6px">
          ${esc(a.goal ?? "Sem objetivo definido")} ·
          ${r.ultimoTreino ? `treinou ${textoTempoRelativo(r.ultimoTreino)}` : "sem treinos"}
        </span>
        <span class="row" style="gap:var(--sp-2)">
          <span class="meter" style="flex:1;max-width:140px"><span style="width:${pct}%"></span></span>
          <span class="muted small numeric">${r.treinosNaSemana}/${r.metaSemanal} na semana</span>
        </span>
      </span>
    </a>`;
}
