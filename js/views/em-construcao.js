// Placeholder honesto para rotas que ainda não existem.
// Melhor que um link quebrado: diz em que fase a tela entra.

import { esc } from "../utils.js";

export async function render(alvo, { fase }) {
  alvo.innerHTML = `
    <div class="wrap">
      <div class="empty">
        <div class="eyebrow" style="margin-bottom:var(--sp-2)">Ainda não construído</div>
        <p style="margin:0">Esta tela entra na <strong>Fase ${esc(fase ?? "seguinte")}</strong>.</p>
      </div>
    </div>
  `;
}
