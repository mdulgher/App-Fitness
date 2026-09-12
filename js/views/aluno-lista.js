// Minha lista — os exercícios que o próprio aluno separou.
//
// Vive ao lado da ficha do professor, nunca dentro dela: o que o aluno guarda
// aqui não altera a prescrição, e o professor não escreve nesta lista (o banco
// impede). Os exercícios continuam vindo da biblioteca, então tudo que entra
// aqui tem vídeo, execução e histórico de carga como qualquer outro.

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import { esc, plural } from "../utils.js";

export async function render(alvo) {
  const alunoId = usuarioAtual().id;
  let itens = [];
  let biblioteca = [];

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Só seu</div>
          <h1>Minha lista</h1>
          <p class="muted page-description">Exercícios que você separou por conta. Sua ficha continua sendo a do professor.</p>
        </div>
        <button class="btn btn-primary" id="adicionar">+ Adicionar</button>
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
    feedback.textContent = msg;
    feedback.classList.remove("hidden");
  };

  async function carregar() {
    try {
      [itens, biblioteca] = await Promise.all([
        db.listarListaPessoal(alunoId),
        biblioteca.length ? biblioteca : db.listarExercicios(),
      ]);
      desenhar();
    } catch (err) {
      lista.innerHTML = `<div class="empty"><p>Não foi possível carregar sua lista.</p><p class="small">${esc(err.message)}</p></div>`;
    }
  }

  function desenhar() {
    lista.innerHTML = itens.length
      ? itens.map(linha).join("")
      : `<div class="empty">Sua lista está vazia. Use “Adicionar” para guardar um exercício que você gosta de fazer.</div>`;

    lista.querySelectorAll("[data-remover]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await db.removerDaListaPessoal(b.dataset.remover);
          await carregar();
          avisar("Removido da sua lista.");
        } catch (err) { avisar(err.message); }
      })
    );

    lista.querySelectorAll("[data-nota]").forEach((input) =>
      input.addEventListener("change", async () => {
        try {
          await db.atualizarItemDaListaPessoal(input.dataset.nota, { notes: input.value.trim() || null });
          avisar("Anotação salva.");
        } catch (err) { avisar(err.message); }
      })
    );
  }

  function linha(item) {
    const ex = item.exercicio;
    return `
      <div class="list-item">
        <span class="list-item-main">
          <span class="row-between">
            <span class="list-item-title truncate">${esc(ex?.name ?? "(exercício removido)")}</span>
            <button class="btn btn-sm" data-remover="${esc(item.id)}">Remover</button>
          </span>
          <span class="muted small">${esc(ex?.muscle_group ?? "—")}${ex?.equipment ? ` · ${esc(ex.equipment)}` : ""}</span>
          <label class="field field-inline" style="margin-top:var(--sp-2);width:100%">
            <span>Sua anotação</span>
            <input type="text" maxlength="160" data-nota="${esc(item.id)}"
                   value="${esc(item.notes ?? "")}" placeholder="Ex.: fazer no fim do treino de peito" />
          </label>
        </span>
      </div>`;
  }

  alvo.querySelector("#adicionar").addEventListener("click", () => {
    const jaTenho = new Set(itens.map((i) => i.exercise_id));
    const grupos = [...new Set(biblioteca.map((e) => e.muscle_group).filter(Boolean))].sort();
    let grupo = "todos";
    let termo = "";

    conteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Biblioteca do professor</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>Adicionar à minha lista</h2>
      <p class="muted small">${plural(biblioteca.length, "exercício disponível", "exercícios disponíveis")}.</p>
      <label class="field"><span>Buscar</span>
        <input type="search" id="busca" placeholder="Nome do exercício" /></label>
      <div class="movement-tabs" id="grupos" role="group" aria-label="Grupo muscular">
        <button class="movement-tab" data-grupo="todos" aria-pressed="true">Todos</button>
        ${grupos.map((g) => `<button class="movement-tab" data-grupo="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join("")}
      </div>
      <div class="list" id="resultado" style="max-height:46vh;overflow:auto"></div>
      <div class="dialog-actions"><button type="button" class="btn" data-fechar>Fechar</button></div>`;

    dialogo.showModal();
    conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => dialogo.close()));

    const resultado = conteudo.querySelector("#resultado");

    function desenharResultado() {
      const visiveis = biblioteca.filter(
        (e) => (grupo === "todos" || e.muscle_group === grupo) && (!termo || e.name.toLowerCase().includes(termo))
      );
      resultado.innerHTML = visiveis.length
        ? visiveis.map((e) => `
            <div class="list-item">
              <span class="list-item-main">
                <span class="list-item-title truncate">${esc(e.name)}</span>
                <span class="muted small">${esc(e.muscle_group ?? "—")}</span>
              </span>
              ${jaTenho.has(e.id)
                ? `<span class="tag tag-quiet">na lista</span>`
                : `<button class="btn btn-sm" data-escolher="${esc(e.id)}">Adicionar</button>`}
            </div>`).join("")
        : `<div class="empty">Nenhum exercício encontrado.</div>`;

      resultado.querySelectorAll("[data-escolher]").forEach((b) =>
        b.addEventListener("click", async () => {
          b.disabled = true;
          try {
            await db.adicionarNaListaPessoal({ alunoId, exercicioId: b.dataset.escolher });
            jaTenho.add(b.dataset.escolher);
            desenharResultado();
            await carregar();
          } catch (err) {
            avisar(err.message);
            b.disabled = false;
          }
        })
      );
    }

    conteudo.querySelector("#busca").addEventListener("input", (ev) => {
      termo = ev.target.value.toLowerCase().trim();
      desenharResultado();
    });
    conteudo.querySelector("#grupos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-grupo]");
      if (!b) return;
      grupo = b.dataset.grupo;
      conteudo.querySelectorAll("[data-grupo]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x.dataset.grupo === grupo))
      );
      desenharResultado();
    });

    desenharResultado();
  });

  await carregar();
}
