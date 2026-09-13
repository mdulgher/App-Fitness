// Perfil do aluno, visto pelo professor
//
// Três abas: Geral, Fichas e Financeiro — e Geral é a que abre.
// O motivo é físico, não estético: o professor mexe nessa tela ao lado do
// aluno, mostrando a ficha, e dinheiro não pode aparecer junto — nem o dele,
// nem o que o vizinho de cadastro paga. Quem quiser ver o financeiro precisa
// trocar de aba de propósito.

import { db, statusPagamento, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import {
  esc,
  iniciais,
  moeda,
  formatarData,
  textoTempoRelativo,
  plural,
  nomeDoMes,
  rotuloDiasSemana,
  ligarMascaraDeMoeda,
  moedaParaNumero,
  numeroParaMoeda,
  hoje,
  somarDias,
} from "../utils.js";
import { renderizarCalendario } from "../calendar-grid.js";
import { registrarErro } from "../log.js";

export async function render(alvo, { params }) {
  const [id] = params;
  const aluno = await db.buscarAluno(id);

  if (!aluno) {
    alvo.innerHTML = `<div class="wrap"><div class="empty">Aluno não encontrado.</div></div>`;
    return;
  }

  const [ficha, fichas, semana, anotacoes, pagamentos, sessoes] = await Promise.all([
    db.fichaAtiva(id),
    db.listarFichas(id),
    db.resumoDaSemana(id),
    db.listarAnotacoes(id),
    db.listarPagamentos(id),
    db.listarSessoes(id),
  ]);

  const concluidas = sessoes.filter((s) => s.completed_at);

  alvo.innerHTML = `
    <div class="wrap">
      <a class="muted small" href="#/professor/alunos">&larr; Alunos</a>

      <div class="page-head row-between" style="margin-top:var(--sp-4);flex-wrap:wrap;gap:var(--sp-3)">
        <div class="row">
          <span class="avatar" style="width:56px;height:56px;flex-basis:56px;font-size:17px">
            ${esc(iniciais(aluno.full_name))}
          </span>
          <div>
            <h1>${esc(aluno.full_name)}</h1>
            <div class="muted small">
              ${esc(aluno.goal ?? "Sem objetivo")}
              ${aluno.resumo.metaSemanal ? ` · meta de ${plural(aluno.resumo.metaSemanal, "treino", "treinos")}/semana` : ""}
              ${aluno.active ? "" : " · <strong>inativo</strong>"}
            </div>
          </div>
        </div>
        <button class="btn" id="editar">Editar cadastro</button>
      </div>

      <div class="movement-tabs" id="abas" role="tablist" style="margin-bottom:var(--sp-4)">
        <button class="movement-tab" role="tab" data-aba="geral" aria-selected="true">Geral</button>
        <button class="movement-tab" role="tab" data-aba="fichas" aria-selected="false">Fichas</button>
        <button class="movement-tab" role="tab" data-aba="financeiro" aria-selected="false">Financeiro</button>
      </div>

      <section id="painel-geral" role="tabpanel">
        ${blocoRestricoes(aluno)}

        <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
          ${cartao("Semana", `${semana.feitos}/${semana.meta}`, "treinos concluídos")}
          ${cartao("Último treino", aluno.resumo.ultimoTreino ? textoTempoRelativo(aluno.resumo.ultimoTreino) : "—", `${concluidas.length} no total`)}
          ${cartao("Ficha", ficha ? "Ativa" : "Sem ficha",
            ficha ? `até ${ficha.end_date ? formatarData(ficha.end_date) : "sem prazo"}` : "aguardando treino")}
        </div>

        ${blocoCadastro(aluno)}

        <hr class="hr" />

        ${blocoFrequencia(sessoes)}

        <hr class="hr" />
        ${blocoAnotacoes(anotacoes)}
      </section>

      <section id="painel-fichas" role="tabpanel" class="hidden">
        ${blocoListaDeFichas(aluno, fichas)}
        ${blocoFicha(ficha)}
      </section>

      <section id="painel-financeiro" role="tabpanel" class="hidden">
        <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
          ${cartao("Mensalidade", moeda(aluno.monthly_fee), aluno.due_day ? `vence dia ${aluno.due_day}` : "sem vencimento")}
          ${cartao("Em aberto", moeda(emAberto(pagamentos)), plural(pagamentos.filter((p) => !p.paid_date).length, "cobrança", "cobranças"))}
          ${cartao("Pago no total", moeda(pagamentos.filter((p) => p.paid_date).reduce((t, p) => t + Number(p.amount ?? 0), 0)), "desde o início")}
        </div>
        ${blocoFinanceiro(pagamentos)}
      </section>
    </div>
    <dialog class="exercise-dialog" id="dialogo"><div id="dialogo-conteudo"></div></dialog>
  `;

  alvo.querySelector("#editar").addEventListener("click", () => formularioDeEdicao(alvo, aluno));

  const recarregar = () => render(alvo, { params: [aluno.id] });

  alvo.querySelector("[data-novo-recado]")?.addEventListener("click", () =>
    formularioDeRecado(alvo, aluno, null, recarregar)
  );
  alvo.querySelectorAll("[data-editar-recado]").forEach((b) =>
    b.addEventListener("click", () =>
      formularioDeRecado(alvo, aluno, anotacoes.find((n) => n.id === b.dataset.editarRecado), recarregar)
    )
  );

  // A aba volta para "Geral" a cada abertura da tela, de propósito: sair do
  // financeiro não pode depender de o professor lembrar de trocar antes de
  // virar o notebook para o aluno.
  alvo.querySelector("#abas").addEventListener("click", (ev) => {
    const botao = ev.target.closest("[data-aba]");
    if (!botao) return;
    const aba = botao.dataset.aba;
    alvo.querySelectorAll("[data-aba]").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.aba === aba))
    );
    ["geral", "fichas", "financeiro"].forEach((nome) =>
      alvo.querySelector(`#painel-${nome}`).classList.toggle("hidden", nome !== aba)
    );
  });
}

