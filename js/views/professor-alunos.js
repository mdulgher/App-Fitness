// Lista de alunos do professor

import { db, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import { esc, iniciais, textoTempoRelativo, plural } from "../utils.js";

export async function render(alvo) {
  const alunos = await db.listarAlunos({ incluirInativos: true });

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Acompanhamento individual</div>
          <h1>Seus alunos.</h1>
          <p class="muted page-description">${plural(alunos.filter((a) => a.active).length, "aluno ativo", "alunos ativos")} · Cada jornada merece atenção.</p>
        </div>
        <button class="btn btn-primary" id="novo">Novo aluno</button>
      </div>

      <label class="field">
        <span class="eyebrow">Encontre um aluno</span>
        <input type="search" id="busca" aria-label="Buscar por nome ou objetivo" placeholder="Buscar por nome ou objetivo" />
      </label>

      <div class="list" id="lista"></div>
    </div>
  `;

  const lista = alvo.querySelector("#lista");
  const busca = alvo.querySelector("#busca");

  function desenhar(filtro = "") {
    const termo = filtro.toLowerCase().trim();
    const visiveis = alunos.filter(
      (a) =>
        !termo ||
        a.full_name.toLowerCase().includes(termo) ||
        (a.goal ?? "").toLowerCase().includes(termo)
    );

    lista.innerHTML = visiveis.length
      ? visiveis.map(linha).join("")
      : `<div class="empty">Nenhum aluno encontrado.</div>`;
  }

  busca.addEventListener("input", () => desenhar(busca.value));
  desenhar();

  alvo.querySelector("#novo").addEventListener("click", () => {
    alert("Cadastro de aluno entra na Fase 1.");
  });
}

function linha(a) {
  const r = a.resumo;
  return `
    <a class="list-item" href="#/professor/aluno/${esc(a.id)}">
      <span class="avatar">${esc(iniciais(a.full_name))}</span>
      <span class="list-item-main">
        <span class="row-between">
          <span class="list-item-title truncate">${esc(a.full_name)}</span>
          <span class="${CLASSE_STATUS[r.statusFinanceiro]}">${ROTULO_STATUS[r.statusFinanceiro]}</span>
        </span>
        <span class="muted small">
          ${esc(a.goal ?? "Sem objetivo")} ·
          ${r.ultimoTreino ? `treinou ${textoTempoRelativo(r.ultimoTreino)}` : "sem treinos"}
          ${a.active ? "" : " · <strong>inativo</strong>"}
        </span>
      </span>
    </a>`;
}
