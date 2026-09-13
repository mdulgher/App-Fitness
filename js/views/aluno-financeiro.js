// Financeiro do aluno — somente leitura.
//
// O aluno não escreve nada aqui, e isso não depende desta tela: as regras do
// banco só permitem que ele leia as próprias cobranças. Esconder o botão seria
// aparência; a garantia está no RLS.

import { db, statusPagamento, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import { usuarioAtual } from "../auth.js";
import { PROFESSOR } from "../config.js";
import { pixCopiaECola } from "../pix.js";
import { esc, moeda, formatarData, nomeDoMes, diasEntre, hoje, plural, resumoDoSaldo } from "../utils.js";

export async function render(alvo) {
  const id = usuarioAtual().id;
  const [aluno, pagamentos, config] = await Promise.all([
    db.buscarAluno(id),
    db.listarPagamentos(id),
    db.buscarConfiguracaoDeCobranca(),
  ]);

  const porPacote = aluno?.billing_type === "package";
  const saldo = porPacote
    ? resumoDoSaldo(...await Promise.all([db.listarPacotes(id), db.listarAulasPresenciais(id)]))
    : null;

  const comStatus = pagamentos.map((p) => ({ ...p, status: p.status ?? statusPagamento(p) }));
  const emAberto = comStatus.filter((p) => p.status !== "paid");
  const vencidos = emAberto.filter((p) => p.status === "overdue");
  const proxima = emAberto.filter((p) => p.status === "pending").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head">
        <div class="eyebrow">Financeiro</div>
        <h1>${porPacote ? "Suas aulas" : "Sua mensalidade"}</h1>
      </div>

      ${porPacote ? blocoSaldo(saldo) : ""}
      ${destaque({ vencidos, proxima, aluno })}
      ${blocoPix(config, vencidos[0] ?? proxima)}

      <h2 style="margin:var(--sp-5) 0 var(--sp-3)">Histórico</h2>
      ${comStatus.length
        ? `<div class="list">${comStatus.map(linha).join("")}</div>`
        : `<div class="empty">Nenhuma cobrança lançada ainda.</div>`}

      <p class="muted small" style="margin-top:var(--sp-5)">
        Dúvidas sobre pagamento? Fale com ${esc(PROFESSOR.nome.split(" ")[0])} pelo
        <a href="${esc(PROFESSOR.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>.
      </p>
    </div>`;

  const copiar = alvo.querySelector("#copiar-pix");
  copiar?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copiar.dataset.codigo);
      copiar.textContent = "Código copiado";
    } catch {
      copiar.textContent = "Copie o código acima";
    }
  });
}

// O saldo de aulas, para quem paga por pacote. Só leitura: quem dá baixa numa
// aula é o professor, e isso é regra do banco, não desta tela.
function blocoSaldo(saldo) {
  const acabou = saldo.saldo <= 0;
  return `
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="eyebrow">Saldo de aulas</div>
      <div class="numeric" style="font-size:44px;font-weight:800;letter-spacing:-.04em;margin:var(--sp-2) 0">
        ${saldo.saldo}
      </div>
      <p class="muted small" style="margin:0">
        ${acabou
          ? "Suas aulas acabaram. Fale com o professor para comprar mais."
          : `${plural(saldo.saldo, "aula disponível", "aulas disponíveis")} · ${saldo.usadas} de ${saldo.compradas} já usadas.`}
      </p>
    </div>`;
}

// O copia e cola já sai com o valor da cobrança em aberto: menos um número
// para o aluno digitar errado.
function blocoPix(config, cobranca) {
  if (!config?.pix_key || !cobranca) return "";

  let codigo;
  try {
    codigo = pixCopiaECola({
      chave: config.pix_key,
      nome: config.pix_name || PROFESSOR.nome,
      cidade: config.pix_city || "Sao Paulo",
      valor: cobranca.amount,
      identificador: `LPT${String(cobranca.reference_month).slice(0, 7).replace("-", "")}`,
    });
  } catch {
    return "";
  }

  return `
    <div class="card" style="margin-top:var(--sp-4)">
      <div class="eyebrow">Pagar por Pix</div>
      <p class="muted small" style="margin:var(--sp-2) 0">
        Chave: <strong>${esc(config.pix_key)}</strong> · ${esc(config.pix_name || PROFESSOR.nome)}
      </p>
      <code class="pix-code">${esc(codigo)}</code>
      <button class="btn btn-block" id="copiar-pix" style="margin-top:var(--sp-3)"
              data-codigo="${esc(codigo)}">Copiar código Pix</button>
    </div>`;
}

function destaque({ vencidos, proxima, aluno }) {
  if (vencidos.length) {
    const total = vencidos.reduce((t, p) => t + Number(p.amount ?? 0), 0);
    const atraso = Math.max(...vencidos.map((p) => diasEntre(p.due_date, hoje())));
    return `
      <div class="alert">
        <div class="eyebrow">Pagamento em atraso</div>
        <div class="numeric" style="font-size:30px;font-weight:800;letter-spacing:-.03em;margin:var(--sp-2) 0">${moeda(total)}</div>
        <p style="margin:0">${plural(vencidos.length, "mensalidade vencida", "mensalidades vencidas")} · ${plural(atraso, "dia", "dias")} de atraso.</p>
      </div>`;
  }

  if (proxima) {
    const faltam = diasEntre(hoje(), proxima.due_date);
    return `
      <div class="card card-invert">
        <div class="eyebrow">Próximo vencimento</div>
        <div class="numeric" style="font-size:30px;font-weight:800;letter-spacing:-.03em;margin:var(--sp-2) 0">${moeda(proxima.amount)}</div>
        <p style="margin:0">${formatarData(proxima.due_date)} · ${faltam === 0 ? "vence hoje" : `em ${plural(faltam, "dia", "dias")}`}</p>
      </div>`;
  }

  return `
    <div class="card card-invert">
      <div class="eyebrow">Situação</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:-.03em;margin:var(--sp-2) 0">Tudo em dia.</div>
      <p style="margin:0">${aluno?.monthly_fee ? `Mensalidade de ${moeda(aluno.monthly_fee)}, vencimento dia ${aluno.due_day}.` : "Sem cobrança em aberto."}</p>
    </div>`;
}

function linha(p) {
  return `
    <div class="list-item">
      <span class="list-item-main">
        <span class="row-between">
          <span class="list-item-title">${esc(nomeDoMes(p.reference_month))} de ${esc(p.reference_month.slice(0, 4))}</span>
          <span class="${CLASSE_STATUS[p.status]}">${ROTULO_STATUS[p.status]}</span>
        </span>
        <span class="muted small numeric">
          ${moeda(p.amount)} · vence ${formatarData(p.due_date)}
          ${p.paid_date ? ` · pago ${formatarData(p.paid_date)}` : ""}
          ${p.payment_method ? ` · ${esc(p.payment_method)}` : ""}
        </span>
      </span>
    </div>`;
}