function emAberto(pagamentos) {
  return pagamentos.filter((p) => !p.paid_date).reduce((t, p) => t + Number(p.amount ?? 0), 0);
}

// A mensalidade mora aqui, e não na tela de financeiro, porque é um dado do
// cadastro do aluno: o financeiro só lê o valor na hora de gerar a cobrança.
// Mudar o preço não mexe em cobranças já lançadas — essas se editam uma a uma,
// senão um reajuste reescreveria o histórico dos meses passados.
function formularioDeEdicao(alvo, aluno) {
  const dialogo = alvo.querySelector("#dialogo");
  const conteudo = alvo.querySelector("#dialogo-conteudo");

  conteudo.innerHTML = `
    <div class="dialog-top">
      <span class="eyebrow">Cadastro</span>
      <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
    </div>
    <h2>${esc(aluno.full_name)}</h2>
    <p class="muted small">O email de acesso não muda por aqui: ele é o login da conta.</p>

    <form id="form-edicao">
      <div class="field"><label for="e-nome">Nome completo</label>
        <input id="e-nome" name="full_name" required maxlength="120" value="${esc(aluno.full_name)}" /></div>

      <div class="field"><label for="e-telefone">Telefone (WhatsApp)</label>
        <input id="e-telefone" name="phone" value="${esc(aluno.phone ?? "")}" placeholder="(11) 90000-0000" /></div>

      <div class="field"><label for="e-objetivo">Objetivo</label>
        <select id="e-objetivo" name="goal">
          ${["Hipertrofia", "Emagrecimento", "Condicionamento", "Reabilitação", "Saúde geral"]
            .map((o) => `<option${o === aluno.goal ? " selected" : ""}>${o}</option>`).join("")}
        </select></div>

      <div class="field"><label for="e-restricoes">Restrições e lesões</label>
        <textarea id="e-restricoes" name="health_restrictions" rows="3">${esc(aluno.health_restrictions ?? "")}</textarea></div>

      <div class="exercise-form-grid">
        <div class="field"><label for="e-mensalidade">Mensalidade</label>
          <input id="e-mensalidade" name="monthly_fee" type="text" inputmode="numeric"
                 value="${esc(numeroParaMoeda(aluno.monthly_fee))}" placeholder="R$ 0,00" /></div>
        <div class="field"><label for="e-vencimento">Dia do vencimento</label>
          <input id="e-vencimento" name="due_day" type="number" inputmode="numeric" min="1" max="28"
                 value="${esc(aluno.due_day ?? 5)}" /></div>
      </div>

      <label class="field field-check">
        <input type="checkbox" name="active" ${aluno.active ? "checked" : ""} />
        <span>Aluno ativo (entra na geração de cobranças do mês)</span>
      </label>

      <div data-erro class="alert hidden" role="alert"></div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="salvar">Salvar</button>
      </div>
    </form>`;

  dialogo.showModal();
  conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));
  ligarMascaraDeMoeda(conteudo.querySelector("#e-mensalidade"));

  const form = conteudo.querySelector("#form-edicao");
  const erro = conteudo.querySelector("[data-erro]");
  const salvar = conteudo.querySelector("#salvar");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erro.classList.add("hidden");
    const d = Object.fromEntries(new FormData(form));

    const patch = {
      full_name: d.full_name.trim(),
      phone: d.phone.trim() || null,
      goal: d.goal,
      health_restrictions: d.health_restrictions.trim() || null,
      // Campo vazio vira null, não 0: "sem mensalidade" e "mensalidade de zero"
      // são coisas diferentes na hora de gerar cobrança.
      monthly_fee: moedaParaNumero(d.monthly_fee),
      due_day: Number(d.due_day) || 5,
      active: form.elements.active.checked,
    };

    if (patch.monthly_fee != null && (Number.isNaN(patch.monthly_fee) || patch.monthly_fee < 0)) {
      erro.textContent = "Mensalidade inválida.";
      erro.classList.remove("hidden");
      return;
    }

    salvar.disabled = true;
    salvar.textContent = "Salvando…";
    try {
      await db.atualizarAluno(aluno.id, patch);
      dialogo.close();
      await render(alvo, { params: [aluno.id] });
    } catch (err) {
      registrarErro(err, { contexto: { tela: "aluno do professor", acao: "salvarCadastro", alunoId: aluno.id } });
      erro.textContent = err.message;
      erro.classList.remove("hidden");
      salvar.disabled = false;
      salvar.textContent = "Salvar";
    }
  });
}

