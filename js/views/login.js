// Tela de login
//
// O desenho já é o definitivo. Na fase local a senha não é verificada — só o
// email é conferido contra os dados de teste. Os botões de acesso rápido
// existem para não ter que digitar email a cada teste e saem na Fase 8.

import { APP_NAME } from "../config.js";
import { db } from "../db.js";
import { entrar, entrarComoId } from "../auth.js";
import { esc, iniciais } from "../utils.js";

export async function render(alvo) {
  const perfis = await db.listarPerfis();

  alvo.innerHTML = `
    <div class="auth">
      <div class="auth-box">
        <div class="auth-brand">${esc(APP_NAME)}</div>
        <p class="muted small" style="margin-bottom:var(--sp-6)">
          Treino, frequência e acompanhamento.
        </p>

        <form id="form-login" novalidate>
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="username"
                   placeholder="seu@email.com" required />
          </div>

          <div class="field">
            <label for="senha">Senha</label>
            <input type="password" id="senha" name="senha"
                   autocomplete="current-password" placeholder="••••••••" />
            <div class="field-hint">Nesta versão de teste a senha não é verificada.</div>
          </div>

          <div id="erro" class="alert hidden" style="margin-bottom:var(--sp-4)">
            <strong class="small" id="erro-texto"></strong>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg">Entrar</button>
        </form>

        <hr class="hr" />

        <div class="eyebrow" style="margin-bottom:var(--sp-3)">Acesso rápido para teste</div>
        <div class="stack" id="atalhos"></div>
      </div>
    </div>
  `;

  const atalhos = alvo.querySelector("#atalhos");
  atalhos.innerHTML = perfis
    .map(
      (p) => `
      <button class="list-item" data-id="${esc(p.id)}"
              style="width:100%;background:none;border:0;border-bottom:1px solid var(--gray-200);cursor:pointer;text-align:left;font-family:inherit;font-size:inherit">
        <span class="avatar">${esc(iniciais(p.full_name))}</span>
        <span class="list-item-main">
          <span class="list-item-title" style="display:block">${esc(p.full_name)}</span>
          <span class="muted small">${p.role === "trainer" ? "Professor" : "Aluno"}</span>
        </span>
      </button>`
    )
    .join("");

  atalhos.addEventListener("click", async (e) => {
    const botao = e.target.closest("[data-id]");
    if (!botao) return;
    await entrarComoId(botao.dataset.id);
    window.dispatchEvent(new CustomEvent("lpt:sessao"));
  });

  const form = alvo.querySelector("#form-login");
  const erro = alvo.querySelector("#erro");
  const erroTexto = alvo.querySelector("#erro-texto");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.classList.add("hidden");
    const email = form.email.value.trim();
    if (!email) {
      erroTexto.textContent = "Informe o email.";
      erro.classList.remove("hidden");
      return;
    }
    try {
      await entrar(email);
      window.dispatchEvent(new CustomEvent("lpt:sessao"));
    } catch (err) {
      erroTexto.textContent = err.message;
      erro.classList.remove("hidden");
    }
  });
}
