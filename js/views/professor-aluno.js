// Perfil do aluno, visto pelo professor
//
// Cinco abas: Geral, Fichas, Realizados, Progressão e Financeiro — Geral abre.
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
  resumoDoSaldo,
  isoParaDataBR,
  dataBRParaIso,
  ligarMascaraDeData,
} from "../utils.js";
import { caminhoDoBanner } from "../catalogo-banners.js";
import { renderizarCalendario } from "../calendar-grid.js";
import { registrarErro } from "../log.js";
import { renderizarProgressao } from "./aluno-evolucao.js";
import { renderizarTreinosRealizados } from "../treinos-realizados.js";

// Aulas avulsas: o saldo, a venda de pacote e o consumo.
//
// Quem marca a aula é só o professor, e isso não é escolha de tela — a política
// do banco recusa uma linha de frequência `in_person` vinda do aluno. A aula é
// presencial e paga: o aluno não pode dar baixa no que comprou.
function blocoPacote(saldo, pacotes, aulas) {
  const acabou = saldo.saldo <= 0;
  return `
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="row-between" style="flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-3)">
        <div>
          <div class="eyebrow">Aulas avulsas</div>
          <p class="muted small" style="margin:var(--sp-2) 0 0">
            ${acabou
              ? "Sem saldo. Venda um pacote antes da próxima aula."
              : `${plural(saldo.saldo, "aula disponível", "aulas disponíveis")}.`}
          </p>
        </div>
        <div class="row" style="gap:var(--sp-2);flex-wrap:wrap">
          <button class="btn btn-sm" id="vender-pacote">Vender pacote</button>
          <button class="btn btn-sm btn-primary" id="marcar-aula" ${acabou ? "disabled" : ""}>
            Marcar aula de hoje
          </button>
        </div>
      </div>

      ${pacotes.length ? `
        <div class="list">
          ${pacotes.map((p) => `
            <div class="list-item">
              <span class="list-item-main">
                <span class="list-item-title">${plural(p.classes_total, "aula", "aulas")} · ${esc(moeda(p.price))}</span>
                <span class="muted small">comprado em ${esc(formatarData(p.purchased_on))}</span>
              </span>
              <button class="btn btn-sm" data-remover-pacote="${esc(p.id)}">Excluir</button>
            </div>`).join("")}
        </div>` : `<div class="empty">Nenhum pacote vendido ainda.</div>`}

      ${aulas.length ? `
        <details style="margin-top:var(--sp-3)">
          <summary class="muted small">${plural(aulas.length, "aula dada", "aulas dadas")}</summary>
          <div class="list">
            ${aulas.map((a) => `
              <div class="list-item">
                <span class="list-item-main"><span class="list-item-title">${esc(formatarData(a.date))}</span></span>
                <button class="btn btn-sm" data-remover-aula="${esc(a.id)}">Desfazer</button>
              </div>`).join("")}
          </div>
        </details>` : ""}
    </div>`;
}

