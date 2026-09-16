// Treino do dia — a tela que o aluno abre dentro da academia.
//
// Três decisões mandam no desenho daqui:
//
// 1. **A carga da última vez fica ao lado do campo**, não escondida num
//    histórico. Sem ela o aluno não sabe com quanto treinou na semana passada,
//    repete o mesmo peso por meses e a progressão não acontece. É o detalhe que
//    justifica o recurso inteiro (PLANO.md seção 6.4).
// 2. **Nada é salvo em lote.** Cada série é gravada ao sair do campo, porque o
//    celular na academia perde foco, trava e volta para o bolso no meio do
//    treino. Um botão "salvar tudo" no fim perderia o treino inteiro.
// 3. **A sessão só nasce quando o aluno registra alguma coisa** ou conclui o
//    treino. Abrir a tela para espiar não pode virar presença no histórico.
// 4. **Sem sinal, nada se perde.** Falha de rede vai para a fila de `js/sync.js`,
//    que reenvia sozinha quando a conexão volta. A série aparece na tela como
//    guardada no aparelho — nunca como erro.

import { db } from "../db.js";
import { usuarioAtual } from "../auth.js";
import {
  esc, plural, hoje, formatarData, textoTempoRelativo, capaDoVideo, urlDeEmbed,
  horaDe,
} from "../utils.js";
import { cartaoDeSessaoRealizada } from "../treinos-realizados.js";
import { urlDeImagemSegura, videoSeguro } from "../exercise-validation.js";
import { caminhoDoBanner } from "../catalogo-banners.js";
import {
  enfileirarSerie, enfileirarConclusao, seriesNaFila, conclusaoNaFila,
  sincronizar, pendentes,
} from "../sync.js";
import { registrarErro } from "../log.js";

