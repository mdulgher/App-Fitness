// Painel do professor — dashboard por exceção
//
// O topo mostra o que precisa de ação, não uma lista plana: é isso que separa
// uma ferramenta de um cadastro.

import { db, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import { DIAS_SEM_TREINAR_ALERTA } from "../config.js";
import { usuarioAtual } from "../auth.js";
import { blocoProfessor } from "./professor-perfil.js";
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
    <div class="wrap dashboard">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Seu espaço de acompanhamento</div>
          <h1>Vamos evoluir, ${esc(primeiroNome(usuarioAtual().full_name))}.</h1>
          <p class="muted page-description">Uma visão clara de quem conta com você.</p>
        </div>
        <a class="btn btn-primary" href="#/professor/alunos">Gerenciar alunos <span aria-hidden="true">↗</span></a>
      </div>

      <section class="overview-banner">
        <div><div class="eyebrow">Visão geral · ${esc(nomeDoMes(mes))}</div><h2>Presença faz<br>a diferença.</h2><p>${plural(alunos.length, "aluno ativo", "alunos ativos")} sob seu acompanhamento.</p></div>
        <div class="banner-stat"><strong>${alunos.filter(a => a.resumo.metaSemanal > 0 && a.resumo.treinosNaSemana >= a.resumo.metaSemanal).length}<span> / ${alunos.length}</span></strong><span>alunos atingiram a meta da semana</span></div>
      </section>

      <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
        ${cartao("Treinos esta semana", `${alunos.reduce((t, a) => t + a.resumo.treinosNaSemana, 0)}`, "somando todos os alunos")}
        ${cartao(`Previsto em ${nomeDoMes(mes)}`, moeda(previsto), `${moeda(recebido)} recebido`)}
        ${cartao("Sem ficha ativa", `${alunos.filter((a) => !a.resumo.temFichaAtiva).length}`, "alunos aguardando treino")}
      </div>

      <div class="dashboard-columns">
        <section class="panel"><div class="section-heading"><div><div class="eyebrow">Acompanhamento</div><h2>Seus alunos <span class="count-pill">${alunos.length}</span></h2></div><a class="text-link" href="#/professor/alunos">Ver todos ↗</a></div>
          <div class="list">${alunos.length ? alunos.map(linhaAluno).join("") : '<div class="empty">Seus alunos aparecerão aqui quando forem cadastrados.</div>'}</div>
        </section>
        ${secaoAtencao(alertas)}
      </div>

      ${blocoProfessor()}
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
      <section class="panel attention-panel">
        <div class="eyebrow">Precisa de atenção</div>
        <h2>Tudo em dia.</h2><p class="muted">Nenhuma pendência encontrada no acompanhamento.</p>
      </section>`;
  }

  return `
    <section class="panel attention-panel">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">
        Seu próximo passo
      </div>
      <h2 class="attention-title">Precisa de atenção <span class="count-pill">${alertas.length}</span></h2>
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
    </section>`;
}

function cartao(rotulo, valor, apoio) {
  return `
    <div class="card stat-card">
      <div class="eyebrow">${esc(rotulo)}</div>
      <div class="numeric" style="font-size:28px;font-weight:800;letter-spacing:-0.03em;margin:var(--sp-1) 0">
        ${esc(valor)}
      </div>
      <div class="muted small">${esc(apoio)}</div>
    </div>`;
}

// Aluno sem meta definida mostrava "0/null na semana", e a barra ao lado ficava
// vazia como se ele estivesse devendo treino. Sem meta não há o que comparar: o
// número de dias treinados se sustenta sozinho.
//
// Os dias com o professor aparecem à parte porque o aluno treina sozinho também
// — e é justamente essa diferença que o professor quer enxergar na lista.
function frequenciaDaSemana(r) {
  const dias = r.treinosNaSemana === 1 ? "1 dia" : `${r.treinosNaSemana} dias`;
  const comPersonal = r.comPersonalNaSemana
    ? ` · ${r.comPersonalNaSemana} com você`
    : "";
  return r.metaSemanal
    ? `${r.treinosNaSemana}/${r.metaSemanal} na semana${comPersonal}`
    : `${dias} na semana · sem meta${comPersonal}`;
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
          <span class="muted small numeric">${frequenciaDaSemana(r)}</span>
        </span>
      </span>
    </a>`;
}
