// Financeiro do professor: visão do mês, lançamento das cobranças, baixa e
// envio da cobrança pelo WhatsApp com Pix copia e cola.
//
// Duas ações que parecem uma só, e é importante não confundir:
//   · LANÇAR a cobrança  → cria a linha do mês no sistema (o que o professor vê)
//   · COBRAR no WhatsApp → manda a mensagem para o aluno (o que o aluno vê)
// Lançar não avisa ninguém; por isso cada linha tem seu próprio botão de cobrar,
// e dá para cobrar de novo quantas vezes precisar sem duplicar nada.

import { db, statusPagamento, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import { PROFESSOR } from "../config.js";
import { pixCopiaECola, linkDoWhatsapp } from "../pix.js";
import {
  esc, moeda, formatarData, nomeDoMes, mesDeReferencia, somarDias, plural, hoje, diasEntre,
} from "../utils.js";

const MODELO_PADRAO =
  "Oi {nome}! Tudo certo?\n\n" +
  "Sua mensalidade de {mes} é de {valor}, com vencimento em {vencimento}.\n\n" +
  "Pix: {chave}\n\n" +
  "Se preferir, o copia e cola:\n{copiaecola}\n\n" +
  "Qualquer dúvida é só me chamar. Bons treinos! — {professor}";

export async function render(alvo) {
  let mes = mesDeReferencia();
  let pagamentos = [];
  let alunos = [];
  let config = null;
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
        <div class="row" style="gap:var(--sp-2)">
          <a class="btn" href="#/professor/perfil">Dados de cobrança</a>
          <button class="btn btn-primary" id="gerar">Lançar cobranças do mês</button>
        </div>
      </div>

      <div id="feedback" role="status" class="library-feedback hidden"></div>
      <div class="list" id="lista"><div class="empty">Carregando…</div></div>
    </div>
    <dialog class="exercise-dialog" id="dialogo"><div id="dialogo-conteudo"></div></dialog>`;

  const lista = alvo.querySelector("#lista");
  const feedback = alvo.querySelector("#feedback");
  const dialogo = alvo.querySelector("#dialogo");
  const conteudo = alvo.querySelector("#dialogo-conteudo");

  const avisar = (msg) => {
    feedback.innerHTML = msg;
    feedback.classList.remove("hidden");
  };

  async function carregar() {
    alvo.querySelector("#titulo-mes").textContent =
      `${nomeDoMes(mes)[0].toUpperCase()}${nomeDoMes(mes).slice(1)} de ${mes.slice(0, 4)}`;
    try {
      [pagamentos, alunos, config] = await Promise.all([
        db.listarPagamentosDoMes(mes),
        db.listarAlunos(),
        db.buscarConfiguracaoDeCobranca(),
      ]);
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
          : "Nenhuma cobrança lançada neste mês. Use “Lançar cobranças do mês”."}</div>`;

    lista.querySelectorAll("[data-baixa]").forEach((b) =>
      b.addEventListener("click", () => alternarBaixa(b.dataset.baixa, b.dataset.acao))
    );
    lista.querySelectorAll("[data-cobrar]").forEach((b) =>
      b.addEventListener("click", () => cobrar(comStatus.find((p) => p.id === b.dataset.cobrar)))
    );
  }

  async function alternarBaixa(id, acao) {
    try {
      if (acao === "pagar") await db.darBaixa(id);
      else await db.reabrirPagamento(id);
      await carregar();
      avisar(acao === "pagar" ? "Pagamento registrado." : "Pagamento reaberto.");
    } catch (err) { avisar(esc(err.message)); }
  }

  /* ---------- lançar as cobranças do mês ---------- */

  alvo.querySelector("#gerar").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = "Lançando…";
    try {
      const criados = await db.gerarCobrancasDoMes(mes);
      await carregar();

      // Sem mensalidade cadastrada o aluno é pulado em silêncio pelo banco.
      // Dizer quem ficou de fora evita o professor achar que cobrou todo mundo.
      const semValor = alunos.filter((a) => a.monthly_fee == null);
      const jaTinham = alunos.length - criados.length - semValor.length;

      const partes = [];
      if (criados.length) partes.push(`<strong>${plural(criados.length, "cobrança lançada", "cobranças lançadas")}</strong>`);
      if (jaTinham > 0) partes.push(`${plural(jaTinham, "aluno já tinha", "alunos já tinham")} cobrança neste mês`);
      if (semValor.length) partes.push(`${plural(semValor.length, "aluno ficou de fora", "alunos ficaram de fora")} por não ter mensalidade cadastrada (${semValor.map((a) => esc(a.full_name)).join(", ")})`);

      avisar(
        `${partes.join(" · ") || "Nada a lançar."}<br>` +
        `<span class="muted small">Lançar só registra a cobrança aqui. Para avisar o aluno, use “Cobrar no WhatsApp” na linha dele.</span>`
      );
    } catch (err) { avisar(esc(err.message)); }
    finally {
      ev.target.disabled = false;
      ev.target.textContent = "Lançar cobranças do mês";
    }
  });

  /* ---------- cobrar pelo WhatsApp ---------- */

  function montarMensagem(pagamento) {
    const modelo = config?.charge_message?.trim() || MODELO_PADRAO;
    const chave = config?.pix_key?.trim() ?? "";

    let copiaECola = "";
    try {
      copiaECola = chave
        ? pixCopiaECola({
            chave,
            nome: config?.pix_name || PROFESSOR.nome,
            cidade: config?.pix_city || "Sao Paulo",
            valor: pagamento.amount,
            identificador: `LPT${String(pagamento.reference_month).slice(0, 7).replace("-", "")}`,
          })
        : "";
    } catch {
      copiaECola = "";
    }

    return modelo
      .replaceAll("{nome}", pagamento.aluno.split(/\s+/)[0])
      .replaceAll("{mes}", nomeDoMes(pagamento.reference_month))
      .replaceAll("{valor}", moeda(pagamento.amount))
      .replaceAll("{vencimento}", formatarData(pagamento.due_date))
      .replaceAll("{chave}", chave || "(chave Pix não configurada)")
      .replaceAll("{copiaecola}", copiaECola || "(configure a chave Pix em “Dados de cobrança”)")
      .replaceAll("{professor}", PROFESSOR.nome.split(/\s+/)[0]);
  }

  function cobrar(pagamento) {
    if (!pagamento) return;
    const mensagem = montarMensagem(pagamento);
    const link = linkDoWhatsapp(pagamento.telefone, mensagem);

    conteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Cobrança</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>${esc(pagamento.aluno)}</h2>
      <p class="muted small">
        ${pagamento.telefone
          ? `Abre o WhatsApp em ${esc(pagamento.telefone)} com a mensagem pronta. Você confere e aperta enviar.`
          : `Este aluno não tem telefone no cadastro. O WhatsApp vai abrir com o texto pronto para você escolher o contato.`}
      </p>

      <label class="field"><span>Mensagem</span>
        <textarea id="texto" rows="10">${esc(mensagem)}</textarea></label>

      ${config?.pix_key
        ? ""
        : `<div class="alert" role="alert" style="margin-bottom:var(--sp-4)">
             <strong>Sem chave Pix.</strong> Configure em “Dados de cobrança” para a mensagem já sair com o copia e cola.
           </div>`}

      <div class="dialog-actions">
        <button type="button" class="btn" id="copiar">Copiar texto</button>
        <a class="btn btn-primary" id="abrir" href="${esc(link)}" target="_blank" rel="noopener noreferrer">
          Abrir no WhatsApp <span aria-hidden="true">↗</span>
        </a>
      </div>`;

    dialogo.showModal();
    conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));

    const texto = conteudo.querySelector("#texto");
    const abrir = conteudo.querySelector("#abrir");

    // O professor pode ajustar o texto antes de enviar; o link acompanha.
    texto.addEventListener("input", () => {
      abrir.href = linkDoWhatsapp(pagamento.telefone, texto.value);
    });

    const copiar = conteudo.querySelector("#copiar");
    copiar.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(texto.value);
        copiar.textContent = "Copiado";
      } catch {
        texto.select();
        copiar.textContent = "Copie com Ctrl+C";
      }
    });
  }

  /* ---------- navegação ---------- */

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
      <span class="row" style="gap:var(--sp-2)">
        ${pago ? "" : `<button class="btn btn-sm" data-cobrar="${esc(p.id)}">Cobrar no WhatsApp</button>`}
        <button class="btn btn-sm" data-baixa="${esc(p.id)}" data-acao="${pago ? "reabrir" : "pagar"}">
          ${pago ? "Reabrir" : "Marcar pago"}
        </button>
      </span>
    </div>`;
}
