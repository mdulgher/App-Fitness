// Lista e cadastro de alunos, pelo professor.

import { db, ROTULO_STATUS, CLASSE_STATUS } from "../db.js";
import {
  esc, iniciais, textoTempoRelativo, plural, moeda, ligarMascaraDeMoeda, moedaParaNumero,
} from "../utils.js";
import { registrarErro } from "../log.js";

export async function render(alvo) {
  let alunos = [];

  alvo.innerHTML = `
    <div class="wrap">
      <div class="page-head row-between">
        <div>
          <div class="eyebrow">Acompanhamento</div>
          <h1>Alunos</h1>
          <p class="muted page-description" id="resumo-alunos">Carregando…</p>
        </div>
        <button class="btn btn-primary" id="novo">+ Novo aluno</button>
      </div>

      <label class="field">
        <span>Buscar</span>
        <input type="search" id="busca" placeholder="Nome ou objetivo" />
      </label>

      <div class="list" id="lista"><div class="empty">Carregando…</div></div>
    </div>
    <dialog class="exercise-dialog" id="aluno-dialog" aria-labelledby="dialog-title">
      <div id="dialog-conteudo"></div>
    </dialog>`;

  const lista = alvo.querySelector("#lista");
  const busca = alvo.querySelector("#busca");
  const dialog = alvo.querySelector("#aluno-dialog");
  const conteudo = alvo.querySelector("#dialog-conteudo");

  async function carregar() {
    try {
      alunos = await db.listarAlunos({ incluirInativos: true });
      const ativos = alunos.filter((a) => a.active).length;
      alvo.querySelector("#resumo-alunos").textContent =
        `${plural(ativos, "aluno ativo", "alunos ativos")}${alunos.length > ativos ? ` · ${alunos.length - ativos} inativo(s)` : ""}`;
      desenhar();
    } catch (err) {
      registrarErro(err, { contexto: { tela: "alunos", acao: "carregar" } });
      lista.innerHTML = `<div class="empty"><p>Não foi possível carregar os alunos.</p><p class="small">${esc(err.message)}</p></div>`;
    }
  }

  function desenhar() {
    const termo = busca.value.toLowerCase().trim();
    const visiveis = alunos.filter(
      (a) => !termo || a.full_name.toLowerCase().includes(termo) || (a.goal ?? "").toLowerCase().includes(termo)
    );
    lista.innerHTML = visiveis.length
      ? visiveis.map(linha).join("")
      : `<div class="empty">${alunos.length ? "Nenhum aluno corresponde à busca." : "Nenhum aluno cadastrado ainda. Comece pelo botão “Novo aluno”."}</div>`;
  }

  busca.addEventListener("input", desenhar);
  alvo.querySelector("#novo").addEventListener("click", () => formulario());

  function fechar() { dialog.close(); }

  function formulario() {
    conteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Novo aluno</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2 id="dialog-title">Cadastrar aluno</h2>
      <p class="muted small">A conta é criada na hora. Você recebe a senha para repassar ao aluno.</p>

      <form id="form-aluno">
        <div class="field"><label for="f-nome">Nome completo</label>
          <input id="f-nome" name="full_name" required maxlength="120" placeholder="Ex.: Carla Mendes" /></div>

        <div class="exercise-form-grid">
          <div class="field"><label for="f-email">Email</label>
            <input id="f-email" name="email" type="email" required placeholder="aluno@email.com" /></div>
          <div class="field"><label for="f-telefone">Telefone</label>
            <input id="f-telefone" name="phone" placeholder="(11) 90000-0000" /></div>
        </div>

        <div class="field"><label for="f-objetivo">Objetivo</label>
          <select id="f-objetivo" name="goal">
            <option>Hipertrofia</option><option>Emagrecimento</option>
            <option>Condicionamento</option><option>Reabilitação</option><option>Saúde geral</option>
          </select></div>

        <div class="field"><label for="f-restricoes">Restrições e lesões</label>
          <textarea id="f-restricoes" name="health_restrictions" rows="3"
            placeholder="Ex.: hérnia de disco L5-S1, sem agachamento livre."></textarea>
          <small>Aparece em destaque na ficha, antes de qualquer exercício.</small></div>

        <div class="exercise-form-grid">
          <div class="field"><label for="f-mensalidade">Mensalidade</label>
            <input id="f-mensalidade" name="monthly_fee" type="text" inputmode="numeric" placeholder="R$ 0,00" /></div>
          <div class="field"><label for="f-vencimento">Dia do vencimento</label>
            <input id="f-vencimento" name="due_day" type="number" inputmode="numeric" min="1" max="28" value="5" /></div>
        </div>

        <div data-erro class="alert hidden" role="alert"></div>
        <div class="dialog-actions">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="submit" class="btn btn-primary" id="salvar">Criar conta do aluno</button>
        </div>
      </form>`;

    dialog.showModal();
    conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
    ligarMascaraDeMoeda(conteudo.querySelector("#f-mensalidade"));

    const form = conteudo.querySelector("#form-aluno");
    const erro = conteudo.querySelector("[data-erro]");
    const salvar = conteudo.querySelector("#salvar");

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      erro.classList.add("hidden");
      const dados = Object.fromEntries(new FormData(form));
      // A máscara guarda "R$ 280,00"; o banco quer 280. Converter aqui e não no
      // db evita que a camada de dados precise conhecer formato de tela.
      dados.monthly_fee = moedaParaNumero(dados.monthly_fee);
      if (!dados.full_name.trim() || !dados.email.trim()) {
        erro.textContent = "Informe o nome e o email.";
        erro.classList.remove("hidden");
        return;
      }

      salvar.disabled = true;
      salvar.textContent = "Criando conta…";
      try {
        const criado = await db.criarAluno(dados);
        await carregar();
        credenciais(criado);
      } catch (err) {
        registrarErro(err, { contexto: { tela: "alunos", acao: "criarAluno" } });
        erro.textContent = err.message;
        erro.classList.remove("hidden");
        salvar.disabled = false;
        salvar.textContent = "Criar conta do aluno";
      }
    });

    form.elements.full_name.focus();
  }

  // A senha temporária só aparece aqui, uma vez. Ela não fica guardada em lugar
  // nenhum: o Supabase armazena apenas o hash, e nem o professor consegue
  // consultá-la depois — daí o aviso e o botão de copiar.
  function credenciais(criado) {
    conteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Conta criada</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2 id="dialog-title">${esc(criado.full_name)}</h2>
      <p class="muted small">Mande estes dados para o aluno. A senha não aparece de novo depois que você fechar.</p>

      <div class="card" style="margin:var(--sp-4) 0">
        <div class="eyebrow">Email</div>
        <div class="numeric" style="font-size:17px;font-weight:700;margin-bottom:var(--sp-3)">${esc(criado.email)}</div>
        <div class="eyebrow">Senha temporária</div>
        <div class="numeric" style="font-size:22px;font-weight:800;letter-spacing:.04em">${esc(criado.senha ?? "—")}</div>
      </div>

      <div class="dialog-actions">
        <button class="btn" id="copiar">Copiar dados</button>
        <button class="btn btn-primary" data-fechar>Concluir</button>
      </div>`;

    conteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
    const copiar = conteudo.querySelector("#copiar");
    copiar.addEventListener("click", async () => {
      const texto = `Leo Personal Trainning\nEmail: ${criado.email}\nSenha: ${criado.senha ?? ""}`;
      try {
        await navigator.clipboard.writeText(texto);
        copiar.textContent = "Copiado";
      } catch {
        copiar.textContent = "Copie na mão";
      }
    });
  }

  await carregar();
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
          ${a.monthly_fee ? ` · ${moeda(a.monthly_fee)}/mês` : ""}
          ${a.active ? "" : " · <strong>inativo</strong>"}
        </span>
      </span>
    </a>`;
}
