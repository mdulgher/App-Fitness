// Meu cadastro — a mesma tela para o professor e para o aluno.
//
// Uma tela só porque os dois editam exatamente os mesmos campos do perfil
// (nome, telefone, senha). O que muda é o bloco extra: o professor declara a
// chave Pix com que cobra; o aluno vê, em leitura, o que o professor definiu
// para ele — objetivo, meta semanal e mensalidade.
//
// O aluno não edita a própria mensalidade nem a meta, e isso não depende desta
// tela: o banco só permite que o professor escreva na tabela `students`.

import { db } from "../db.js";
import { usuarioAtual, ehProfessor, recarregarPerfil } from "../auth.js";
import { PROFESSOR, DATA_SOURCE } from "../config.js";
import { pixCopiaECola } from "../pix.js";
import { esc, iniciais, moeda, plural, urlDeAvatarSeguro, reduzirImagem } from "../utils.js";
import { registrarErro } from "../log.js";

const avatarInterno = (usuario) => {
  const foto = urlDeAvatarSeguro(usuario.avatar_url);
  return foto
    ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer" />`
    : esc(iniciais(usuario.full_name));
};

const MODELO_PADRAO =
  "Oi {nome}! Tudo certo?\n\n" +
  "Sua mensalidade de {mes} é de {valor}, com vencimento em {vencimento}.\n\n" +
  "Pix: {chave}\n\n" +
  "Para copiar o código com um toque, é só abrir:\n{link}\n\n" +
  "Se preferir, o copia e cola:\n{copiaecola}\n\n" +
  "Qualquer dúvida é só me chamar. Bons treinos! — {professor}";

