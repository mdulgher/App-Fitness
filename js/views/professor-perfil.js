// Bloco do professor: quem ele é, no que é especializado e onde encontrá-lo.
// Compartilhado entre o painel dele e a área do aluno, para o texto não
// divergir em dois lugares.

import { PROFESSOR } from "../config.js";
import { esc } from "../utils.js";

export function blocoProfessor({ compacto = false } = {}) {
  const especializacoes = PROFESSOR.especializacoes
    .map((e) => `<li>${esc(e)}</li>`)
    .join("");

  return `
    <section class="card trainer-card${compacto ? " is-compact" : ""}">
      <div class="trainer-head">
        <span class="logo-crop" aria-hidden="true"></span>
        <div>
          <div class="eyebrow">Seu treinador</div>
          <h3>${esc(PROFESSOR.nome)}</h3>
          <p class="muted small">${esc(PROFESSOR.titulo)}</p>
        </div>
      </div>

      <ul class="trainer-tags">${especializacoes}</ul>

      <a class="btn btn-block trainer-link" href="${esc(PROFESSOR.instagramUrl)}"
         target="_blank" rel="noopener noreferrer">
        Instagram · @${esc(PROFESSOR.instagram)} <span aria-hidden="true">↗</span>
      </a>
    </section>`;
}
