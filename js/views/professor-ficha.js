// Editor de ficha — o professor monta o treino do aluno.
//
// A ficha é uma lista fechada: o aluno só recebe o que está aqui, e quem
// escreve é só o professor (garantido pelo RLS, não por esconder o botão).
//
// A "frequência" não é um número digitado à parte. Cada divisão (Treino A, B…)
// marca os dias da semana em que acontece, e as vezes na semana são a contagem
// desses dias. Assim o número nunca diverge do calendário: mudar o dia muda a
// frequência sozinho.

import { db } from "../db.js";
import { registrarErro } from "../log.js";
import {
  esc, plural, formatarData, hoje, somarMeses, DIAS_SEMANA, rotuloDiasSemana,
  isoParaDataBR, dataBRParaIso, ligarMascaraDeData,
} from "../utils.js";

export async function render(alvo, { params }) {
  const [alunoId] = params;
  const aluno = await db.buscarAluno(alunoId);

  if (!aluno) {
    alvo.innerHTML = `<div class="wrap"><div class="empty">Aluno não encontrado.</div></div>`;
    return;
  }

  let biblioteca = await db.listarExercicios();
  let fichas = [];
  let ficha = null;

  alvo.innerHTML = `
    <div class="wrap">
      <a class="muted small" href="#/professor/aluno/${esc(alunoId)}">&larr; ${esc(aluno.full_name)}</a>

      <div class="page-head row-between" style="margin-top:var(--sp-4)">
        <div>
          <div class="eyebrow">Ficha de treino</div>
          <h1 id="titulo">Carregando…</h1>
          <p class="muted page-description" id="subtitulo"></p>
        </div>
        <div class="row" style="gap:var(--sp-2)">
          <select id="seletor" class="hidden" aria-label="Ficha"></select>
          <button class="btn" id="nova">+ Nova ficha</button>
        </div>
      </div>

      <div id="feedback" role="status" class="library-feedback hidden"></div>
      <div id="corpo"><div class="empty">Carregando…</div></div>
    </div>

    <dialog class="exercise-dialog" id="dialogo"><div id="dialogo-conteudo"></div></dialog>`;

  const corpo = alvo.querySelector("#corpo");
  const feedback = alvo.querySelector("#feedback");
  const seletor = alvo.querySelector("#seletor");
  const dialogo = alvo.querySelector("#dialogo");
  const dialogoConteudo = alvo.querySelector("#dialogo-conteudo");

  const avisar = (msg) => {
    feedback.textContent = msg;
    feedback.classList.remove("hidden");
  };

  async function proteger(acao, contexto = null) {
    try {
      await acao();
      return true;
    } catch (err) {
      registrarErro(err, { contexto: { tela: "editor de ficha", alunoId, ...contexto } });
      avisar(err.message);
      return false;
    }
  }

  async function carregar(idPreferido = null) {
    fichas = await db.listarFichas(alunoId);
    const escolhida = idPreferido ?? ficha?.id ?? fichas.find((f) => f.active)?.id ?? fichas[0]?.id;
    ficha = escolhida ? await db.buscarFicha(escolhida) : null;
    desenhar();
  }

  function desenhar() {
    alvo.querySelector("#titulo").textContent = ficha ? ficha.title : "Sem ficha";
    seletor.classList.toggle("hidden", fichas.length < 2);
    seletor.innerHTML = fichas
      .map((f) => `<option value="${esc(f.id)}"${f.id === ficha?.id ? " selected" : ""}>${esc(f.title)}${f.active ? " (ativa)" : ""}</option>`)
      .join("");

    if (!ficha) {
      alvo.querySelector("#subtitulo").textContent = `${aluno.full_name} ainda não tem ficha.`;
      corpo.innerHTML = `<div class="empty">Crie a primeira ficha para começar a prescrever.</div>`;
      return;
    }

    // Cada dia da semana marcado é um treino. Contar os dias distintos evita
    // somar duas vezes quando duas divisões caem na mesma segunda.
    const diasOcupados = new Set(ficha.dias.flatMap((d) => d.weekdays ?? []));
    const totalExercicios = ficha.dias.reduce((t, d) => t + d.exercicios.length, 0);

    alvo.querySelector("#subtitulo").textContent =
      `${formatarData(ficha.start_date)} → ${ficha.end_date ? formatarData(ficha.end_date) : "sem prazo"} · ` +
      `${plural(totalExercicios, "exercício", "exercícios")}`;

    corpo.innerHTML = `
      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="row-between" style="flex-wrap:wrap;gap:var(--sp-3)">
          <div>
            <div class="eyebrow">Frequência da ficha</div>
            <div class="numeric" style="font-size:24px;font-weight:800;letter-spacing:-.03em">
              ${plural(diasOcupados.size, "treino", "treinos")} por semana
            </div>
            <div class="muted small">${meta(diasOcupados.size, aluno.weekly_target)}</div>
          </div>
          <div class="row" style="gap:var(--sp-2)">
            <button class="btn btn-sm" data-editar-ficha>Editar ficha</button>
            ${ficha.active
              ? `<span class="tag tag-solid">Ativa para o aluno</span>`
              : `<button class="btn btn-sm btn-primary" data-ativar>Ativar para o aluno</button>`}
          </div>
        </div>
      </div>

      <div class="stack">
        ${ficha.dias.map(cartaoDoDia).join("") || `<div class="empty">Nenhuma divisão ainda. Crie o Treino A para começar.</div>`}
      </div>

      <button class="btn btn-block" style="margin-top:var(--sp-4)" data-novo-dia>+ Nova divisão (Treino ${proximaLetra()})</button>`;

    ligarEventos();
  }

  // A letra vem do que já existe, não da contagem: dois cliques seguidos em
  // "nova divisão" (antes de a lista recarregar) criavam dois "Treino B".
  function proximaLetra() {
    const usadas = new Set((ficha?.dias ?? []).map((d) => d.label.trim().toUpperCase()));
    for (let i = 0; i < 26; i++) {
      const letra = String.fromCharCode(65 + i);
      if (!usadas.has(`TREINO ${letra}`)) return letra;
    }
    return String(usadas.size + 1);
  }

  function meta(treinos, alvoSemanal) {
    if (!alvoSemanal) return "sem meta semanal definida";
    if (treinos === alvoSemanal) return `bate a meta de ${plural(alvoSemanal, "treino", "treinos")} do aluno`;
    if (treinos < alvoSemanal) return `a meta do aluno é ${plural(alvoSemanal, "treino", "treinos")} por semana`;
    return `acima da meta de ${plural(alvoSemanal, "treino", "treinos")} do aluno`;
  }

  function cartaoDoDia(dia) {
    return `
      <div class="card" data-dia="${esc(dia.id)}">
        <div class="row-between" style="margin-bottom:var(--sp-3);flex-wrap:wrap;gap:var(--sp-2)">
          <div>
            <h3>${esc(dia.label)}</h3>
            <div class="muted small">${esc(rotuloDiasSemana(dia.weekdays))} · ${plural(dia.exercicios.length, "exercício", "exercícios")}</div>
          </div>
          <div class="row" style="gap:var(--sp-2)">
            <button class="btn btn-sm" data-renomear="${esc(dia.id)}">Renomear</button>
            <button class="btn btn-sm" data-remover-dia="${esc(dia.id)}">Excluir</button>
          </div>
        </div>

        <div class="movement-tabs" role="group" aria-label="Dias da semana de ${esc(dia.label)}" style="margin-bottom:var(--sp-3)">
          ${DIAS_SEMANA.map(([n, curto, longo]) => `
            <button class="movement-tab" data-toggle-dia="${esc(dia.id)}" data-valor="${n}"
                    aria-pressed="${(dia.weekdays ?? []).includes(n)}" title="${longo}">${curto}</button>`).join("")}
        </div>

        <div class="list">
          ${dia.exercicios.map(linhaExercicio).join("") || `<div class="empty">Nenhum exercício nesta divisão.</div>`}
        </div>

        <button class="btn btn-block btn-sm" style="margin-top:var(--sp-3)" data-add="${esc(dia.id)}">
          + Adicionar exercício
        </button>
      </div>`;
  }

  function linhaExercicio(item) {
    const nome = item.exercicio?.name ?? "(exercício removido)";
    return `
      <div class="list-item" data-item="${esc(item.id)}">
        <span class="list-item-main">
          <span class="row-between">
            <span class="list-item-title truncate">${esc(nome)}</span>
            <button class="btn btn-sm" data-remover-item="${esc(item.id)}" aria-label="Remover ${esc(nome)}">Remover</button>
          </span>
          <span class="row" style="gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap">
            <label class="field field-inline"><span>Séries</span>
              <input type="number" min="1" max="12" value="${esc(item.sets ?? 3)}" data-campo="sets" /></label>
            <label class="field field-inline"><span>Reps</span>
              <input type="text" maxlength="12" value="${esc(item.reps ?? "")}" data-campo="reps" /></label>
            <label class="field field-inline"><span>Descanso (s)</span>
              <input type="number" min="0" max="600" step="15" value="${esc(item.rest_seconds ?? 60)}" data-campo="rest_seconds" /></label>
            <label class="field field-inline" style="flex:1;min-width:160px"><span>Observação</span>
              <input type="text" maxlength="120" value="${esc(item.trainer_notes ?? "")}" data-campo="trainer_notes" /></label>
          </span>
        </span>
      </div>`;
  }

  /* ---------- eventos ---------- */

  function ligarEventos() {
    corpo.querySelector("[data-ativar]")?.addEventListener("click", async () => {
      if (await proteger(() => db.ativarFicha(ficha.id))) {
        await carregar(ficha.id);
        avisar("Ficha ativada. O aluno já vê esse treino.");
      }
    });

    corpo.querySelector("[data-editar-ficha]")?.addEventListener("click", () => formularioDaFicha(ficha));
    corpo.querySelector("[data-novo-dia]")?.addEventListener("click", async () => {
      const rotulo = `Treino ${proximaLetra()}`;
      // A ordem vem do maior índice existente, não da contagem: divisões
      // criadas em sequência rápida acabavam com o mesmo order_index e a ficha
      // aparecia fora de ordem para o aluno.
      const ordem = ficha.dias.reduce((max, d) => Math.max(max, d.order_index + 1), 0);
      if (await proteger(() => db.criarDia({ fichaId: ficha.id, rotulo, ordem }))) {
        await carregar(ficha.id);
      }
    });

    corpo.querySelectorAll("[data-toggle-dia]").forEach((b) =>
      b.addEventListener("click", async () => {
        const dia = ficha.dias.find((d) => d.id === b.dataset.toggleDia);
        const valor = Number(b.dataset.valor);
        const atuais = new Set((dia.weekdays ?? []).map(Number));
        atuais.has(valor) ? atuais.delete(valor) : atuais.add(valor);
        const novos = [...atuais].sort((a, b2) => a - b2);
        if (await proteger(() => db.atualizarDia(dia.id, { weekdays: novos }))) await carregar(ficha.id);
      })
    );

    corpo.querySelectorAll("[data-remover-dia]").forEach((b) =>
      b.addEventListener("click", async () => {
        const dia = ficha.dias.find((d) => d.id === b.dataset.removerDia);
        if (b.dataset.confirmando !== "1") {
          b.dataset.confirmando = "1";
          b.textContent = `Confirmar exclusão de ${dia.label}`;
          b.classList.add("btn-perigo");
          return;
        }
        if (await proteger(() => db.removerDia(dia.id))) await carregar(ficha.id);
      })
    );

    corpo.querySelectorAll("[data-renomear]").forEach((b) =>
      b.addEventListener("click", () =>
        formularioDeRenomear(ficha.dias.find((d) => d.id === b.dataset.renomear))
      )
    );

    corpo.querySelectorAll("[data-add]").forEach((b) =>
      b.addEventListener("click", () => escolherExercicio(b.dataset.add))
    );

    corpo.querySelectorAll("[data-remover-item]").forEach((b) =>
      b.addEventListener("click", async () => {
        if (await proteger(() => db.removerItemDoDia(b.dataset.removerItem))) await carregar(ficha.id);
      })
    );

    // Salva ao sair do campo, sem redesenhar: redesenhar a cada tecla tiraria o
    // foco do professor no meio da digitação.
    corpo.querySelectorAll("[data-campo]").forEach((input) =>
      input.addEventListener("change", async () => {
        const id = input.closest("[data-item]").dataset.item;
        const campo = input.dataset.campo;
        const valor = input.type === "number"
          ? (input.value === "" ? null : Number(input.value))
          : (input.value.trim() || null);
        if (await proteger(() => db.atualizarItemDoDia(id, { [campo]: valor }))) avisar("Alteração salva.");
      })
    );
  }

  seletor.addEventListener("change", () => carregar(seletor.value));
  alvo.querySelector("#nova").addEventListener("click", () => formularioDaFicha(null));

  /* ---------- diálogos ---------- */

  const fechar = () => dialogo.close();

  function formularioDaFicha(existente) {
    // Três meses: é o ciclo que o Leo usa para renovar ficha.
    const padraoFim = somarMeses(hoje(), 3);
    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">${existente ? "Editar ficha" : "Nova ficha"}</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>${existente ? esc(existente.title) : `Ficha de ${esc(aluno.full_name)}`}</h2>
      <form id="form-ficha">
        <div class="field"><label for="ff-titulo">Título</label>
          <input id="ff-titulo" name="title" required maxlength="80"
                 value="${esc(existente?.title ?? "Treino ABC")}" /></div>
        <div class="field"><label for="ff-desc">Descrição</label>
          <textarea id="ff-desc" name="description" rows="2" maxlength="300">${esc(existente?.description ?? "")}</textarea></div>
        <div class="exercise-form-grid">
          <div class="field"><label for="ff-inicio">Início</label>
            <input id="ff-inicio" name="start_date" type="text" inputmode="numeric" maxlength="10"
                   placeholder="dd/mm/aaaa" value="${esc(isoParaDataBR(existente?.start_date ?? hoje()))}" /></div>
          <div class="field"><label for="ff-fim">Fim</label>
            <input id="ff-fim" name="end_date" type="text" inputmode="numeric" maxlength="10"
                   placeholder="dd/mm/aaaa" value="${esc(isoParaDataBR(existente?.end_date ?? padraoFim))}" />
            <div class="field-hint">Padrão: 3 meses. Deixe em branco para ficha sem prazo.</div></div>
        </div>
        <div class="field"><label for="ff-meta">Treinos por semana</label>
          <input id="ff-meta" name="weekly_target" type="number" inputmode="numeric" min="1" max="14"
                 value="${esc(existente?.weekly_target ?? aluno.weekly_target ?? 3)}" />
          <div class="field-hint">Meta de frequência desta ficha.</div></div>
        <div data-erro class="alert hidden" role="alert"></div>
        <div class="dialog-actions">
          ${existente ? `<button type="button" class="btn" id="excluir">Excluir ficha</button>` : ""}
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`;

    dialogo.showModal();
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
    ligarMascaraDeData(dialogoConteudo.querySelector("#ff-inicio"));
    ligarMascaraDeData(dialogoConteudo.querySelector("#ff-fim"));

    const form = dialogoConteudo.querySelector("#form-ficha");
    const erro = dialogoConteudo.querySelector("[data-erro]");

    dialogoConteudo.querySelector("#excluir")?.addEventListener("click", async () => {
      const botao = dialogoConteudo.querySelector("#excluir");
      if (botao.dataset.confirmando !== "1") {
        botao.dataset.confirmando = "1";
        botao.textContent = "Confirmar exclusão da ficha";
        botao.classList.add("btn-perigo");
        return;
      }
      if (await proteger(() => db.removerFicha(existente.id))) {
        ficha = null;
        fechar();
        await carregar();
      }
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      erro.classList.add("hidden");
      const dados = Object.fromEntries(new FormData(form));
      const mostrarErro = (msg) => {
        erro.textContent = msg;
        erro.classList.remove("hidden");
      };

      const inicio = dados.start_date.trim() ? dataBRParaIso(dados.start_date) : hoje();
      const fim = dados.end_date.trim() ? dataBRParaIso(dados.end_date) : null;

      if (!inicio) return mostrarErro("Data de início inválida. Use dd/mm/aaaa.");
      if (dados.end_date.trim() && !fim) return mostrarErro("Data de fim inválida. Use dd/mm/aaaa.");
      // Uma ficha que termina antes de começar nunca aparece como ativa para o
      // aluno, e o professor não descobre por quê.
      if (fim && fim < inicio) return mostrarErro("O fim não pode ser antes do início.");

      const patch = {
        title: dados.title.trim(),
        description: dados.description.trim() || null,
        start_date: inicio,
        end_date: fim,
        weekly_target: Number(dados.weekly_target) || null,
      };
      try {
        if (existente) {
          await db.atualizarFicha(existente.id, patch);
          fechar();
          await carregar(existente.id);
        } else {
          const nova = await db.criarFicha({
            alunoId, titulo: patch.title, descricao: patch.description,
            inicio: patch.start_date, fim: patch.end_date,
            metaSemanal: patch.weekly_target,
          });
          fechar();
          await carregar(nova.id);
          avisar("Ficha criada. Adicione as divisões e ative para o aluno.");
        }
      } catch (err) {
        erro.textContent = err.message;
        erro.classList.remove("hidden");
      }
    });
  }

  // Renomear era um `prompt()` do navegador, e prompt() é uma caixa que o
  // navegador pode simplesmente engolir: some depois de "impedir que esta
  // página crie novas caixas de diálogo", e no app instalado na tela inicial
  // nem chega a aparecer. O clique não fazia nada e não havia erro nenhum para
  // investigar. Agora é o mesmo <dialog> do resto da tela.
  function formularioDeRenomear(dia) {
    if (!dia) return;
    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Divisão</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>Renomear ${esc(dia.label)}</h2>
      <form id="form-renomear">
        <div class="field"><label for="r-nome">Nome da divisão</label>
          <input id="r-nome" name="label" required maxlength="40" value="${esc(dia.label)}"
                 placeholder="Treino A" />
          <div class="field-hint">Ex.: “Treino A”, “Peito e tríceps”, “Superiores”.</div></div>
        <div data-erro class="alert hidden" role="alert"></div>
        <div class="dialog-actions">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>`;

    dialogo.showModal();
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));

    const campo = dialogoConteudo.querySelector("#r-nome");
    campo.focus();
    campo.select();

    const erro = dialogoConteudo.querySelector("[data-erro]");
    const formulario = dialogoConteudo.querySelector("#form-renomear");

    // Enter salva. Dentro de <dialog> o envio implícito do formulário nem
    // sempre acontece, e o professor fica apertando Enter sem nada mudar.
    campo.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      formulario.requestSubmit();
    });

    formulario.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const novo = campo.value.trim();
      if (!novo) {
        erro.textContent = "O nome não pode ficar vazio.";
        erro.classList.remove("hidden");
        return;
      }
      try {
        await db.atualizarDia(dia.id, { label: novo });
        fechar();
        await carregar(ficha.id);
        avisar("Divisão renomeada.");
      } catch (err) {
        registrarErro(err, { contexto: { tela: "editor de ficha", acao: "renomearDivisao", diaId: dia.id } });
        erro.textContent = err.message;
        erro.classList.remove("hidden");
      }
    });
  }

  // Catálogo fechado: o professor escolhe dentro da biblioteca. Não há campo de
  // texto livre de propósito — exercício digitado à mão não tem vídeo, nem
  // how-to, nem histórico de carga comparável.
  function escolherExercicio(diaId) {
    const dia = ficha.dias.find((d) => d.id === diaId);
    const jaNoDia = new Set(dia.exercicios.map((e) => e.exercise_id));
    const grupos = [...new Set(biblioteca.map((e) => e.muscle_group).filter(Boolean))].sort();
    let grupo = "todos";
    let termo = "";

    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">${esc(dia.label)}</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>Adicionar exercício</h2>
      <label class="field"><span>Buscar</span>
        <input type="search" id="busca-ex" placeholder="Nome do exercício" /></label>
      <div class="movement-tabs" id="grupos" role="group" aria-label="Grupo muscular">
        <button class="movement-tab" data-grupo="todos" aria-pressed="true">Todos</button>
        ${grupos.map((g) => `<button class="movement-tab" data-grupo="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join("")}
      </div>
      <div class="list" id="resultado" style="max-height:46vh;overflow:auto"></div>
      <div class="dialog-actions"><button type="button" class="btn" data-fechar>Fechar</button></div>`;

    dialogo.showModal();
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));

    const resultado = dialogoConteudo.querySelector("#resultado");

    function desenharResultado() {
      const visiveis = biblioteca.filter(
        (e) => (grupo === "todos" || e.muscle_group === grupo) &&
               (!termo || e.name.toLowerCase().includes(termo))
      );
      resultado.innerHTML = visiveis.length
        ? visiveis.map((e) => `
            <div class="list-item">
              <span class="list-item-main">
                <span class="list-item-title truncate">${esc(e.name)}</span>
                <span class="muted small">${esc(e.muscle_group ?? "—")}${e.equipment ? ` · ${esc(e.equipment)}` : ""}</span>
              </span>
              ${jaNoDia.has(e.id)
                ? `<span class="tag tag-quiet">já está</span>`
                : `<button class="btn btn-sm" data-escolher="${esc(e.id)}">Adicionar</button>`}
            </div>`).join("")
        : `<div class="empty">Nenhum exercício encontrado.</div>`;

      resultado.querySelectorAll("[data-escolher]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          const feito = await proteger(() =>
            db.adicionarExercicioNoDia({ diaId, exercicioId: b.dataset.escolher })
          );
          if (!feito) { b.disabled = false; return; }
          jaNoDia.add(b.dataset.escolher);
          desenharResultado();
          await carregar(ficha.id);
        })
      );
    }

    dialogoConteudo.querySelector("#busca-ex").addEventListener("input", (ev) => {
      termo = ev.target.value.toLowerCase().trim();
      desenharResultado();
    });
    dialogoConteudo.querySelector("#grupos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-grupo]");
      if (!b) return;
      grupo = b.dataset.grupo;
      dialogoConteudo.querySelectorAll("[data-grupo]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.grupo === grupo))
      );
      desenharResultado();
    });

    desenharResultado();
  }

  await carregar();
}