export async function render(alvo, { params }) {
  const [id] = params;
  const aluno = await db.buscarAluno(id);

  if (!aluno) {
    alvo.innerHTML = `<div class="wrap"><div class="empty">Aluno não encontrado.</div></div>`;
    return;
  }

  const porPacote = aluno.billing_type === "package";

  const [ficha, fichas, semana, anotacoes, pagamentos, sessoes, pacotes, aulasAvulsas] = await Promise.all([
    db.fichaAtiva(id),
    db.listarFichas(id),
    db.resumoDaSemana(id),
    db.listarAnotacoes(id),
    db.listarPagamentos(id),
    db.listarSessoes(id),
    porPacote ? db.listarPacotes(id) : [],
    porPacote ? db.listarAulasPresenciais(id) : [],
  ]);

  const saldo = resumoDoSaldo(pacotes, aulasAvulsas);

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
        <button class="movement-tab" role="tab" data-aba="realizados" aria-selected="false">Realizados</button>
        <button class="movement-tab" role="tab" data-aba="progressao" aria-selected="false">Progressão</button>
        <button class="movement-tab" role="tab" data-aba="financeiro" aria-selected="false">Financeiro</button>
      </div>

      <section id="painel-geral" role="tabpanel">
        ${blocoRestricoes(aluno)}

        <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
          ${cartao("Semana",
            semana.meta ? `${semana.feitos}/${semana.meta}` : `${semana.feitos}`,
            semana.comPersonal
              ? `dias treinados · ${semana.comPersonal} com você`
              : semana.meta ? "dias treinados" : "dias treinados · sem meta")}
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

      <section id="painel-realizados" role="tabpanel" class="hidden">
        <div class="empty">Abra esta aba para carregar os treinos realizados.</div>
      </section>

      <section id="painel-progressao" role="tabpanel" class="hidden">
        <div class="empty">Abra esta aba para carregar a evolução.</div>
      </section>

      <section id="painel-financeiro" role="tabpanel" class="hidden">
        <div class="grid grid-3" style="margin-bottom:var(--sp-5)">
          ${porPacote
            ? cartao("Saldo de aulas", String(saldo.saldo), `${saldo.usadas} de ${saldo.compradas} usadas`)
            : cartao("Mensalidade", moeda(aluno.monthly_fee), aluno.due_day ? `vence dia ${aluno.due_day}` : "sem vencimento")}
          ${cartao("Em aberto", moeda(emAberto(pagamentos)), plural(pagamentos.filter((p) => !p.paid_date).length, "cobrança", "cobranças"))}
          ${cartao("Pago no total", moeda(pagamentos.filter((p) => p.paid_date).reduce((t, p) => t + Number(p.amount ?? 0), 0)), "desde o início")}
        </div>
        ${porPacote ? blocoPacote(saldo, pacotes, aulasAvulsas) : ""}
        ${blocoFinanceiro(pagamentos)}
      </section>
    </div>
    <dialog class="exercise-dialog" id="dialogo"><div id="dialogo-conteudo"></div></dialog>
  `;

  alvo.querySelector("#editar").addEventListener("click", () => formularioDeEdicao(alvo, aluno));

  const recarregar = () => render(alvo, { params: [aluno.id] });

  // Marcar a aula é um toque só, sem diálogo: o professor faz isso com o aluno
  // na frente, no fim da aula. O que exige confirmação é desfazer.
  alvo.querySelector("#marcar-aula")?.addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      await db.marcarAulaPresencial(aluno.id);
      await recarregar();
    } catch (err) {
      registrarErro(err, { contexto: { tela: "aluno", acao: "marcarAulaPresencial", alunoId: aluno.id } });
      ev.currentTarget.disabled = false;
      alvo.querySelector("#marcar-aula").textContent = err.message;
    }
  });

  alvo.querySelector("#vender-pacote")?.addEventListener("click", () =>
    formularioDePacote(alvo, aluno, recarregar)
  );

  // Dois toques no próprio botão, como no resto do app: `confirm()` pode ser
  // bloqueado pelo navegador e some no app instalado.
  alvo.querySelectorAll("[data-remover-pacote], [data-remover-aula]").forEach((b) =>
    b.addEventListener("click", async () => {
      const pacote = b.dataset.removerPacote;
      if (b.dataset.confirmando !== "1") {
        b.dataset.confirmando = "1";
        b.textContent = pacote ? "Confirmar exclusão" : "Confirmar";
        return;
      }
      b.disabled = true;
      try {
        if (pacote) await db.removerPacote(pacote);
        else await db.removerAulaPresencial(b.dataset.removerAula);
        await recarregar();
      } catch (err) {
        registrarErro(err, { contexto: { tela: "aluno", acao: pacote ? "removerPacote" : "removerAula" } });
        b.disabled = false;
        b.textContent = err.message;
      }
    })
  );

  // Bloquear acesso tira o aluno do app na hora; parar de cobrar mexe só no
  // dinheiro. Os dois pedem confirmação no próprio botão, como as exclusões.
  alvo.querySelectorAll("[data-cobranca], [data-acesso]").forEach((b) =>
    b.addEventListener("click", async () => {
      const acesso = b.dataset.acesso;
      if (b.dataset.confirmando !== "1") {
        b.dataset.confirmando = "1";
        b.textContent = "Confirmar";
        return;
      }
      b.disabled = true;
      try {
        if (acesso) await db.bloquearAcesso(aluno.id, acesso === "bloquear");
        else await db.desativarAluno(aluno.id, b.dataset.cobranca === "voltar");
        await recarregar();
      } catch (err) {
        registrarErro(err, {
          contexto: { tela: "aluno", acao: acesso ? "bloquearAcesso" : "situacaoDeCobranca", alunoId: aluno.id },
        });
        b.disabled = false;
        b.textContent = err.message;
      }
    })
  );

  // Redefinir senha invalida a senha atual do aluno e derruba os aparelhos
  // dele. Pede confirmação no próprio botão, como bloquear acesso — e pelo
  // mesmo motivo: é irreversível no sentido que importa, porque a senha antiga
  // não volta.
  alvo.querySelector("#redefinir-senha")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    if (b.dataset.confirmando !== "1") {
      b.dataset.confirmando = "1";
      b.textContent = "Confirmar";
      return;
    }
    b.disabled = true;
    b.textContent = "Redefinindo…";
    try {
      const resultado = await db.redefinirSenhaDoAluno(aluno.id);
      dialogoDeSenhaNova(alvo, resultado);
      b.dataset.confirmando = "";
      b.disabled = false;
      b.textContent = "Redefinir senha";
    } catch (err) {
      registrarErro(err, {
        contexto: { tela: "aluno", acao: "redefinirSenhaDoAluno", alunoId: aluno.id },
      });
      b.disabled = false;
      b.textContent = err.message;
    }
  });

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
  let progressaoCarregada = false;
  let progressaoCarregando = false;
  let realizadosCarregados = false;
  let realizadosCarregando = false;
  alvo.querySelector("#abas").addEventListener("click", async (ev) => {
    const botao = ev.target.closest("[data-aba]");
    if (!botao) return;
    const aba = botao.dataset.aba;
    alvo.querySelectorAll("[data-aba]").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.aba === aba))
    );
    ["geral", "fichas", "realizados", "progressao", "financeiro"].forEach((nome) =>
      alvo.querySelector(`#painel-${nome}`).classList.toggle("hidden", nome !== aba)
    );

    // Mesma leitura que o aluno tem na Frequência dele: o professor precisa ver
    // a carga que foi de fato levantada antes de ajustar a prescrição, e sem
    // isso ele só tinha o calendário — sabia que treinou, não o que fez.
    if (aba === "realizados" && !realizadosCarregados && !realizadosCarregando) {
      realizadosCarregando = true;
      try {
        await renderizarTreinosRealizados(alvo.querySelector("#painel-realizados"), aluno.id, {
          visaoProfessor: true,
          nomeAluno: aluno.full_name.split(/\s+/)[0],
        });
        realizadosCarregados = true;
      } finally {
        realizadosCarregando = false;
      }
    }

    // O histórico pode crescer bastante. Ele só é consultado quando o professor
    // realmente abre a aba, e uma única vez durante esta visita ao aluno.
    if (aba === "progressao" && !progressaoCarregada && !progressaoCarregando) {
      progressaoCarregando = true;
      const painel = alvo.querySelector("#painel-progressao");
      try {
        await renderizarProgressao(painel, aluno.id, {
          visaoProfessor: true,
          nomeAluno: aluno.full_name.split(/\s+/)[0],
        });
        progressaoCarregada = true;
      } catch (err) {
        registrarErro(err, { contexto: { tela: "aluno", aba: "progressao", alunoId: aluno.id } });
        if (painel.isConnected) {
          painel.innerHTML = `<div class="alert" role="alert">Não foi possível carregar a progressão. Tente abrir a aba novamente.</div>`;
        }
      } finally {
        progressaoCarregando = false;
      }
    }
  });
}

