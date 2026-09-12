// Painel do aluno

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import { blocoProfessor } from "./professor-perfil.js";
import {
  esc,
  primeiroNome,
  plural,
  formatarData,
  textoTempoRelativo,
  rotuloDiasSemana,
} from "../utils.js";

export async function render(alvo) {
  const usuario = usuarioAtual();
  const id = usuario.id;

  const [aluno, ficha, semana, sugerido, anotacoes] = await Promise.all([
    db.buscarAluno(id),
    db.fichaAtiva(id),
    db.resumoDaSemana(id),
    db.proximoTreinoSugerido(id),
    db.listarAnotacoes(id),
  ]);

  const fixadas = anotacoes.filter((n) => n.pinned);
  const pct = semana.meta ? Math.min(100, (semana.feitos / semana.meta) * 100) : 0;

  alvo.innerHTML = `
    <div class="wrap student-dashboard">
      <div class="page-head">
        <div class="eyebrow">Olá, ${esc(primeiroNome(usuario.full_name))}</div>
        <h1>Um treino mais perto.</h1>
        <p class="muted page-description">${ficha ? esc(ficha.title) : "Seu próximo capítulo começa com um treino."}</p>
      </div>

      ${blocoRestricoes(aluno)}
      ${blocoSugerido(sugerido)}
      <div class="card weekly-card" style="margin-bottom:var(--sp-5)">
        <div class="progress-ring" style="--progress:${pct}%" role="img" aria-label="${semana.feitos} de ${semana.meta} treinos concluídos"><span>${semana.feitos}<small> / ${semana.meta}</small></span></div>
        <div class="weekly-content">
        <div class="eyebrow">Esta semana</div>
        <div class="row" style="margin:var(--sp-2) 0">
          <span class="numeric" style="font-size:32px;font-weight:800;letter-spacing:-0.03em">
            ${semana.feitos}<span style="color:var(--gray-400)">/${semana.meta}</span>
          </span>
          <span class="muted small">treinos concluídos</span>
        </div>
        <div class="meter">
          <span style="width:${pct}%"></span>
        </div>
        ${
          aluno?.resumo.ultimoTreino
            ? `<div class="muted small" style="margin-top:var(--sp-3)">
                 Último treino ${textoTempoRelativo(aluno.resumo.ultimoTreino)}
               </div>`
            : ""
        }
        </div>
      </div>
      ${blocoFicha(ficha)}
      ${blocoRecados(fixadas)}
      ${blocoProfessor()}
    </div>
  `;
}

function blocoRestricoes(aluno) {
  if (!aluno?.health_restrictions) return "";
  return `
    <div class="alert" style="margin-bottom:var(--sp-5)">
      <div class="eyebrow">Atenção no seu treino</div>
      <p style="margin:var(--sp-2) 0 0">${esc(aluno.health_restrictions)}</p>
    </div>`;
}

function blocoSugerido(dia) {
  if (!dia) return "";
  return `
    <div style="margin-bottom:var(--sp-5)">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">Sugestão de hoje</div>
      <a class="card card-link workout-hero" href="#/aluno/treino/${esc(dia.id)}">
        <div class="row-between">
          <div>
            <div class="eyebrow">Seu próximo treino</div>
            <h2>${esc(dia.label)}</h2>
            <div class="muted small">
              ${plural(dia.exercicios.length, "exercício", "exercícios")}
              ${dia.weekdays?.length ? ` · ${esc(rotuloDiasSemana(dia.weekdays))}` : ""}
            </div>
          </div>
          <span class="btn">Ver treino <span aria-hidden="true">↗</span></span>
        </div>
      </a>
    </div>`;
}

function blocoFicha(ficha) {
  if (!ficha) {
    return `
      <div class="empty">
        Seu professor ainda não montou sua ficha. Assim que estiver pronta ela aparece aqui.
      </div>`;
  }

  return `
    <div style="margin-bottom:var(--sp-5)">
      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <div class="eyebrow">Seus treinos</div>
        <span class="muted small">
          até ${ficha.end_date ? formatarData(ficha.end_date) : "sem prazo"}
        </span>
      </div>
      <div class="grid grid-3 workout-grid">
        ${ficha.dias
          .map(
            (dia, indice) => `
          <a class="card card-link" href="#/aluno/treino/${esc(dia.id)}">
            <span class="workout-number" aria-hidden="true">${String(indice + 1).padStart(2, "0")}</span>
            <div class="row-between">
              <div>
                <div class="list-item-title">${esc(dia.label)}</div>
                <div class="muted small">
                  ${plural(dia.exercicios.length, "exercício", "exercícios")}
                  ${dia.weekdays?.length ? ` · ${esc(rotuloDiasSemana(dia.weekdays))}` : ""}
                </div>
              </div>
              <span class="muted">&rarr;</span>
            </div>
          </a>`
          )
          .join("")}
      </div>
    </div>`;
}

function blocoRecados(fixadas) {
  if (!fixadas.length) return "";
  return `
    <div>
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">Recado do professor</div>
      <div class="stack">
        ${fixadas
          .map(
            (n) => `
          <div class="card">
            <div class="eyebrow" style="margin-bottom:var(--sp-2)">
              ${formatarData(String(n.created_at).slice(0, 10))}
            </div>
            <div>${esc(n.content)}</div>
          </div>`
          )
          .join("")}
      </div>
      <a class="btn btn-block" style="margin-top:var(--sp-4)" href="#/aluno/anotacoes">
        Ver todos os recados
      </a>
    </div>`;
}
