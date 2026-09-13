// Tela de login
//
// A mesma tela serve aos dois modos. Com o banco conectado ela pede senha de
// verdade e oferece criar conta; no modo local a senha é ignorada e aparecem
// atalhos para não digitar email a cada teste.

import { APP_NAME, DATA_SOURCE } from "../config.js";
import { db } from "../db.js";
import { entrar, criarConta, entrarComoId } from "../auth.js";
import { esc, iniciais } from "../utils.js";

const LOCAL = DATA_SOURCE === "local";

export async function render(alvo) {
  alvo.innerHTML = `
    <div class="auth">
      <section class="auth-story" aria-label="Leo Personal Trainning">
        <div class="story-logo"><span class="logo-crop" aria-hidden="true"></span><span>LEO<br><small>PERSONAL TRAINNING</small></span></div>
        <div class="story-content"><div class="eyebrow">Método. Consistência. Evolução.</div>
          <h1>Seu próximo<br>nível começa<br><span>aqui.</span></h1>
          <p>Treino com direção.<br>Evolução que você acompanha.</p>
        </div>
        <div class="story-footer"><span>ACOMPANHAMENTO PERSONALIZADO</span><span>01 — ∞</span></div>
      </section>
      <div class="auth-form-side">
      <div class="auth-box">
        <div class="eyebrow">${esc(APP_NAME)}</div>
        <h2 class="auth-brand" id="auth-title">Bom ter você aqui.</h2>
        <p class="muted small" style="margin-bottom:var(--sp-6)">
          Entre com seu email e senha para acessar sua área.
        </p>

        <form id="form" novalidate>
          <div class="field hidden" id="campo-nome">
            <label for="nome">Nome completo</label>
            <input type="text" id="nome" autocomplete="name" />
          </div>

          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" autocomplete="username"
                   placeholder="seu@email.com" required />
          </div>

          <div class="field">
            <label for="senha">Senha</label>
            <input type="password" id="senha" autocomplete="current-password"
                   placeholder="••••••••" />
            ${LOCAL ? `<div class="field-hint">Nesta versão de teste a senha não é verificada.</div>` : ""}
          </div>

          <div id="erro" role="alert" class="alert hidden" style="margin-bottom:var(--sp-4)">
            <div class="small" id="erro-texto"></div>
          </div>

          <button type="submit" class="btn btn-primary btn-block btn-lg" id="enviar">Entrar</button>
        </form>

        ${LOCAL ? "" : `
          <p class="muted small" style="margin-top:var(--sp-4);text-align:center">
            Ainda não tem acesso? Peça sua conta ao professor.
          </p>
        `}

        ${LOCAL ? `
          <hr class="hr" />
          <div class="eyebrow" style="margin-bottom:var(--sp-3)">Acesso rápido para teste</div>
          <div id="atalhos"></div>
        ` : ""}

        <p class="muted small" style="margin-top:var(--sp-6)">
          Seu treino. Seu ritmo. Sua evolução.
        </p>
      </div>
      </div>
    </div>
  `;

  const form = alvo.querySelector("#form");
  const erro = alvo.querySelector("#erro");
  const erroTexto = alvo.querySelector("#erro-texto");
  const enviar = alvo.querySelector("#enviar");
  const campoNome = alvo.querySelector("#campo-nome");
  let modoCadastro = false;

  function mostrarErro(msg) {
    erroTexto.textContent = msg;
    erro.classList.remove("hidden");
  }

  alvo.querySelector("#alternar")?.addEventListener("click", () => {
    modoCadastro = !modoCadastro;
    alvo.querySelector("#auth-title").textContent = modoCadastro ? "Vamos começar." : "Bom ter você aqui.";
    campoNome.classList.toggle("hidden", !modoCadastro);
    enviar.textContent = modoCadastro ? "Criar conta" : "Entrar";
    alvo.querySelector("#alternar").textContent = modoCadastro ? "Já tenho conta" : "Criar conta";
    alvo.querySelector("#senha").autocomplete = modoCadastro ? "new-password" : "current-password";
    erro.classList.add("hidden");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.classList.add("hidden");

    const email = form.email.value.trim();
    const senha = form.senha.value;
    const nome = alvo.querySelector("#nome")?.value.trim();

    if (!email) return mostrarErro("Informe o email.");
    if (!LOCAL && !senha) return mostrarErro("Informe a senha.");
    if (modoCadastro && !nome) return mostrarErro("Informe seu nome completo.");

    enviar.disabled = true;
    enviar.textContent = modoCadastro ? "Criando..." : "Entrando...";

    try {
      if (modoCadastro) {
        const { precisaConfirmar } = await criarConta(email, senha, nome);
        if (precisaConfirmar) {
          form.innerHTML = `
            <div class="alert">
              <div class="eyebrow">Conta criada</div>
              <p style="margin:var(--sp-2) 0 0">
                Enviamos um link de confirmação para <strong>${esc(email)}</strong>.
                Confirme o email e volte aqui para entrar.
              </p>
            </div>`;
          return;
        }
      } else {
        await entrar(email, senha);
      }
      window.dispatchEvent(new CustomEvent("lpt:sessao"));
    } catch (err) {
      mostrarErro(err.message);
      enviar.disabled = false;
      enviar.textContent = modoCadastro ? "Criar conta" : "Entrar";
    }
  });

  if (LOCAL) await desenharAtalhos(alvo);
}

async function desenharAtalhos(alvo) {
  const atalhos = alvo.querySelector("#atalhos");
  const perfis = await db.listarPerfis();

  atalhos.innerHTML = perfis
    .map(
      (p) => `
      <button class="list-item" data-id="${esc(p.id)}"
              style="width:100%;background:none;border:0;border-bottom:1px solid var(--gray-200);cursor:pointer;text-align:left;font-family:inherit;font-size:inherit">
        <span class="avatar">${esc(iniciais(p.full_name))}</span>
        <span class="list-item-main">
          <span class="list-item-title" style="display:block">${esc(p.full_name)}</span>
          <span class="muted small">${p.role === "student" ? "Aluno" : p.role === "admin" ? "Administrador" : "Professor"}</span>
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
}