function emAberto(pagamentos) {
  return pagamentos.filter((p) => !p.paid_date).reduce((t, p) => t + Number(p.amount ?? 0), 0);
}

// A mensalidade mora aqui, e não na tela de financeiro, porque é um dado do
// cadastro do aluno: o financeiro só lê o valor na hora de gerar a cobrança.
// Mudar o preço não mexe em cobranças já lançadas — essas se editam uma a uma,
// senão um reajuste reescreveria o histórico dos meses passados.
// Vender um pacote lança a cobrança junto. São o mesmo ato: não existe pacote
// vendido que não seja devido, e a baixa na cobrança é o que diz que foi pago.
function formularioDePacote(alvo, aluno, aoSalvar) {
  const dialogo = alvo.querySelector("#dialogo");
  const conteudo = alvo.querySelector("#dialogo-conteudo");

  conteudo.innerHTML = `
    <div class="dialog-top">
      <span class="eyebrow">Aulas avulsas</span>
      <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
    </div>
    <h2>Vender pacote para ${esc(aluno.full_name.split(/\s+/)[0])}</h2>
    <p class="muted small">Cria o saldo de aulas e lança a cobrança do valor no financeiro.</p>
    <form id="form-pacote">
      <div class="exercise-form-grid">
        <div class="field"><label for="p-aulas">Quantas aulas</label>
          <input id="p-aulas" name="aulas" type="number" inputmode="numeric" min="1" max="100" value="4" required /></div>
        <div class="field"><label for="p-total">Valor total</label>
          <input id="p-total" name="valor" type="text" inputmode="numeric" placeholder="R$ 0,00" /></div>
      </div>
      <div class="field"><label for="p-vencimento">Vencimento</label>
        <input id="p-vencimento" name="vencimento" type="text" inputmode="numeric"
               placeholder="dd/mm/aaaa" value="${esc(isoParaDataBR(hoje()))}" /></div>
      <div data-erro class="alert hidden" role="alert"></div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary" id="salvar-pacote">Vender</button>
      </div>
    </form>`;

  dialogo.showModal();
  conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));

  const campoAulas = conteudo.querySelector("#p-aulas");
  const campoTotal = conteudo.querySelector("#p-total");
  ligarMascaraDeMoeda(campoTotal);
  ligarMascaraDeData(conteudo.querySelector("#p-vencimento"));

  // O total acompanha a quantidade enquanto o professor não digitar o dele:
  // 4 aulas a R$ 80 é R$ 320, e refazer essa conta à mão só cria erro de digitação.
  const sugerirTotal = () => {
    if (campoTotal.dataset.editado === "1" || !(Number(aluno.class_fee) > 0)) return;
    campoTotal.value = numeroParaMoeda(Number(campoAulas.value || 0) * Number(aluno.class_fee));
  };
  campoTotal.addEventListener("input", () => { campoTotal.dataset.editado = "1"; });
  campoAulas.addEventListener("input", sugerirTotal);
  sugerirTotal();

  const form = conteudo.querySelector("#form-pacote");
  const erro = conteudo.querySelector("[data-erro]");

  // A chave nasce com o formulário, não com o clique: se o professor apertar
  // "Vender" de novo depois de um erro de rede, é a MESMA venda sendo
  // retransmitida. Gerar uma chave por tentativa venderia duas vezes quando a
  // primeira resposta se perdesse no caminho.
  const requestId = crypto.randomUUID();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    erro.classList.add("hidden");
    const botao = conteudo.querySelector("#salvar-pacote");

    const aulas = Number(campoAulas.value);
    const valor = moedaParaNumero(campoTotal.value);
    const vencimento = dataBRParaIso(conteudo.querySelector("#p-vencimento").value);

    const falha = !(aulas > 0) ? "Informe quantas aulas o pacote tem."
      : valor == null || valor < 0 ? "Informe o valor total do pacote."
      : !vencimento ? "Data de vencimento inválida."
      : null;
    if (falha) {
      erro.textContent = falha;
      erro.classList.remove("hidden");
      return;
    }

    botao.disabled = true;
    botao.textContent = "Vendendo…";
    try {
      await db.venderPacote({ alunoId: aluno.id, aulas, valor, vencimento, requestId });
      dialogo.close();
      await aoSalvar();
    } catch (err) {
      registrarErro(err, { contexto: { tela: "aluno", acao: "venderPacote", alunoId: aluno.id } });
      erro.textContent = err.message;
      erro.classList.remove("hidden");
      botao.disabled = false;
      botao.textContent = "Vender";
    }
  });
}

