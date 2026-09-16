// Editor de ficha — o professor monta o treino do aluno.
//
// A ficha é uma lista fechada: o aluno só recebe o que está aqui, e quem
// escreve é só o professor (garantido pelo RLS, não por esconder o botão).
//
// Cuidado com "frequência semanal": são três números diferentes, e o app já os
// confundiu entre si. A **agenda** é a contagem dos dias marcados nas divisões
// desta ficha, e muda sozinha quando o professor marca outro dia. A **meta** é
// o combinado com o aluno, digitada em "Editar ficha", e é contra ela que a
// tela de Frequência mede. Os **dias treinados** são o que o aluno fez. A
// explicação de por que os três continuam separados está em `textoDaAgenda`.

import { db } from "../db.js";
import { registrarErro } from "../log.js";
import { BANNERS, caminhoDoBanner, rotuloDoBanner } from "../catalogo-banners.js";
import {
  esc, plural, formatarData, hoje, somarMeses, DIAS_SEMANA, rotuloDiasSemana,
  isoParaDataBR, dataBRParaIso, ligarMascaraDeData, metaEfetiva,
} from "../utils.js";

// As restrições ficam no perfil do aluno, e o perfil é outra tela. Quem está
// escolhendo exercício está aqui, e ninguém volta para conferir lesão antes de
// cada item — é assim que um agachamento entra na ficha de quem tem problema no
// joelho. A informação precisa estar onde a decisão acontece.
//
// Fica acima do corpo e fora do `#corpo` de propósito: trocar de ficha no
// seletor redesenha o corpo, e o aviso não pode desaparecer nesse caminho.
function blocoRestricoes(aluno) {
  if (!aluno.health_restrictions) return "";
  return `
    <div class="alert" style="margin-bottom:var(--sp-4)">
      <div class="eyebrow">Restrições e lesões de ${esc(aluno.full_name.split(/\s+/)[0])}</div>
      <p style="margin:var(--sp-2) 0 0">${esc(aluno.health_restrictions)}</p>
    </div>`;
}

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
      ${blocoRestricoes(aluno)}
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

  // Uma escrita por vez, e o botão que a disparou sai do ar enquanto ela corre.
  //
  // Dois toques em "+ Nova divisão" antes de a lista recarregar criavam duas
  // divisões. A letra já vinha certa (ver `proximaLetra`), então o professor
  // ganhava um "Treino B" e um "Treino C" quando queria um — e precisava
  // excluir um dos dois. O dedo no celular repete o toque quando a tela demora.
  //
  // Só vale para botões. O salvamento dos campos fica de fora de propósito:
  // recusar a segunda escrita ali perderia uma alteração do professor que
  // digitou rápido, em vez de evitar uma duplicada.
  let escrevendo = false;
  function aoClicar(botao, acao) {
    botao?.addEventListener("click", async () => {
      if (escrevendo) return;
      escrevendo = true;
      botao.disabled = true;
      try {
        await acao();
      } finally {
        escrevendo = false;
        botao.disabled = false;
      }
    });
  }

  // A versão descarta resposta atrasada: duas cargas em sequência podiam
  // terminar fora de ordem e a tela ficava com a ficha antiga. `fichas` e
  // `ficha` só passam a valer depois das duas consultas, nunca no meio.
  let versaoDaCarga = 0;
  async function carregar(idPreferido = null) {
    const minhaVersao = ++versaoDaCarga;
    const listadas = await db.listarFichas(alunoId);
    const escolhida = idPreferido ?? ficha?.id ?? listadas.find((f) => f.active)?.id ?? listadas[0]?.id;
    const buscada = escolhida ? await db.buscarFicha(escolhida) : null;
    if (minhaVersao !== versaoDaCarga || !alvo.isConnected) return;
    fichas = listadas;
    ficha = buscada;
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
            <div class="eyebrow">Agenda desta ficha</div>
            <div class="numeric" style="font-size:24px;font-weight:800;letter-spacing:-.03em">
              ${plural(diasOcupados.size, "dia marcado", "dias marcados")}
            </div>
            <div class="muted small">${textoDaAgenda(diasOcupados.size, metaEfetiva(ficha))}</div>
          </div>
          <div class="row" style="gap:var(--sp-2);flex-wrap:wrap">
            <button class="btn btn-sm" data-editar-ficha>Editar ficha</button>
            <button class="btn btn-sm" data-duplicar>Duplicar</button>
            <button class="btn btn-sm" data-salvar-template>Salvar como modelo</button>
            ${ficha.active
              ? `<span class="tag tag-solid">Ativa para o aluno</span>`
              : `<button class="btn btn-sm btn-primary" data-ativar>Ativar para o aluno</button>`}
          </div>
        </div>
      </div>

      <div class="stack">
        ${ficha.dias
          .map((dia, i) => cartaoDoDia(dia, i, ficha.dias.length))
          .join("") || `<div class="empty">Nenhuma divisão ainda. Crie o Treino A para começar.</div>`}
      </div>

      <button class="btn btn-block" style="margin-top:var(--sp-4)" data-novo-dia>+ Nova divisão (Treino ${proximaLetra()})</button>`;

    ligarEventos();
  }

  // A letra vem do que já existe, não da contagem: dois cliques seguidos em
  // "nova divisão" (antes de a lista recarregar) criavam dois "Treino B".
  //
  // A comparação é pela letra extraída do rótulo, não pelo rótulo inteiro.
  // Comparar o texto todo parecia resolver e não resolvia: o professor renomeia
  // para "Treino A — Peito e Tríceps", nenhum rótulo casava com "TREINO A", e o
  // botão voltava a oferecer "Treino A" mesmo com A, B e C na ficha. Rótulo sem
  // letra nenhuma ("Superior") não entra na conta, e é o certo — ele não ocupa
  // letra.
  function proximaLetra() {
    const usadas = new Set(
      (ficha?.dias ?? [])
        .map((d) => /^treino\s+([a-z])\b/i.exec(d.label.trim())?.[1]?.toUpperCase())
        .filter(Boolean)
    );
    for (let i = 0; i < 26; i++) {
      const letra = String.fromCharCode(65 + i);
      if (!usadas.has(letra)) return letra;
    }
    return String((ficha?.dias?.length ?? 0) + 1);
  }

  // AT-12. Três números de frequência vivem perto um do outro e vinham sendo
  // lidos como se fossem o mesmo:
  //
  //   AGENDA  — dias da semana marcados nas divisões desta ficha. É o plano.
  //   META    — o combinado com o aluno (`metaEfetiva`, hoje só a da ficha).
  //             É o alvo.
  //   FEITOS  — dias em que ele realmente treinou, na tela de Frequência.
  //
  // Os dois primeiros aparecem aqui, e agora com nomes que os separam: antes o
  // cartão dizia "N treinos por semana" para a agenda e o campo do diálogo se
  // chamava "Treinos por semana" para a meta — mesmo nome, coisas diferentes,
  // na mesma tela.
  //
  // Em 16/09 o dono decidiu que a meta é da ficha, e `metaEfetiva` deixou de
  // olhar o cadastro. Ficha sem meta agora é ficha sem meta: o texto abaixo
  // pede para definir em vez de exibir o 3 padrão do cadastro como se fosse
  // combinado. Ver a explicação inteira em `utils.js`.
  function textoDaAgenda(diasMarcados, metaDaFicha) {
    if (!metaDaFicha) return "nenhuma meta combinada — defina em “Editar ficha”";
    const alvo = `${plural(metaDaFicha, "treino", "treinos")} por semana`;
    if (!diasMarcados) return `meta de ${alvo}. Marque os dias em cada divisão abaixo.`;
    if (diasMarcados === metaDaFicha) return `bate a meta de ${alvo}`;
    if (diasMarcados < metaDaFicha) return `abaixo da meta de ${alvo}`;
    return `acima da meta de ${alvo}`;
  }

  function cartaoDoDia(dia, posicao, total) {
    const arte = caminhoDoBanner(dia.banner);
    return `
      <div class="card card-com-banner" data-dia="${esc(dia.id)}">
        <div class="dia-banner">
          <div class="dia-banner-texto">
            <h3>${esc(dia.label)}</h3>
            <div class="small">${esc(rotuloDiasSemana(dia.weekdays))} · ${plural(dia.exercicios.length, "exercício", "exercícios")}</div>
          </div>
          ${arte ? `<img class="dia-banner-arte" src="${esc(arte)}" alt="" aria-hidden="true" />` : ""}
          <div class="row dia-banner-acoes" style="gap:var(--sp-2)">
            ${botoesDeMover("mover-dia", dia.id, posicao, total, dia.label)}
            <button class="btn btn-sm" data-arte="${esc(dia.id)}">Arte</button>
            <button class="btn btn-sm" data-renomear="${esc(dia.id)}">Renomear</button>
            <button class="btn btn-sm" data-remover-dia="${esc(dia.id)}">Excluir</button>
          </div>
        </div>

        <div class="dia-corpo">
          <div class="movement-tabs" role="group" aria-label="Dias da semana de ${esc(dia.label)}" style="margin-bottom:var(--sp-3)">
            ${DIAS_SEMANA.map(([n, curto, longo]) => `
              <button class="movement-tab" data-toggle-dia="${esc(dia.id)}" data-valor="${n}"
                      aria-pressed="${(dia.weekdays ?? []).includes(n)}" title="${longo}">${curto}</button>`).join("")}
          </div>

          <div class="list">
            ${dia.exercicios
              .map((item, i) => linhaExercicio(item, i, dia.exercicios.length))
              .join("") || `<div class="empty">Nenhum exercício nesta divisão.</div>`}
          </div>

          <button class="btn btn-block btn-sm" style="margin-top:var(--sp-3)" data-add="${esc(dia.id)}">
            + Adicionar exercício
          </button>
        </div>
      </div>`;
  }

  // Setas, não arrastar. A ordem do treino importa (aquecimento antes de carga
  // máxima), e o professor mexe nisso no celular, com uma mão, às vezes de pé
  // ao lado do aluno. Arrastar não funciona por teclado nem com leitor de tela,
  // e no toque briga com a rolagem da página.
  function botoesDeMover(acao, id, posicao, total, oQue) {
    return `
      <button class="btn btn-sm btn-mover" data-${acao}="${esc(id)}" data-direcao="-1"
              ${posicao === 0 ? "disabled" : ""}
              aria-label="Mover ${esc(oQue)} para cima">↑</button>
      <button class="btn btn-sm btn-mover" data-${acao}="${esc(id)}" data-direcao="1"
              ${posicao === total - 1 ? "disabled" : ""}
              aria-label="Mover ${esc(oQue)} para baixo">↓</button>`;
  }

  function linhaExercicio(item, posicao, total) {
    const nome = item.exercicio?.name ?? "(exercício removido)";
    return `
      <div class="list-item" data-item="${esc(item.id)}">
        <span class="list-item-main">
          <span class="row-between">
            <span class="list-item-title truncate">${esc(nome)}</span>
            <span class="row" style="gap:var(--sp-2)">
              ${botoesDeMover("mover-item", item.id, posicao, total, nome)}
              <button class="btn btn-sm" data-remover-item="${esc(item.id)}" aria-label="Remover ${esc(nome)}">Remover</button>
            </span>
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
          <span class="row" style="gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap">
            <label class="field field-inline" style="flex:1;min-width:180px"><span>Carga sugerida</span>
              <input type="text" maxlength="80" placeholder="Ex.: 20 kg ou moderada"
                     value="${esc(item.load_notes ?? "")}" data-campo="load_notes" /></label>
            <label class="field field-inline" style="min-width:130px"><span>Grupo</span>
              <input type="text" maxlength="12" placeholder="Ex.: A1"
                     value="${esc(item.group_label ?? "")}" data-campo="group_label" data-maiusculo /></label>
          </span>
        </span>
      </div>`;
  }

  /* ---------- eventos ---------- */

  function ligarEventos() {
    aoClicar(corpo.querySelector("[data-ativar]"), async () => {
      if (await proteger(() => db.ativarFicha(ficha.id))) {
        await carregar(ficha.id);
        avisar("Ficha ativada. O aluno já vê esse treino.");
      }
    });

    // Abrir o formulário virou operação assíncrona (busca os modelos), então
    // passa pelo `proteger`: falha ao listar não pode sumir como rejeição solta.
    corpo.querySelector("[data-editar-ficha]")?.addEventListener("click", () =>
      proteger(() => formularioDaFicha(ficha), { acao: "abrirFormularioDaFicha" })
    );

    // Duplicar é o atalho do ciclo novo: o professor renova a ficha a cada três
    // meses mudando carga e alguns exercícios, não começando do zero. A cópia
    // nasce inativa, então o aluno continua vendo a ficha antiga até o professor
    // decidir trocar.
    aoClicar(corpo.querySelector("[data-duplicar]"), async () => {
      let copia = null;
      const feito = await proteger(
        async () => { copia = await db.duplicarFicha(ficha.id); },
        { acao: "duplicarFicha" }
      );
      if (!feito) return;
      await carregar(copia?.id ?? null);
      avisar("Ficha duplicada. A cópia está inativa — ative quando o ciclo virar.");
    });

    // Modelo é a mesma prescrição sem aluno nenhum, para servir de ponto de
    // partida em qualquer um. O banco exige esse par: modelo não tem aluno.
    aoClicar(corpo.querySelector("[data-salvar-template]"), async () => {
      const ok = await proteger(
        () => db.duplicarFicha(ficha.id, { comoTemplate: true, titulo: ficha.title }),
        { acao: "salvarComoTemplate" }
      );
      if (ok) avisar(`"${ficha.title}" virou modelo. Ele aparece ao criar ficha para qualquer aluno.`);
    });

    corpo.querySelectorAll("[data-mover-dia]").forEach((b) =>
      aoClicar(b, async () => {
        const feito = await proteger(
          () => db.moverDia(b.dataset.moverDia, Number(b.dataset.direcao)),
          { acao: "moverDia" }
        );
        if (feito) await carregar(ficha.id);
      })
    );

    corpo.querySelectorAll("[data-mover-item]").forEach((b) =>
      aoClicar(b, async () => {
        const feito = await proteger(
          () => db.moverItemDoDia(b.dataset.moverItem, Number(b.dataset.direcao)),
          { acao: "moverItemDoDia" }
        );
        if (feito) await carregar(ficha.id);
      })
    );
    aoClicar(corpo.querySelector("[data-novo-dia]"), async () => {
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
      aoClicar(b, async () => {
        const dia = ficha.dias.find((d) => d.id === b.dataset.toggleDia);
        const valor = Number(b.dataset.valor);
        const atuais = new Set((dia.weekdays ?? []).map(Number));
        atuais.has(valor) ? atuais.delete(valor) : atuais.add(valor);
        const novos = [...atuais].sort((a, b2) => a - b2);
        if (await proteger(() => db.atualizarDia(dia.id, { weekdays: novos }))) await carregar(ficha.id);
      })
    );

    corpo.querySelectorAll("[data-remover-dia]").forEach((b) =>
      aoClicar(b, async () => {
        const dia = ficha.dias.find((d) => d.id === b.dataset.removerDia);
        if (!confirm(
          `Excluir ${dia.label} e seus exercícios?\n\n` +
          "Se o aluno já treinou esta divisão, ela é arquivada em vez de excluída: " +
          "sai da ficha, e o histórico dele continua mostrando o que foi feito."
        )) return;
        let resultado = null;
        if (await proteger(async () => { resultado = await db.removerDia(dia.id); })) {
          avisar(resultado?.arquivado
            ? `${dia.label} foi arquivada porque já tem treino registrado. Ela sai da ficha e continua no histórico do aluno.`
            : `${dia.label} foi excluída.`);
          await carregar(ficha.id);
        }
      })
    );

    corpo.querySelectorAll("[data-renomear]").forEach((b) =>
      b.addEventListener("click", () =>
        formularioDeRenomear(ficha.dias.find((d) => d.id === b.dataset.renomear))
      )
    );

    corpo.querySelectorAll("[data-arte]").forEach((b) =>
      b.addEventListener("click", () =>
        escolherArte(ficha.dias.find((d) => d.id === b.dataset.arte))
      )
    );

    corpo.querySelectorAll("[data-add]").forEach((b) =>
      b.addEventListener("click", () => escolherExercicio(b.dataset.add))
    );

    corpo.querySelectorAll("[data-remover-item]").forEach((b) =>
      aoClicar(b, async () => {
        let resultado = null;
        if (await proteger(async () => { resultado = await db.removerItemDoDia(b.dataset.removerItem); })) {
          if (resultado?.arquivado) {
            avisar("Exercício arquivado porque o aluno já registrou carga nele. Ele sai da ficha e continua no histórico.");
          }
          await carregar(ficha.id);
        }
      })
    );

    // Salva ao sair do campo, sem redesenhar: redesenhar a cada tecla tiraria o
    // foco do professor no meio da digitação.
    corpo.querySelectorAll("[data-campo]").forEach((input) =>
      input.addEventListener("change", async () => {
        const id = input.closest("[data-item]").dataset.item;
        const campo = input.dataset.campo;
        let valor = input.type === "number"
          ? (input.value === "" ? null : Number(input.value))
          : (input.value.trim() || null);
        if (input.hasAttribute("data-maiusculo") && valor) {
          valor = valor.toUpperCase().replace(/\s+/g, "");
          input.value = valor;
        }
        if (await proteger(() => db.atualizarItemDoDia(id, { [campo]: valor }))) avisar("Alteração salva.");
      })
    );
  }

  seletor.addEventListener("change", () => carregar(seletor.value));
  alvo.querySelector("#nova").addEventListener("click", () =>
    proteger(() => formularioDaFicha(null), { acao: "abrirFormularioDaFicha" })
  );

  /* ---------- diálogos ---------- */

  const fechar = () => dialogo.close();

  async function formularioDaFicha(existente) {
    // Três meses: é o ciclo que o Leo usa para renovar ficha.
    const padraoFim = somarMeses(hoje(), 3);

    // Partir de algo que já existe é o caso comum: o professor tem um ABC que
    // funciona e ajusta por aluno. Só na criação — editar uma ficha existente
    // não pode trocar o conteúdo dela por outro sem aviso.
    //
    // Os modelos não têm aluno, então não aparecem em `listarFichas`; são
    // buscados aqui, e não na carga da tela, para o modelo que o professor
    // acabou de salvar já estar na lista sem recarregar.
    const origens = existente
      ? []
      : [
          ...fichas.map((f) => ({ id: f.id, rotulo: `${f.title}${f.active ? " (ativa)" : ""}` })),
          ...(await db.listarTemplates()).map((t) => ({ id: t.id, rotulo: `Modelo: ${t.title}` })),
        ];

    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">${existente ? "Editar ficha" : "Nova ficha"}</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>${existente ? esc(existente.title) : `Ficha de ${esc(aluno.full_name)}`}</h2>
      <form id="form-ficha">
        ${origens.length ? `
          <div class="field"><label for="ff-origem">Começar de</label>
            <select id="ff-origem" name="origem">
              <option value="">Ficha em branco</option>
              ${origens.map((o) => `<option value="${esc(o.id)}">${esc(o.rotulo)}</option>`).join("")}
            </select>
            <div class="field-hint">
              Copia divisões, exercícios e séries prescritas. Não copia carga
              registrada nem presença do aluno.
            </div></div>` : ""}
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
        <div class="field"><label for="ff-meta">Meta de treinos por semana</label>
          <input id="ff-meta" name="weekly_target" type="number" inputmode="numeric" min="1" max="14"
                 value="${esc(existente?.weekly_target ?? fichas.find((f) => f.active)?.weekly_target ?? "")}" />
          <div class="field-hint">
            O combinado com o aluno, e é contra isso que a Frequência dele é
            medida. Não é o mesmo que a agenda: os dias de cada divisão você
            marca nos cartões, e eles podem não fechar com esta meta.
            Em branco, o aluno vê “sem meta” — que é melhor do que um número
            que ninguém combinou.
          </div></div>
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
      if (!confirm("Excluir a ficha inteira, com divisões e exercícios?")) return;
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
        } else if (dados.origem) {
          // Duplicar já grava título e aluno; as datas e a meta digitadas aqui
          // vão depois, porque a cópia nasce começando hoje e sem prazo.
          const nova = await db.duplicarFicha(dados.origem, { alunoId, titulo: patch.title });
          await db.atualizarFicha(nova.id, patch);
          fechar();
          await carregar(nova.id);
          avisar("Ficha criada a partir da cópia, e inativa. Revise as cargas antes de ativar.");
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
  // A arte é escolhida num grid sobre fundo preto, que é como ela vai aparecer.
  // Mostrar as opções sobre o branco do diálogo enganaria: o contorno branco da
  // figura some no claro e o professor escolheria no escuro do que vai ver.
  function escolherArte(dia) {
    if (!dia) return;
    const opcao = ({ slug, rotulo }) => `
      <button type="button" class="arte-opcao${dia.banner === slug ? " arte-opcao-ativa" : ""}"
              data-escolher="${esc(slug)}" aria-pressed="${dia.banner === slug}">
        <img src="${esc(caminhoDoBanner(slug))}" alt="" />
        <span>${esc(rotulo)}</span>
      </button>`;

    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Divisão</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>Arte de ${esc(dia.label)}</h2>
      <p class="muted small">Aparece no cabeçalho da divisão.</p>
      <div class="arte-grade">${BANNERS.map(opcao).join("")}</div>
      <div data-erro class="alert hidden" role="alert"></div>
      <div class="dialog-actions">
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="button" class="btn" data-escolher="" ${dia.banner ? "" : "disabled"}>Sem arte</button>
      </div>`;

    dialogo.showModal();
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));

    const erro = dialogoConteudo.querySelector("[data-erro]");
    dialogoConteudo.querySelectorAll("[data-escolher]").forEach((b) =>
      b.addEventListener("click", async () => {
        const escolhido = b.dataset.escolher || null;
        dialogoConteudo.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try {
          await db.atualizarDia(dia.id, { banner: escolhido });
          fechar();
          await carregar(ficha.id);
          avisar(escolhido ? `Arte “${rotuloDoBanner(escolhido)}” aplicada.` : "Arte removida.");
        } catch (err) {
          registrarErro(err, { contexto: { tela: "ficha", acao: "escolherArte", diaId: dia.id } });
          erro.textContent = err.message;
          erro.classList.remove("hidden");
          dialogoConteudo.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        }
      })
    );
  }

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
