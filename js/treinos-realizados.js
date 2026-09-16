// Treinos realizados — a leitura do que o aluno de fato fez.
//
// Existe por causa de um mal-entendido concreto, visto no teste com o iPhone em
// 14/09/2026: ao concluir o treino A, o painel passa a sugerir o B, e o aluno lê
// a rotação como "apagou o que eu fiz". Os registros estavam no banco; faltava
// uma tela que os mostrasse.
//
// Reutilizada em três lugares — a lista na Frequência do aluno, a aba do
// professor no perfil dele e o cartão único que abre ao concluir o treino.
// Fica num componente só para as três não passarem a formatar carga de jeitos
// diferentes quando a regra mudar, como já aconteceu com a meta semanal.

import { db } from "./db.js";
import { esc, plural, formatarData, horaDe, textoTempoRelativo } from "./utils.js";
import { registrarErro } from "./log.js";

// Título da sessão. Sessão sem divisão é a maioria no banco real, não a
// exceção: em 15/09/2026 eram 43 de 47 concluídas — 18 aulas presenciais
// (`in_person`, marcadas pelo professor) e 25 marcadas pelo próprio aluno sem
// passar por uma divisão da ficha. Só 4 vinham do fluxo prescrito.
//
// A primeira versão disto escrevia "Divisão removida da ficha" para todas, o
// que era falso em 91% dos casos e assustava sem motivo. E não há como afirmar
// remoção: `attendance.workout_day_id` é `on delete set null`, então divisão
// apagada e divisão que nunca existiu ficam idênticas no banco. Então o texto
// diz o que se sabe, e nada além.
function tituloDaSessao(sessao) {
  if (sessao.divisao) return sessao.divisao;
  if (sessao.in_person) return "Aula com o professor";
  return "Treino sem divisão";
}

// Uma sessão concluída, com as séries por exercício. Vem fechada por padrão: a
// lista inteira aberta viraria uma parede de números onde não se acha nada.
export function cartaoDeSessaoRealizada(sessao, { aberto = false } = {}) {
  // "com o professor" já está no título quando é aula presencial; repetir no
  // subtítulo era ruído.
  const marcadaPeloProfessor = sessao.marked_by === "trainer" && !sessao.in_person;

  return `
    <details class="treino-feito"${aberto ? " open" : ""}>
      <summary class="treino-feito-resumo">
        <span class="treino-feito-identidade">
          <span class="list-item-title">${esc(tituloDaSessao(sessao))}</span>
          <span class="muted small">
            ${esc(formatarData(sessao.date))} · ${esc(horaDe(sessao.completed_at))}
            ${marcadaPeloProfessor ? " · marcado pelo professor" : ""}
          </span>
        </span>
        <span class="${sessao.totalDeSeries ? "tag tag-quiet" : "tag"} numeric">
          ${sessao.totalDeSeries
            ? plural(sessao.totalDeSeries, "série", "séries")
            : "sem carga anotada"}
        </span>
      </summary>

      ${sessao.exercicios.length
        ? `<div class="treino-feito-corpo">
             ${sessao.exercicios.map(linhaDoExercicio).join("")}
           </div>`
        : `<div class="treino-feito-corpo">
             <p class="muted small" style="margin:0">
               ${sessao.in_person
                 ? "Aula presencial registrada pelo professor. Carga por exercício não é anotada nessas aulas."
                 : "Presença registrada, sem peso nem repetição anotados neste treino."}
             </p>
           </div>`}
    </details>`;
}

function linhaDoExercicio(ex) {
  return `
    <div class="treino-feito-exercicio">
      <span class="list-item-title">${esc(ex.nome)}</span>
      <span class="numeric small treino-feito-series">
        ${ex.series
          .map((s) => `<span class="treino-feito-serie">${esc(textoDaSerie(s))}</span>`)
          .join("")}
      </span>
    </div>`;
}

// Mesma forma do "Da última vez" na tela de treino, de propósito: é o mesmo
// número, e ler "40 kg × 12" nos dois lugares é o que deixa comparar.
function textoDaSerie(s) {
  if (s.weight_kg == null && s.reps_done == null) return `${s.duration_seconds}s`;
  const peso = s.weight_kg != null ? `${String(s.weight_kg).replace(".", ",")} kg` : "peso livre";
  const reps = s.reps_done != null ? ` × ${s.reps_done}` : "";
  const tempo = s.duration_seconds != null ? ` · ${s.duration_seconds}s` : "";
  return `${peso}${reps}${tempo}`;
}

// A lista. Assíncrona e com estado de carregamento próprio porque o histórico
// cresce sem teto: quem chama decide quando pagar essa consulta — o professor
// paga ao abrir a aba, não ao abrir o perfil do aluno.
export async function renderizarTreinosRealizados(alvo, alunoId, {
  visaoProfessor = false,
  nomeAluno = "",
  limite = 20,
} = {}) {
  alvo.innerHTML = `<div class="empty">Carregando treinos realizados…</div>`;

  let sessoes;
  try {
    sessoes = await db.historicoDeSessoes(alunoId, { limite });
  } catch (err) {
    registrarErro(err, {
      contexto: { tela: "treinos-realizados", acao: "historicoDeSessoes", alunoId },
    });
    if (alvo.isConnected) {
      alvo.innerHTML = `
        <div class="alert" role="alert">
          Não foi possível carregar os treinos realizados. Tente de novo em instantes.
        </div>`;
    }
    return;
  }
  if (!alvo.isConnected) return;

  if (!sessoes.length) {
    alvo.innerHTML = `
      <div class="empty">
        <p>${visaoProfessor
          ? `${esc(nomeAluno || "Este aluno")} ainda não concluiu nenhum treino.`
          : "Você ainda não concluiu nenhum treino."}</p>
        <p class="small">${visaoProfessor
          ? "Cada treino que ele concluir no app aparece aqui, com as cargas."
          : "Ao terminar um treino, toque em “Concluir treino” e ele fica guardado aqui."}</p>
      </div>`;
    return;
  }

  // Quando a lista bate no limite ela não é o total, e dizer "20 treinos
  // concluídos" contradiria o cartão de cima, que conta os 90 dias inteiros.
  const truncada = limite && sessoes.length >= limite;

  alvo.innerHTML = `
    <p class="muted small" style="margin:0 0 var(--sp-3)">
      ${truncada
        ? `Os ${limite} treinos mais recentes`
        : plural(sessoes.length, "treino concluído", "treinos concluídos")} ·
      último ${esc(textoTempoRelativo(sessoes[0].date))}
    </p>
    <div class="stack">
      ${sessoes.map((s, i) => cartaoDeSessaoRealizada(s, { aberto: i === 0 })).join("")}
    </div>`;
}