// A senha nova aparece UMA vez. O Supabase guarda só o hash: nem o professor
// consegue consultá-la depois, e por isso a tela avisa antes de fechar em vez
// de deixar descobrir sozinho.
//
// `sessoesEncerradas` vem do servidor e não é enfeite: trocar a senha e não
// derrubar as sessões deixaria um aparelho antigo logado com a conta — é a
// mesma armadilha do "Sair" que não saía, de 16/09. Se a derrubada falhar, o
// professor precisa saber, porque aí a senha nova sozinha não tirou ninguém.
function dialogoDeSenhaNova(alvo, resultado) {
  const dialogo = alvo.querySelector("#dialogo");
  const conteudo = alvo.querySelector("#dialogo-conteudo");

  conteudo.innerHTML = `
    <div class="dialog-top">
      <span class="eyebrow">Senha redefinida</span>
      <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
    </div>
    <h2 id="dialog-title">${esc(resultado.full_name ?? "Aluno")}</h2>
    <p class="muted small">
      Mande esta senha para o aluno. Ela não aparece de novo depois que você fechar.
    </p>

    <div class="card" style="margin:var(--sp-4) 0">
      <div class="eyebrow">Email</div>
      <div class="numeric" style="font-size:17px;font-weight:700;margin-bottom:var(--sp-3)">${esc(resultado.email ?? "—")}</div>
      <div class="eyebrow">Senha nova</div>
      <div class="numeric" style="font-size:22px;font-weight:800;letter-spacing:.04em">${esc(resultado.senha ?? "—")}</div>
    </div>

    ${resultado.senha
      ? ""
      : `<div class="alert">No modo local não existe conta de acesso, então não há senha para mostrar.</div>`}
    ${resultado.sessoesEncerradas
      ? `<div class="muted small">Os aparelhos onde ele estava logado foram desconectados.</div>`
      : `<div class="alert" role="alert">A senha foi trocada, mas não foi possível desconectar os aparelhos onde ele já estava logado. Quem estiver dentro continua dentro até sair.</div>`}

    <div class="dialog-actions" style="margin-top:var(--sp-3)">
      <button class="btn" id="copiar-senha">Copiar dados</button>
      <button class="btn btn-primary" data-fechar>Concluir</button>
    </div>`;

  dialogo.showModal();
  conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));

  const copiar = conteudo.querySelector("#copiar-senha");
  copiar.addEventListener("click", async () => {
    const texto = `Leo Personal Trainning\nEmail: ${resultado.email ?? ""}\nSenha: ${resultado.senha ?? ""}`;
    try {
      await navigator.clipboard.writeText(texto);
      copiar.textContent = "Copiado";
    } catch {
      copiar.textContent = "Copie na mão";
    }
  });
}

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

      <div class="field"><label for="e-cobranca">Forma de cobrança</label>
        <select id="e-cobranca" name="billing_type">
          <option value="monthly"${aluno.billing_type !== "package" ? " selected" : ""}>Mensalidade</option>
          <option value="package"${aluno.billing_type === "package" ? " selected" : ""}>Pacote de aulas avulsas</option>
        </select>
        <div class="field-hint">
          No pacote, o aluno compra aulas antes e o saldo cai a cada aula presencial.
          Ele não entra na geração de cobranças do mês.
        </div></div>

      <div class="exercise-form-grid" data-quando="monthly">
        <div class="field"><label for="e-mensalidade">Mensalidade</label>
          <input id="e-mensalidade" name="monthly_fee" type="text" inputmode="numeric"
                 value="${esc(numeroParaMoeda(aluno.monthly_fee))}" placeholder="R$ 0,00" /></div>
        <div class="field"><label for="e-vencimento">Dia do vencimento</label>
          <input id="e-vencimento" name="due_day" type="number" inputmode="numeric" min="1" max="28"
                 value="${esc(aluno.due_day ?? 5)}" /></div>
      </div>

      <div class="field" data-quando="package"><label for="e-valor-aula">Valor da aula</label>
        <input id="e-valor-aula" name="class_fee" type="text" inputmode="numeric"
               value="${esc(numeroParaMoeda(aluno.class_fee))}" placeholder="R$ 0,00" />
        <div class="field-hint">Sugere o total ao vender um pacote. O preço final é digitado na venda.</div></div>

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
  ligarMascaraDeMoeda(conteudo.querySelector("#e-valor-aula"));

  // Mostra só os campos da forma de cobrança escolhida: deixar os dois visíveis
  // convida a preencher mensalidade e valor de aula ao mesmo tempo, e aí não há
  // resposta certa para "quanto esse aluno paga".
  const seletorDeCobranca = conteudo.querySelector("#e-cobranca");
  const alternarCamposDeCobranca = () => {
    conteudo.querySelectorAll("[data-quando]").forEach((el) => {
      el.classList.toggle("hidden", el.dataset.quando !== seletorDeCobranca.value);
    });
  };
  seletorDeCobranca.addEventListener("change", alternarCamposDeCobranca);
  alternarCamposDeCobranca();

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
      billing_type: d.billing_type,
      class_fee: moedaParaNumero(d.class_fee),
      active: form.elements.active.checked,
    };

    // Trocar de forma de cobrança limpa o valor da outra: manter o antigo
    // deixaria uma mensalidade adormecida pronta para virar cobrança no dia em
    // que alguém trocasse o aluno de volta sem olhar o número.
    if (patch.billing_type === "package") patch.monthly_fee = null;
    else patch.class_fee = null;

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
    ["Cobrança", aluno.active ? "Ativa" : "Parada"],
    ["Acesso ao app", aluno.access_blocked ? "Bloqueado" : "Liberado"],
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
      <div class="dialog-actions" style="margin-top:var(--sp-3)">
        <button type="button" class="btn btn-sm" data-cobranca="${aluno.active ? "parar" : "voltar"}">
          ${aluno.active ? "Parar de cobrar" : "Voltar a cobrar"}
        </button>
        <button type="button" class="btn btn-sm" data-acesso="${aluno.access_blocked ? "liberar" : "bloquear"}">
          ${aluno.access_blocked ? "Liberar acesso" : "Bloquear acesso"}
        </button>
        <button type="button" class="btn btn-sm" id="redefinir-senha">Redefinir senha</button>
      </div>
      <div class="muted small" style="margin-top:var(--sp-2)">
        Parar de cobrar tira o aluno da geração de mensalidade e não mexe no
        acesso. Bloquear o acesso impede ele de entrar no app e não cancela
        cobrança nenhuma — o histórico dele continua aqui para você.
        Redefinir a senha gera uma nova para você passar ao aluno e derruba os
        aparelhos onde ele estava logado.
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

// Mesmo banner preto do editor de ficha, e com a mesma arte: aqui o professor
// confere o que o aluno vai ver, então as duas telas têm que mostrar a divisão
// do mesmo jeito. Sem os botões — esta tela é de consulta, quem edita é o
// editor.
function blocoDia(dia) {
  const arte = caminhoDoBanner(dia.banner);
  return `
    <div class="card card-com-banner">
      <div class="dia-banner">
        <div class="dia-banner-texto">
          <h3>${esc(dia.label)}</h3>
          <div class="small">${esc(rotuloDiasSemana(dia.weekdays))} · ${plural(dia.exercicios.length, "exercício", "exercícios")}</div>
        </div>
        ${arte ? `<img class="dia-banner-arte" src="${esc(arte)}" alt="" aria-hidden="true" />` : ""}
      </div>
      <div class="dia-corpo">
        <div class="list">
          ${dia.exercicios.map(linhaExercicio).join("")}
        </div>
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
