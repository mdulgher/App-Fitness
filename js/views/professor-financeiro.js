// Financeiro do professor: visão do mês, geração de cobranças e baixa.

import { db, statusPagamento, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import {
  esc, moeda, formatarData, nomeDoMes, mesDeReferencia, somarDias, plural, hoje, diasEntre,
} from "../utils.js";

export async function render(alvo) {
  let mes = mesDeReferencia();
  let pagamentos = [];
  let filtro = "todos";

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Financeiro</div>
          <h1 id="titulo-mes">Carregando…</h1>
          <p class="muted page-description">Controle manual das mensalidades.</p>
        </div>
        <div class="row" style="gap:var(--sp-2)">
          <button class="btn btn-sm" id="mes-anterior" aria-label="Mês anterior">←</button>
          <button class="btn btn-sm" id="mes-seguinte" aria-label="Mês seguinte">→</button>
        </div>
      </div>

      <div class="grid grid-3" id="resumo" style="margin-bottom:var(--sp-5)"></div>

      <div class="row-between" style="margin-bottom:var(--sp-3);flex-wrap:wrap;gap:var(--sp-3)">
        <div class="movement-tabs" id="filtros" role="group" aria-label="Filtrar por situação">
          ${[["todos", "Todos"], ["overdue", "Vencidos"], ["pending", "A vencer"], ["paid", "Pagos"]]
            .map(([v, r]) => `<button class="movement-tab" data-filtro="${v}" aria-pressed="${v === "todos"}">${r}</button>`)
            .join("")}
        </div>
        <button class="btn btn-primary" id="gerar">Gerar cobranças do mês</button>
      </div>

      <div id="feedback" role="status" class="library-feedback hidden"></div>
      <div class="list" id="lista"><div class="empty">Carregando…</div></div>
    </div>`;

  const lista = alvo.querySelector("#lista");
  const feedback = alvo.querySelector("#feedback");

  const avisar = (msg) => {
    feedback.textContent = msg;
    feedback.classList.remove("hidden");
  };

  async function carregar() {
    alvo.querySelector("#titulo-mes").textContent =
      `${nomeDoMes(mes)[0].toUpperCase()}${nomeDoMes(mes).slice(1)} de ${mes.slice(0, 4)}`;
    try {
      pagamentos = await db.listarPagamentosDoMes(mes);
      desenhar();
    } catch (err) {
      lista.innerHTML = `<div class="empty"><p>Não foi possível carregar o financeiro.</p><p class="small">${esc(err.message)}</p></div>`;
    }
  }

  function desenhar() {
    const comStatus = pagamentos.map((p) => ({ ...p, status: p.status ?? statusPagamento(p) }));
    const previsto = comStatus.reduce((t, p) => t + Number(p.amount ?? 0), 0);
    const recebido = comStatus.filter((p) => p.status === "paid").reduce((t, p) => t + Number(p.amount ?? 0), 0);
    const vencidos = comStatus.filter((p) => p.status === "overdue");

    alvo.querySelector("#resumo").innerHTML = [
      cartao("Previsto", moeda(previsto), plural(comStatus.length, "cobrança", "cobranças")),
      cartao("Recebido", moeda(recebido), previsto ? `${Math.round((recebido / previsto) * 100)}% do mês` : "—"),
      cartao("Em atraso", moeda(vencidos.reduce((t, p) => t + Number(p.amount ?? 0), 0)),
        vencidos.length ? plural(vencidos.length, "aluno", "alunos") : "ninguém em atraso"),
    ].join("");

    const visiveis = filtro === "todos" ? comStatus : comStatus.filter((p) => p.status === filtro);
    lista.innerHTML = visiveis.length
      ? visiveis.map(linha).join("")
      : `<div class="empty">${comStatus.length
          ? "Nenhuma cobrança nesta situação."
          : "Nenhuma cobrança lançada neste mês. Use “Gerar cobranças do mês”."}</div>`;

    lista.querySelectorAll("[data-baixa]").forEach((b) =>
      b.addEventListener("click", () => alternarBaixa(b.dataset.baixa, b.dataset.acao))
    );
  }

  async function alternarBaixa(id, acao) {
    try {
      if (acao === "pagar") await db.darBaixa(id);
      else await db.reabrirPagamento(id);
      await carregar();
      avisar(acao === "pagar" ? "Pagamento registrado." : "Pagamento reaberto.");
    } catch (err) { avisar(err.message); }
  }

  alvo.querySelector("#gerar").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = "Gerando…";
    try {
      const criados = await db.gerarCobrancasDoMes(mes);
      await carregar();
      // Rodar de novo não duplica: a restrição de unicidade no banco garante uma
      // cobrança por aluno e mês.
      avisar(criados.length
        ? `${plural(criados.length, "cobrança gerada", "cobranças geradas")}.`
        : "Todos os alunos ativos já têm cobrança neste mês.");
    } catch (err) { avisar(err.message); }
    finally {
      ev.target.disabled = false;
      ev.target.textContent = "Gerar cobranças do mês";
    }
  });

  alvo.querySelector("#filtros").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-filtro]");
    if (!b) return;
    filtro = b.dataset.filtro;
    alvo.querySelectorAll("[data-filtro]").forEach((x) =>
      x.setAttribute("aria-pressed", String(x.dataset.filtro === filtro))
    );
    desenhar();
  });

  alvo.querySelector("#mes-anterior").addEventListener("click", () => {
    mes = mesDeReferencia(somarDias(mes, -1));
    carregar();
  });
  alvo.querySelector("#mes-seguinte").addEventListener("click", () => {
    mes = mesDeReferencia(somarDias(mes, 40));
    carregar();
  });

  await carregar();
}

function cartao(rotulo, valor, apoio) {
  return `
    <div class="card stat-card">
      <div class="eyebrow">${esc(rotulo)}</div>
      <div class="numeric" style="font-size:26px;font-weight:800;letter-spacing:-.03em;margin:var(--sp-1) 0">${esc(valor)}</div>
      <div class="muted small">${esc(apoio)}</div>
    </div>`;
}

function linha(p) {
  const pago = p.status === "paid";
  const quando = pago
    ? `pago ${formatarData(p.paid_date)}`
    : p.status === "overdue"
      ? `venceu ${formatarData(p.due_date)} · ${plural(diasEntre(p.due_date, hoje()), "dia", "dias")} de atraso`
      : `vence ${formatarData(p.due_date)}`;
  return `
    <div class="list-item">
      <span class="list-item-main">
        <span class="row-between">
          <span class="list-item-title truncate">${esc(p.aluno)}</span>
          <span class="${CLASSE_STATUS[p.status]}">${ROTULO_STATUS[p.status]}</span>
        </span>
        <span class="muted small numeric">${moeda(p.amount)} · ${quando}</span>
      </span>
      <button class="btn btn-sm" data-baixa="${esc(p.id)}" data-acao="${pago ? "reabrir" : "pagar"}">
        ${pago ? "Reabrir" : "Marcar pago"}
      </button>
    </div>`;
}