// Recado é texto e um interruptor, e nada mais. Qualquer campo a mais aqui
// (título, categoria, data de validade) vira trabalho para o professor e
// desculpa para não escrever.
function formularioDeRecado(alvo, aluno, existente, aoSalvar) {
  const dialogo = alvo.querySelector("#dialogo");
  const conteudo = alvo.querySelector("#dialogo-conteudo");

  conteudo.innerHTML = `
    <div class="dialog-top">
      <span class="eyebrow">Recado para ${esc(aluno.full_name)}</span>
      <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
    </div>
    <h2>${existente ? "Editar recado" : "Escrever recado"}</h2>
    <p class="muted small">O aluno lê isto em “Recados”, dentro do app dele.</p>

    <form id="form-recado">
      <div class="field">
        <label for="rec-texto">Recado</label>
        <textarea id="rec-texto" name="content" rows="5" required maxlength="1000"
                  placeholder="Ex.: Subi a carga do supino para 24 kg. Se fechar as 4 séries com folga, me avisa.">${esc(existente?.content ?? "")}</textarea>
      </div>

      <label class="field field-check">
        <input type="checkbox" name="pinned" ${existente?.pinned ? "checked" : ""} />
        <span>Fixar no topo (aparece também no painel do aluno)</span>
      </label>

      <div data-erro class="alert hidden" role="alert"></div>
      <div class="dialog-actions">
        ${existente ? `<button type="button" class="btn" id="excluir-recado">Excluir</button>` : ""}
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="salvar-recado">
          ${existente ? "Salvar" : "Enviar recado"}
        </button>
      </div>
    </form>`;

  dialogo.showModal();
  conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));

  const texto = conteudo.querySelector("#rec-texto");
  texto.focus();

  const form = conteudo.querySelector("#form-recado");
  const erro = conteudo.querySelector("[data-erro]");
  const salvar = conteudo.querySelector("#salvar-recado");
  const mostrarErro = (msg) => {
    erro.textContent = msg;
    erro.classList.remove("hidden");
  };

  // Confirmação dentro do próprio diálogo, em dois toques, e não um confirm()
  // do navegador: essas caixas somem depois de "impedir que esta página crie
  // novas caixas de diálogo" e o botão fica sem fazer nada.
  const excluir = conteudo.querySelector("#excluir-recado");
  excluir?.addEventListener("click", async () => {
    if (excluir.dataset.confirmando !== "1") {
      excluir.dataset.confirmando = "1";
      excluir.textContent = "Confirmar exclusão";
      excluir.classList.add("btn-perigo");
      return;
    }
    try {
      await db.removerAnotacao(existente.id);
      dialogo.close();
      await aoSalvar();
    } catch (err) {
      registrarErro(err, { contexto: { tela: "aluno do professor", acao: "removerRecado", alunoId: aluno.id } });
      mostrarErro(err.message);
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erro.classList.add("hidden");

    const conteudoDoRecado = texto.value.trim();
    if (!conteudoDoRecado) return mostrarErro("Escreva o recado antes de enviar.");

    const fixada = form.elements.pinned.checked;
    salvar.disabled = true;
    salvar.textContent = "Salvando…";
    try {
      if (existente) {
        // Nomes em português de propósito: as duas implementações do banco
        // traduzem só `conteudo`/`fixada` e ignoram em silêncio qualquer
        // outra chave — mandar { content, pinned } salva nada e não dá erro.
        await db.atualizarAnotacao(existente.id, { conteudo: conteudoDoRecado, fixada });
      } else {
        await db.criarAnotacao({ alunoId: aluno.id, conteudo: conteudoDoRecado, fixada });
      }
      dialogo.close();
      await aoSalvar();
    } catch (err) {
      registrarErro(err, { contexto: { tela: "aluno do professor", acao: existente ? "editarRecado" : "criarRecado", alunoId: aluno.id } });
      mostrarErro(err.message);
      salvar.disabled = false;
      salvar.textContent = existente ? "Salvar" : "Enviar recado";
    }
  });
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

// O que era ficha detalhada no "Geral" virou o cartão de cadastro: quem abre o
// aluno quer primeiro saber quem ele é, e a prescrição inteira tem aba própria.
function blocoCadastro(aluno) {
  const linhas = [
    ["Objetivo", aluno.goal ?? "—"],
    ["Telefone", aluno.phone ?? "—"],
    ["Situação", aluno.active ? "Ativo" : "Inativo"],
  ];
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)"><h2>Cadastro</h2></div>
    <div class="card">
      <div class="list">
        ${linhas.map(([r, v]) => `
          <div class="list-item">
            <span class="list-item-main">
              <span class="row-between">
                <span class="muted small">${esc(r)}</span>
                <span class="list-item-title">${esc(String(v))}</span>
              </span>
            </span>
          </div>`).join("")}
      </div>
    </div>`;
}

// Todas as fichas do aluno, e não só a ativa: a ficha anterior é o histórico do
// que ele já treinou, e o professor consulta isso na hora de montar a próxima.
function blocoListaDeFichas(aluno, fichas) {
  const editor = `#/professor/aluno/${esc(aluno.id)}/ficha`;
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3);flex-wrap:wrap;gap:var(--sp-2)">
      <h2>Fichas</h2>
      <a class="btn btn-sm btn-primary" href="${editor}">
        ${fichas.length ? "Editar fichas" : "Montar ficha"} <span aria-hidden="true">↗</span>
      </a>
    </div>
    ${fichas.length
      ? `<div class="list" style="margin-bottom:var(--sp-5)">${fichas.map((f) => `
          <div class="list-item">
            <span class="list-item-main">
              <span class="row-between">
                <span class="list-item-title">${esc(f.title)}</span>
                ${f.active ? `<span class="tag tag-solid">Ativa</span>` : `<span class="tag tag-quiet">Encerrada</span>`}
              </span>
              <span class="muted small numeric">
                ${formatarData(f.start_date)} &rarr; ${f.end_date ? formatarData(f.end_date) : "sem prazo"}
              </span>
            </span>
          </div>`).join("")}</div>`
      : `<div class="empty" style="margin-bottom:var(--sp-5)">Nenhuma ficha criada ainda.</div>`}`;
}

function blocoFicha(ficha) {
  if (!ficha) {
    return `
      <div class="row-between" style="margin-bottom:var(--sp-3)">
        <h2>Ficha</h2>
      </div>
      <div class="empty">
        Nenhuma ficha ativa. Abra o editor acima para prescrever os exercícios e os dias da semana.
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
        <span class="muted small">${esc(rotuloDiasSemana(dia.weekdays))}</span>
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