export async function render(alvo, { params }) {
  const [diaId] = params;
  const alunoId = usuarioAtual().id;
  const dia = await db.buscarDiaDeTreino(diaId);

  if (!dia) {
    alvo.innerHTML = `
      <div class="wrap">
        <a class="muted small" href="#/aluno">&larr; Meu treino</a>
        <div class="empty" style="margin-top:var(--sp-4)">Este treino não existe mais na sua ficha.</div>
      </div>`;
    return;
  }

  // Sessão de hoje, se já existir. Procurar em vez de abrir é de propósito:
  // `abrirSessao` criaria a linha só por ter aberto a tela.
  let sessao = (await db.listarSessoes(alunoId, { de: hoje(), ate: hoje() }))
    .find((s) => s.workout_day_id === diaId) ?? null;

  let cargas = sessao ? await db.listarCargasDaSessao(sessao.id) : [];

  // O que ficou na fila deste treino: o aluno pode ter digitado sem sinal,
  // saído do app e voltado. O que ele viu na tela precisa continuar lá.
  let fila = seriesNaFila(alunoId, diaId, hoje());
  let conclusaoPendente = conclusaoNaFila(alunoId, diaId, hoje());
  let salvamentosEmCurso = 0;

  // "Da última vez" ignora a sessão de hoje: comparar o treino com ele mesmo
  // não diz nada.
  const ultimas = new Map(
    await Promise.all(
      dia.exercicios.map(async (item) => [
        item.id,
        await db.ultimaVezNoExercicio(alunoId, item.exercise_id, sessao?.id ?? null),
      ])
    )
  );

  alvo.innerHTML = `
    <div class="wrap treino-do-dia">
      <a class="muted small" href="#/aluno">&larr; Meu treino</a>

      ${bannerDoDia(dia)}

      <div id="feedback" role="status" class="library-feedback hidden"></div>
      <div id="pendencias" class="aviso-fila hidden" role="status"></div>

      <div class="card treino-progresso" id="progresso"></div>

      <div class="stack" id="exercicios"></div>

      <div class="treino-fim" id="fim"></div>
    </div>
    <dialog class="exercise-dialog" id="dialogo"><div id="dialogo-conteudo"></div></dialog>`;

  const feedback = alvo.querySelector("#feedback");
  const pendenciasEl = alvo.querySelector("#pendencias");
  const listaEl = alvo.querySelector("#exercicios");
  const progressoEl = alvo.querySelector("#progresso");
  const fimEl = alvo.querySelector("#fim");
  const dialogo = alvo.querySelector("#dialogo");
  const dialogoConteudo = alvo.querySelector("#dialogo-conteudo");

  const avisar = (msg) => {
    feedback.textContent = msg;
    feedback.classList.remove("hidden");
  };

  const cargaDe = (itemId, serie) =>
    cargas.find((c) => c.workout_day_exercise_id === itemId && c.set_number === serie) ?? null;

  const naFilaDe = (itemId, serie) => fila[`${itemId}:${serie}`] ?? null;

  // Série guardada no aparelho conta como feita no progresso: para o aluno ela
  // está registrada — o que falta é só de onde ela ainda vai sair.
  function seriesRegistradas() {
    const salvas = cargas.filter((c) => c.weight_kg != null || c.reps_done != null);
    const naFila = Object.values(fila).filter(
      (s) => !salvas.some((c) => c.workout_day_exercise_id === s.itemId && c.set_number === s.serie)
    );
    return salvas.length + naFila.length;
  }

  function desenharPendencias() {
    const total = pendentes();
    pendenciasEl.classList.toggle("hidden", total === 0);
    if (!total) return;

    pendenciasEl.innerHTML = `
      <div>
        <strong>${plural(total, "registro guardado", "registros guardados")} no aparelho.</strong>
        <span class="muted small">Envio sozinho assim que a internet voltar.</span>
      </div>
      <button class="btn btn-sm" id="enviar-agora">Tentar agora</button>`;

    pendenciasEl.querySelector("#enviar-agora").addEventListener("click", async (ev) => {
      const botao = ev.currentTarget;
      botao.disabled = true;
      botao.textContent = "Enviando…";
      const { enviados } = await sincronizar();
      await recarregarDoBanco();
      avisar(enviados ? "Tudo enviado." : "Ainda sem internet. Seus registros continuam guardados.");
    });
  }

  // Depois que a fila vai embora, quem manda é o banco.
  async function recarregarDoBanco(redesenharTudo = true) {
    try {
      sessao = (await db.listarSessoes(alunoId, { de: hoje(), ate: hoje() }))
        .find((s) => s.workout_day_id === diaId) ?? sessao;
      cargas = sessao ? await db.listarCargasDaSessao(sessao.id) : cargas;
    } catch {
      // Continua offline: a tela segue mostrando o que está na fila.
    }
    fila = seriesNaFila(alunoId, diaId, hoje());
    conclusaoPendente = conclusaoNaFila(alunoId, diaId, hoje());
    if (!alvo.isConnected || !redesenharTudo) return;
    desenharProgresso();
    desenharExercicios();
    desenharFim();
    desenharPendencias();
  }

  /* ---------- desenho ---------- */

  function desenharProgresso() {
    const total = totalDeSeries(dia);
    const feitas = seriesRegistradas();
    const pct = total ? Math.min(100, (feitas / total) * 100) : 0;
    const concluido = Boolean(sessao?.completed_at);

    progressoEl.innerHTML = `
      <div class="row-between" style="flex-wrap:wrap;gap:var(--sp-2)">
        <div>
          <div class="eyebrow">${concluido ? "Treino concluído" : "Séries registradas"}</div>
          <div class="numeric" style="font-size:26px;font-weight:800;letter-spacing:-.03em">
            ${feitas}<span style="color:var(--gray-400)">/${total}</span>
          </div>
        </div>
        ${concluido ? `<span class="tag tag-solid">Feito hoje</span>` : ""}
      </div>
      <div class="meter" style="margin-top:var(--sp-3)"><span style="width:${pct}%"></span></div>`;
  }

  function desenharFim() {
    if (conclusaoPendente && !sessao?.completed_at) {
      fimEl.innerHTML = `
        <div class="card" style="text-align:center">
          <div class="eyebrow">Treino de hoje</div>
          <h2 style="margin:var(--sp-2) 0">Feito.</h2>
          <p class="muted small" style="margin-bottom:var(--sp-4)">
            Guardado no aparelho. Assim que a internet voltar, seu professor vê a presença.
          </p>
          <a class="btn btn-block" href="#/aluno">Voltar para os meus treinos</a>
        </div>`;
      return;
    }

    if (sessao?.completed_at) {
      fimEl.innerHTML = `
        <div class="card" style="text-align:center">
          <div class="eyebrow">Treino de hoje</div>
          <h2 style="margin:var(--sp-2) 0">Feito.</h2>
          <p class="muted small" style="margin-bottom:var(--sp-4)">
            Registrado às ${esc(horaDe(sessao.completed_at))}. As cargas continuam editáveis se você errou alguma.
          </p>
          <button class="btn btn-block" id="ver-realizado" type="button">Ver treino realizado</button>
          <a class="btn btn-block" href="#/aluno" style="margin-top:var(--sp-2)">Voltar para os meus treinos</a>
        </div>`;

      // O painel passa a sugerir a próxima divisão assim que esta é concluída, e
      // no teste com o iPhone isso pareceu ter apagado o treino de agora. Este
      // botão é a resposta: o que acabou de ser feito, do jeito que ficou
      // gravado. O histórico completo fica na Frequência.
      fimEl.querySelector("#ver-realizado").addEventListener("click", () => mostrarRealizado());
      return;
    }

    fimEl.innerHTML = `
      <button class="btn btn-primary btn-block" id="concluir">Concluir treino</button>
      <p class="muted small" style="text-align:center;margin-top:var(--sp-3)">
        Concluir marca a presença de hoje. As cargas você registra antes ou depois.
      </p>`;

    fimEl.querySelector("#concluir").addEventListener("click", async (ev) => {
      const botao = ev.currentTarget;
      botao.disabled = true;
      botao.textContent = "Registrando…";
      salvamentosEmCurso += 1;
      try {
        await enfileirarConclusao({ alunoId, diaId, data: hoje() });
        conclusaoPendente = true;
        desenharFim();
        desenharPendencias();
        const { erro } = await sincronizar();
        await recarregarDoBanco(false);
        desenharProgresso();
        desenharFim();
        desenharPendencias();
        if (!conclusaoNaFila(alunoId, diaId, hoje())) {
          avisar("Presença registrada. Bom treino feito.");
        } else if (erro) {
          avisar(`Presença guardada, mas ainda não enviada: ${erro.message}`);
        } else {
          avisar("Sem internet. Presença guardada no aparelho — mando sozinho quando a rede voltar.");
        }
      } catch (err) {
        registrarErro(err, { contexto: { acao: "concluirTreino", diaId } });
        avisar(err.message);
        botao.disabled = false;
        botao.textContent = "Concluir treino";
      } finally {
        salvamentosEmCurso -= 1;
      }
    });
  }

  function desenharExercicios() {
    listaEl.innerHTML = dia.exercicios.map(cartaoDoExercicio).join("") ||
      `<div class="empty">Seu professor ainda não colocou exercícios nesta divisão.</div>`;
    ligarEventos();
  }

  function cartaoDoExercicio(item) {
    const ex = item.exercicio;
    const nome = ex?.name ?? "(exercício removido)";
    const foto = urlDeImagemSegura(ex?.photo_url) || capaDoVideo(videoSeguro(ex?.video_url));
    const ultima = ultimas.get(item.id);

    return `
      <div class="card exercicio-do-treino" data-item="${esc(item.id)}">
        <div class="exercicio-topo">
          ${foto
            ? `<img class="exercicio-miniatura" src="${esc(foto)}" alt="" loading="lazy" decoding="async" />`
            : `<span class="exercicio-miniatura exercicio-miniatura-vazia" aria-hidden="true"></span>`}
          <div style="flex:1;min-width:0">
            <h3 class="truncate">${esc(nome)}</h3>
            <div class="muted small">
              ${item.sets} × ${esc(item.reps ?? "—")}
              ${item.rest_seconds ? ` · descanso ${item.rest_seconds}s` : ""}
              ${ex?.muscle_group ? ` · ${esc(ex.muscle_group)}` : ""}
            </div>
          </div>
          ${ex ? `<button class="btn btn-sm" data-ver="${esc(item.id)}">Como fazer</button>` : ""}
        </div>

        ${item.trainer_notes
          ? `<p class="exercicio-recado"><strong>Professor:</strong> ${esc(item.trainer_notes)}</p>`
          : ""}

        <div class="ultima-vez">${textoDaUltimaVez(ultima)}</div>

        <div class="series">
          ${Array.from({ length: item.sets ?? 0 }, (_, i) => linhaDeSerie(item, i + 1, ultima)).join("")}
        </div>

        ${item.rest_seconds
          ? `<button class="btn btn-sm btn-block descanso" data-descanso="${item.rest_seconds}">
               Descansar ${item.rest_seconds}s
             </button>`
          : ""}
      </div>`;
  }

  function textoDaUltimaVez(ultima) {
    if (!ultima?.series?.length) {
      return `<span class="muted small">Primeira vez que você registra este exercício.</span>`;
    }
    const resumo = ultima.series
      .map((s) => `${formatarPeso(s.weight_kg)}${s.reps_done ? ` × ${s.reps_done}` : ""}`)
      .join(" · ");
    return `
      <span class="eyebrow">Da última vez</span>
      <span class="numeric">${esc(resumo)}</span>
      <span class="muted small">${esc(textoTempoRelativo(ultima.data))}</span>`;
  }

  function linhaDeSerie(item, serie, ultima) {
    const guardada = naFilaDe(item.id, serie);
    const registro = guardada
      ? { weight_kg: guardada.peso, reps_done: guardada.reps }
      : cargaDe(item.id, serie);
    // O campo vem vazio, mas com a série equivalente da última vez como
    // sugestão cinza: mostra a referência sem gravar número que o aluno não
    // levantou.
    const anterior = ultima?.series?.find((s) => s.set_number === serie) ?? null;
    const feita = Boolean(registro && (registro.weight_kg != null || registro.reps_done != null));
    const pendente = Boolean(guardada) && !cargaDe(item.id, serie);

    return `
      <div class="serie${feita ? " serie-feita" : ""}${pendente ? " serie-pendente" : ""}" data-serie="${serie}">
        <span class="serie-numero">${serie}ª</span>
        <label class="field field-inline">
          <span>Peso (kg)</span>
          <input type="text" inputmode="decimal" maxlength="6" data-campo="peso"
                 value="${esc(formatarPesoCampo(registro?.weight_kg))}"
                 placeholder="${esc(formatarPesoCampo(anterior?.weight_kg) || "0")}" />
        </label>
        <label class="field field-inline">
          <span>Reps</span>
          <input type="text" inputmode="numeric" maxlength="3" data-campo="reps"
                 value="${esc(registro?.reps_done ?? "")}"
                 placeholder="${esc(anterior?.reps_done ?? item.reps ?? "")}" />
        </label>
        <span class="serie-ok" title="${pendente ? "Guardada no aparelho, ainda não enviada" : ""}">${
          pendente ? "⏳" : feita ? "✓" : ""
        }</span>
      </div>`;
  }

  /* ---------- eventos ---------- */

  function ligarEventos() {
    listaEl.querySelectorAll("[data-campo]").forEach((input) =>
      input.addEventListener("change", () => salvarSerie(input))
    );

    listaEl.querySelectorAll("[data-ver]").forEach((b) =>
      b.addEventListener("click", () => {
        const item = dia.exercicios.find((e) => e.id === b.dataset.ver);
        if (item?.exercicio) detalhe(item);
      })
    );

    listaEl.querySelectorAll("[data-descanso]").forEach((b) =>
      b.addEventListener("click", () => contarDescanso(b))
    );
  }

  async function salvarSerie(input) {
    const linha = input.closest("[data-serie]");
    const cartao = input.closest("[data-item]");
    const item = dia.exercicios.find((e) => e.id === cartao.dataset.item);
    const serie = Number(linha.dataset.serie);

    const peso = numeroOuNulo(linha.querySelector('[data-campo="peso"]').value);
    const reps = inteiroOuNulo(linha.querySelector('[data-campo="reps"]').value);

    if (peso === false || reps === false) {
      avisar("Use só números — por exemplo 22,5 no peso e 10 nas repetições.");
      return;
    }

    salvamentosEmCurso += 1;
    try {
      await enfileirarSerie({
        alunoId, diaId, data: hoje(), itemId: item.id,
        exercicioId: item.exercise_id, serie, peso, reps,
      });
      fila = seriesNaFila(alunoId, diaId, hoje());
      marcarLinha(linha, peso != null || reps != null, true);
      desenharProgresso();
      desenharPendencias();
      const { erro } = await sincronizar();
      await recarregarDoBanco(false);
      const continuaPendente = Boolean(seriesNaFila(alunoId, diaId, hoje())?.[`${item.id}:${serie}`]);
      marcarLinha(linha, peso != null || reps != null, continuaPendente);
      desenharProgresso();
      desenharPendencias();
      if (!continuaPendente) {
        avisar("Série registrada.");
      } else if (erro) {
        avisar(`Série guardada, mas ainda não enviada: ${erro.message}`);
      } else {
        avisar("Sem internet. Série guardada no aparelho — mando sozinho quando a rede voltar.");
      }
    } catch (err) {
      registrarErro(err, { contexto: { acao: "registrarSerie", diaId, itemId: item.id, serie } });
      avisar(err.message);
    } finally {
      salvamentosEmCurso -= 1;
    }
  }

  function marcarLinha(linha, feita, pendente) {
    linha.classList.toggle("serie-feita", feita);
    linha.classList.toggle("serie-pendente", pendente);
    linha.querySelector(".serie-ok").textContent = pendente ? "⏳" : feita ? "✓" : "";
  }

  // Cronômetro de descanso: um botão que conta para trás no próprio rótulo.
  // Sem som e sem notificação — o celular está no bolso ou no chão, e o aluno
  // olha quando quiser.
  const descansos = new Set();
  const pararDescanso = (timer) => { clearInterval(timer); descansos.delete(timer); };
  function contarDescanso(botao) {
    if (botao.dataset.rodando === "1") {
      pararDescanso(Number(botao.dataset.timer));
      botao.dataset.rodando = "0";
      botao.textContent = `Descansar ${botao.dataset.descanso}s`;
      return;
    }

    let restam = Number(botao.dataset.descanso);
    botao.dataset.rodando = "1";
    botao.textContent = `${restam}s — toque para parar`;

    const timer = setInterval(() => {
      restam -= 1;
      if (restam > 0) {
        botao.textContent = `${restam}s — toque para parar`;
        return;
      }
      pararDescanso(timer);
      botao.dataset.rodando = "0";
      botao.textContent = "Descanso acabou — próxima série";
    }, 1000);

    descansos.add(timer);
    botao.dataset.timer = String(timer);
  }

  async function mostrarRealizado() {
    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Treino realizado</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <div class="empty">Carregando…</div>`;
    dialogo.showModal();
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) =>
      b.addEventListener("click", () => dialogo.close())
    );

    let corpo;
    try {
      const feitos = await db.historicoDeSessoes(alunoId, { de: hoje(), ate: hoje() });
      const feito = feitos.find((s) => s.id === sessao?.id);
      corpo = feito
        ? cartaoDeSessaoRealizada(feito, { aberto: true })
        : `<div class="empty">Este treino ainda não terminou de chegar ao servidor.</div>`;
    } catch (err) {
      registrarErro(err, { contexto: { acao: "verTreinoRealizado", diaId, sessaoId: sessao?.id } });
      corpo = `<div class="alert" role="alert">Não foi possível carregar agora. Ele também fica na sua Frequência.</div>`;
    }
    if (!dialogo.open) return;

    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">Treino realizado</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      ${corpo}
      <div class="dialog-actions">
        <a class="btn" href="#/aluno/frequencia">Ver todos na Frequência</a>
        <button type="button" class="btn" data-fechar>Fechar</button>
      </div>`;
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) =>
      b.addEventListener("click", () => dialogo.close())
    );
  }

  function detalhe(item) {
    const ex = item.exercicio;
    const video = videoSeguro(ex.video_url);
    const foto = urlDeImagemSegura(ex.photo_url) || capaDoVideo(video);

    dialogoConteudo.innerHTML = `
      <div class="dialog-top">
        <span class="eyebrow">${esc(ex.muscle_group || "Exercício")} · ${esc(ex.equipment || "Livre")}</span>
        <button class="dialog-close" data-fechar aria-label="Fechar">×</button>
      </div>
      <h2>${esc(ex.name)}</h2>
      <p class="muted small">
        Seu professor pediu ${item.sets} × ${esc(item.reps ?? "—")}${item.rest_seconds ? `, com ${item.rest_seconds}s de descanso` : ""}.
      </p>
      ${foto ? `<div class="exercise-demo"><img src="${esc(foto)}" alt="${esc(ex.name)}" /></div>` : ""}
      ${video ? `<div class="video-embed"><iframe src="${esc(urlDeEmbed(video))}" title="Vídeo de ${esc(ex.name)}" allowfullscreen loading="lazy"></iframe></div>` : ""}
      <section class="how-to">
        <div class="eyebrow">Passo a passo</div>
        <h3>Como executar</h3>
        ${ex.how_to
          ? `<ol>${ex.how_to.split(/\n+/).filter(Boolean).map((p) => `<li>${esc(p.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol>`
          : `<p class="muted">Seu professor ainda não escreveu as orientações deste exercício.</p>`}
      </section>
      <div class="dialog-actions"><button type="button" class="btn" data-fechar>Fechar</button></div>`;

    dialogo.showModal();

    // O vídeo continua tocando atrás do diálogo fechado se ninguém tirar o
    // iframe do DOM.
    const fechar = () => {
      dialogoConteudo.querySelector("iframe")?.remove();
      dialogo.close();
    };
    dialogoConteudo.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
    dialogo.addEventListener("close", () => dialogoConteudo.querySelector("iframe")?.remove(), { once: true });
  }

  desenharProgresso();
  desenharExercicios();
  desenharFim();
  desenharPendencias();

  // A fila também é enviada pelo temporizador de `sync.js`, fora desta tela.
  // Quando isso acontece, a tela precisa deixar de mostrar "guardado".
  let atualizacaoDaFila = null;
  const aoMudarFila = () => {
    if (!alvo.isConnected || salvamentosEmCurso) return;
    clearTimeout(atualizacaoDaFila);
    atualizacaoDaFila = setTimeout(recarregarDoBanco, 50);
  };
  window.addEventListener("lpt:fila", aoMudarFila);
  return () => {
    clearTimeout(atualizacaoDaFila);
    descansos.forEach(clearInterval);
    descansos.clear();
    window.removeEventListener("lpt:fila", aoMudarFila);
  };
}

/* ---------- números ---------- */

// O mesmo banner preto que o professor vê no editor, com a arte que ele
// escolheu para esta divisão. O aluno abre o treino e reconhece a divisão pela
// figura antes de ler o nome — que é o motivo de a arte existir.
//
// Sem arte escolhida o banner continua preto, só sem figura: virar um cabeçalho
// branco quando falta a imagem faria a tela mudar de cara sem motivo aparente
// para o aluno.
function bannerDoDia(dia) {
  const arte = caminhoDoBanner(dia.banner);
  return `
    <div class="card card-com-banner" style="margin-top:var(--sp-4)">
      <div class="dia-banner">
        <div class="dia-banner-texto">
          <div class="eyebrow" style="color:#a3a3a3">Treino de ${formatarData(hoje())}</div>
          <h3 style="font-size:26px;letter-spacing:-.03em">${esc(dia.label)}</h3>
          <div class="small">
            ${plural(dia.exercicios.length, "exercício", "exercícios")} ·
            ${plural(totalDeSeries(dia), "série", "séries")} no total
          </div>
        </div>
        ${arte ? `<img class="dia-banner-arte" src="${esc(arte)}" alt="" aria-hidden="true" />` : ""}
      </div>
    </div>`;
}

function totalDeSeries(dia) {
  return dia.exercicios.reduce((t, e) => t + (e.sets ?? 0), 0);
}

// Devolve null para campo vazio e false para lixo digitado. O peso aceita
// vírgula: é assim que o teclado do celular brasileiro oferece o decimal.
function numeroOuNulo(texto) {
  const limpo = String(texto).trim().replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 && n <= 999 ? n : false;
}

function inteiroOuNulo(texto) {
  const limpo = String(texto).trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : false;
}

function formatarPeso(kg) {
  if (kg == null) return "peso livre";
  return `${String(kg).replace(".", ",")} kg`;
}

function formatarPesoCampo(kg) {
  if (kg == null) return "";
  return String(kg).replace(".", ",");
}
