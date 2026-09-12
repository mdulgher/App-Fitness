// Recados — o que o professor escreveu para este aluno.
//
// Leitura pura, e é assim de propósito: a conversa acontece no WhatsApp, e um
// campo de resposta aqui criaria uma segunda caixa de entrada que o Leo teria
// de lembrar de abrir. Quem escreve é o professor; o banco não deixa o aluno
// escrever nesta tabela, então a regra não depende desta tela.

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import { esc, plural, formatarData, textoTempoRelativo } from "../utils.js";

export async function render(alvo) {
  const alunoId = usuarioAtual().id;
  const anotacoes = await db.listarAnotacoes(alunoId);

  // Fixadas primeiro: é como o professor marca o que vale para o mês inteiro,
  // e não para o treino de terça.
  const fixadas = anotacoes.filter((n) => n.pinned);
  const demais = anotacoes.filter((n) => !n.pinned);

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <div class="eyebrow">Do seu professor</div>
        <h1>Recados.</h1>
        <p class="muted page-description">
          ${anotacoes.length
            ? `${plural(anotacoes.length, "recado", "recados")} — do mais recente para o mais antigo.`
            : "Aqui aparecem as orientações que o Leo escrever para você."}
        </p>
      </div>

      ${anotacoes.length
        ? `
          ${fixadas.length
            ? `<div class="eyebrow" style="margin-bottom:var(--sp-3)">Fixados</div>
               <div class="stack" style="margin-bottom:var(--sp-5)">${fixadas.map(cartao).join("")}</div>`
            : ""}
          ${demais.length
            ? `${fixadas.length ? `<div class="eyebrow" style="margin-bottom:var(--sp-3)">Anteriores</div>` : ""}
               <div class="stack">${demais.map(cartao).join("")}</div>`
            : ""}`
        : `<div class="empty">Nenhum recado por enquanto.</div>`}
    </div>`;
}

function cartao(nota) {
  const data = String(nota.created_at).slice(0, 10);
  return `
    <div class="card">
      <div class="row-between" style="margin-bottom:var(--sp-2)">
        <span class="eyebrow">${esc(formatarData(data))}</span>
        ${nota.pinned
          ? `<span class="tag tag-solid">Fixado</span>`
          : `<span class="muted small">${esc(textoTempoRelativo(data))}</span>`}
      </div>
      <div style="line-height:1.6;white-space:pre-wrap">${esc(nota.content)}</div>
    </div>`;
}