function blocoFrequencia(sessoes) {
  const concluidas = sessoes.filter((s) => s.completed_at);
  const diasTreinados = new Map(concluidas.map((s) => [s.date, s]));
  const [ano, mes] = hoje().split("-").map(Number);

  const nomeDoMesAtual = nomeDoMes(hoje());

  return `
    <div style="margin-bottom:var(--sp-5)">
      <h2 style="margin-bottom:var(--sp-3)">Frequência — ${nomeDoMesAtual}</h2>
      <div class="card">
        <div class="calendario-mes" style="margin-bottom:var(--sp-3)">
          ${renderizarCalendario(ano, mes, diasTreinados, null)}
        </div>
        <div class="muted small" style="text-align:center">
          ${plural(concluidas.filter((s) => {
            const [a, m] = s.date.split("-");
            return Number(a) === ano && Number(m) === mes;
          }).length, "treino concluído", "treinos concluídos")} neste mês
        </div>
      </div>
    </div>`;
}

// O recado escrito aqui é o que o aluno lê em #/aluno/anotacoes. Fixar é como
// o professor marca o que vale para o mês inteiro, e não para o treino de
// terça — o aluno vê os fixados no topo, e também no painel dele.
function blocoAnotacoes(anotacoes) {
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)">
      <h2>Recados</h2>
      <div class="row" style="gap:var(--sp-2)">
        <span class="muted small">${plural(anotacoes.length, "recado", "recados")}</span>
        <button class="btn btn-sm btn-primary" data-novo-recado>+ Escrever recado</button>
      </div>
    </div>
    ${
      anotacoes.length
        ? `<div class="stack">${anotacoes.map(cartaoDeRecado).join("")}</div>`
        : `<div class="empty">
             Nenhum recado ainda. O que você escrever aqui aparece na área do aluno.
           </div>`
    }`;
}

function cartaoDeRecado(n) {
  return `
    <div class="card">
      <div class="row-between" style="margin-bottom:var(--sp-2)">
        <span class="eyebrow">${formatarData(String(n.created_at).slice(0, 10))}</span>
        <div class="row" style="gap:var(--sp-2)">
          ${n.pinned ? `<span class="tag tag-solid">Fixado</span>` : ""}
          <button class="btn btn-sm" data-editar-recado="${esc(n.id)}">Editar</button>
        </div>
      </div>
      <div style="white-space:pre-wrap;line-height:1.6">${esc(n.content)}</div>
    </div>`;
}

function blocoFinanceiro(pagamentos) {
  return `
    <div class="row-between" style="margin-bottom:var(--sp-3)">
      <h2>Histórico de cobranças</h2>
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