export async function render(alvo) {
  const usuario = usuarioAtual();
  const professor = ehProfessor();

  const [aluno, config] = await Promise.all([
    professor ? null : db.buscarAluno(usuario.id),
    professor ? db.buscarConfiguracaoDeCobranca() : null,
  ]);

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row" style="gap:var(--sp-4)">
        <div class="avatar-editor">
          <span class="avatar avatar-grande" id="meu-avatar">${avatarInterno(usuario)}</span>
          <label class="avatar-trocar" for="p-foto">
            Trocar foto
            <input type="file" id="p-foto" accept="image/jpeg,image/png,image/webp" class="sr-only" />
          </label>
        </div>
        <div>
          <div class="eyebrow">Meu cadastro</div>
          <h1>${esc(usuario.full_name)}</h1>
          <p class="muted page-description">${professor ? "Professor" : "Aluno"} · ${esc(usuario.email ?? "")}</p>
          <button type="button" class="btn btn-sm" id="remover-foto" ${usuario.avatar_url ? "" : "hidden"}>
            Remover foto
          </button>
        </div>
      </div>

      <div id="feedback" role="status" class="library-feedback hidden"></div>

      <section class="card" style="margin-bottom:var(--sp-4)">
        <div class="eyebrow" style="margin-bottom:var(--sp-3)">Seus dados</div>
        <form id="form-dados">
          <div class="field"><label for="p-nome">Nome completo</label>
            <input id="p-nome" name="full_name" required maxlength="120" value="${esc(usuario.full_name ?? "")}" /></div>

          <div class="exercise-form-grid">
            <div class="field"><label for="p-email">Email</label>
              <input id="p-email" value="${esc(usuario.email ?? "")}" disabled />
              <div class="field-hint">É o seu login e não muda por aqui${professor ? "." : ": fale com o professor."}</div></div>
            <div class="field"><label for="p-telefone">Telefone (WhatsApp)</label>
              <input id="p-telefone" name="phone" value="${esc(usuario.phone ?? "")}" placeholder="(11) 90000-0000" /></div>
          </div>

          <div data-erro class="alert hidden" role="alert"></div>
          <button type="submit" class="btn btn-primary" id="salvar-dados">Salvar dados</button>
        </form>
      </section>

      <section class="card" style="margin-bottom:var(--sp-4)">
        <div class="eyebrow" style="margin-bottom:var(--sp-3)">Senha</div>
        <form id="form-senha">
          <div class="exercise-form-grid">
            <div class="field"><label for="p-senha">Nova senha</label>
              <input id="p-senha" name="senha" type="password" autocomplete="new-password" placeholder="••••••••" /></div>
            <div class="field"><label for="p-senha2">Repita a nova senha</label>
              <input id="p-senha2" name="senha2" type="password" autocomplete="new-password" placeholder="••••••••" /></div>
          </div>
          <div data-erro class="alert hidden" role="alert"></div>
          <button type="submit" class="btn" id="salvar-senha">Trocar senha</button>
        </form>
      </section>

      ${professor ? blocoCobranca(config) : blocoDoAluno(aluno)}
    </div>`;

  const feedback = alvo.querySelector("#feedback");
  const avisar = (msg) => {
    feedback.textContent = msg;
    feedback.classList.remove("hidden");
  };

  /* ---------- foto de perfil ---------- */

  const avatarEl = alvo.querySelector("#meu-avatar");
  const campoFoto = alvo.querySelector("#p-foto");
  const botaoRemover = alvo.querySelector("#remover-foto");

  function redesenharAvatar() {
    avatarEl.innerHTML = avatarInterno(usuarioAtual());
    botaoRemover.hidden = !usuarioAtual().avatar_url;
    // O cabeçalho do app tem o mesmo avatar e não se redesenha sozinho.
    window.dispatchEvent(new CustomEvent("lpt:perfil"));
  }

  campoFoto.addEventListener("change", async () => {
    const arquivo = campoFoto.files?.[0];
    if (!arquivo) return;
    campoFoto.disabled = true;
    avisar("Enviando a foto…");
    try {
      // A redução acontece aqui, e não na camada de dados, porque é decisão de
      // interface: o avatar aparece com 44 px e uma selfie de 4 MB não muda
      // nada na tela, só gasta a internet de quem está na academia.
      await db.enviarMeuAvatar(await reduzirImagem(arquivo));
      await recarregarPerfil();
      redesenharAvatar();
      avisar("Foto atualizada.");
    } catch (err) {
      registrarErro(err, { contexto: { tela: "perfil", acao: "enviarAvatar" } });
      avisar(`Não foi possível enviar a foto: ${err.message}`);
    } finally {
      // Zerar o campo é o que permite escolher o mesmo arquivo de novo depois
      // de um erro: sem isso o `change` não dispara na segunda tentativa.
      campoFoto.value = "";
      campoFoto.disabled = false;
    }
  });

  botaoRemover.addEventListener("click", async () => {
    botaoRemover.disabled = true;
    try {
      await db.removerMeuAvatar();
      await recarregarPerfil();
      redesenharAvatar();
      avisar("Foto removida.");
    } catch (err) {
      registrarErro(err, { contexto: { tela: "perfil", acao: "removerAvatar" } });
      avisar(`Não foi possível remover a foto: ${err.message}`);
    } finally {
      botaoRemover.disabled = false;
    }
  });

  /* ---------- dados do perfil ---------- */

  const formDados = alvo.querySelector("#form-dados");
  formDados.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erro = formDados.querySelector("[data-erro]");
    const botao = alvo.querySelector("#salvar-dados");
    erro.classList.add("hidden");

    const nome = formDados.full_name.value.trim();
    if (!nome) {
      erro.textContent = "Informe seu nome.";
      erro.classList.remove("hidden");
      return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando…";
    try {
      await db.atualizarMeuPerfil({ full_name: nome, phone: formDados.phone.value.trim() || null });
      await recarregarPerfil();
      // O nome aparece em três lugares ao mesmo tempo: o cabeçalho do app, o
      // título desta tela e a inicial do avatar. Sem atualizar os três, a
      // mensagem "dados atualizados" apareceria ao lado do nome antigo.
      window.dispatchEvent(new CustomEvent("lpt:perfil"));
      alvo.querySelector(".page-head h1").textContent = nome;
      // Só as iniciais são redesenhadas, e só quando não há foto: usar
      // `textContent` aqui de qualquer jeito apagaria a <img> do avatar.
      if (!usuarioAtual().avatar_url) avatarEl.textContent = iniciais(nome);
      avisar("Dados atualizados.");
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.remove("hidden");
    } finally {
      botao.disabled = false;
      botao.textContent = "Salvar dados";
    }
  });

  /* ---------- senha ---------- */

  const formSenha = alvo.querySelector("#form-senha");
  formSenha.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erro = formSenha.querySelector("[data-erro]");
    const botao = alvo.querySelector("#salvar-senha");
    erro.classList.add("hidden");

    const senha = formSenha.senha.value;
    const mostrarErro = (msg) => {
      erro.textContent = msg;
      erro.classList.remove("hidden");
    };

    if (DATA_SOURCE === "local") return mostrarErro("Trocar senha só funciona com o banco conectado.");
    if (senha.length < 6) return mostrarErro("A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== formSenha.senha2.value) return mostrarErro("As duas senhas não são iguais.");

    botao.disabled = true;
    botao.textContent = "Trocando…";
    try {
      await db.alterarMinhaSenha(senha);
      formSenha.reset();
      avisar("Senha alterada. Ela vale a partir do próximo login.");
    } catch (err) {
      mostrarErro(err.message);
    } finally {
      botao.disabled = false;
      botao.textContent = "Trocar senha";
    }
  });

  /* ---------- cobrança (só o professor) ---------- */

  const formCobranca = alvo.querySelector("#form-cobranca");
  formCobranca?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const erro = formCobranca.querySelector("[data-erro]");
    const botao = alvo.querySelector("#salvar-cobranca");
    erro.classList.add("hidden");

    const d = Object.fromEntries(new FormData(formCobranca));
    const patch = {
      pix_key: d.pix_key.trim() || null,
      pix_key_type: d.pix_key_type,
      pix_name: d.pix_name.trim() || null,
      pix_city: d.pix_city.trim() || null,
      charge_message: d.charge_message.trim() || null,
    };

    // Validar aqui evita descobrir o erro só quando o banco do aluno recusar o
    // código — quando já é tarde e ninguém sabe o que deu errado.
    if (patch.pix_key) {
      try {
        pixCopiaECola({ chave: patch.pix_key, nome: patch.pix_name, cidade: patch.pix_city, valor: 1 });
      } catch (err) {
        erro.textContent = err.message;
        erro.classList.remove("hidden");
        return;
      }
    }

    botao.disabled = true;
    botao.textContent = "Salvando…";
    try {
      await db.salvarConfiguracaoDeCobranca(patch);
      avisar(patch.pix_key ? "Chave Pix salva. As cobranças já saem com ela." : "Chave Pix removida.");
      alvo.querySelector("#previa-pix").textContent = patch.pix_key
        ? pixCopiaECola({ chave: patch.pix_key, nome: patch.pix_name, cidade: patch.pix_city, valor: 100 })
        : "";
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.remove("hidden");
    } finally {
      botao.disabled = false;
      botao.textContent = "Salvar dados de cobrança";
    }
  });
}

function blocoCobranca(config) {
  let previa = "";
  if (config?.pix_key) {
    try {
      previa = pixCopiaECola({
        chave: config.pix_key,
        nome: config.pix_name || PROFESSOR.nome,
        cidade: config.pix_city || "Sao Paulo",
        valor: 100,
      });
    } catch { previa = ""; }
  }

  return `
    <section class="card">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">Como você recebe</div>
      <h2 style="margin-bottom:var(--sp-2)">Chave Pix</h2>
      <p class="muted small" style="margin-bottom:var(--sp-4)">
        É com esta chave que os alunos pagam. Ela entra nas mensagens de cobrança
        e aparece na tela de financeiro de cada aluno.
      </p>

      <form id="form-cobranca">
        <div class="exercise-form-grid">
          <div class="field"><label for="c-tipo">Tipo de chave</label>
            <select id="c-tipo" name="pix_key_type">
              ${[["cpf", "CPF"], ["cnpj", "CNPJ"], ["email", "Email"], ["telefone", "Telefone"], ["aleatoria", "Aleatória"]]
                .map(([v, r]) => `<option value="${v}"${config?.pix_key_type === v ? " selected" : ""}>${r}</option>`).join("")}
            </select></div>
          <div class="field"><label for="c-chave">Chave Pix</label>
            <input id="c-chave" name="pix_key" value="${esc(config?.pix_key ?? "")}" placeholder="seu@email.com" /></div>
        </div>

        <div class="exercise-form-grid">
          <div class="field"><label for="c-nome">Nome do recebedor</label>
            <input id="c-nome" name="pix_name" maxlength="25" value="${esc(config?.pix_name ?? PROFESSOR.nome)}" />
            <div class="field-hint">Sem acento e até 25 caracteres — exigência do padrão do Pix.</div></div>
          <div class="field"><label for="c-cidade">Cidade</label>
            <input id="c-cidade" name="pix_city" maxlength="15" value="${esc(config?.pix_city ?? "")}" placeholder="Sao Paulo" /></div>
        </div>

        <div class="field"><label for="c-msg">Modelo da mensagem de cobrança</label>
          <textarea id="c-msg" name="charge_message" rows="9">${esc(config?.charge_message ?? MODELO_PADRAO)}</textarea>
          <small>Trocas automáticas: {nome} {mes} {valor} {vencimento} {chave} {copiaecola} {link} {professor}</small></div>

        ${previa ? `<div class="eyebrow" style="margin-bottom:var(--sp-2)">Prévia do copia e cola (exemplo de R$ 100,00)</div>` : ""}
        <code class="pix-code" id="previa-pix" style="${previa ? "" : "display:none"}">${esc(previa)}</code>

        <div data-erro class="alert hidden" role="alert" style="margin-top:var(--sp-3)"></div>
        <button type="submit" class="btn btn-primary" id="salvar-cobranca" style="margin-top:var(--sp-3)">
          Salvar dados de cobrança
        </button>
      </form>
    </section>`;
}

function blocoDoAluno(aluno) {
  if (!aluno) return "";
  return `
    <section class="card">
      <div class="eyebrow" style="margin-bottom:var(--sp-3)">Definido pelo seu professor</div>
      <div class="list">
        ${item("Objetivo", aluno.goal ?? "Sem objetivo definido")}
        ${aluno.resumo?.metaSemanal ? item("Meta semanal", plural(aluno.resumo.metaSemanal, "treino", "treinos") + " por semana") : ""}
        ${item("Mensalidade", aluno.monthly_fee != null
          ? `${moeda(aluno.monthly_fee)} · vence dia ${aluno.due_day ?? "—"}`
          : "Sem mensalidade cadastrada")}
        ${aluno.health_restrictions ? item("Restrições e lesões", aluno.health_restrictions) : ""}
      </div>
      <p class="muted small" style="margin-top:var(--sp-4)">
        Para mudar qualquer um destes, fale com ${esc(PROFESSOR.nome.split(/\s+/)[0])}.
      </p>
    </section>`;
}

function item(rotulo, valor) {
  return `
    <div class="list-item">
      <span class="list-item-main">
        <span class="eyebrow">${esc(rotulo)}</span>
        <span style="display:block;margin-top:2px">${esc(valor)}</span>
      </span>
    </div>`;
}
