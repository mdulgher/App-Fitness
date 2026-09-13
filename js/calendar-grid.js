// Renderização de calendário de frequência.
// Reutilizável: é usada em aluno-frequencia.js (com cliques para desmarcar) e
// em professor-aluno.js (read-only).

import { esc, formatarData, hoje } from "./utils.js";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ROTULOS = ["S", "T", "Q", "Q", "S", "S", "D"];

// Renderiza um calendário do mês e ano dados.
// diasTreinados: Map<string (ISO), sessao>
// onClickDia: callback(sessaoId, data) quando clica em um dia, ou null para ler-só
// Retorna: HTML da grade
export function renderizarCalendario(ano, mes, diasTreinados, onClickDia = null) {
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const deslocamento = (new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay() + 6) % 7;

  const celulas = [];

  // Cabeçalho com rótulos de dias
  ROTULOS.forEach((r) => celulas.push(`<span class="dia-rotulo">${r}</span>`));

  // Dias vazios antes do mês
  for (let i = 0; i < deslocamento; i++) {
    celulas.push(`<span class="dia-celula vazia"></span>`);
  }

  // Dias do mês
  for (let d = 1; d <= diasNoMes; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const sessao = diasTreinados.get(iso);
    const classes = ["dia-celula"];

    if (sessao && sessao.completed_at) {
      classes.push("treinou");
    }
    if (iso === hoje()) {
      classes.push("hoje");
    }

    const dataStr = formatarData(iso);
    const clicavel = onClickDia && sessao ? ` style="cursor:pointer" data-sessao="${sessao.id}" data-data="${iso}"` : "";
    celulas.push(`
      <span class="${classes.join(" ")}" title="${esc(dataStr)}"${clicavel}>
        ${d}
      </span>`);
  }

  return celulas.join("");
}

export function nomeDoMes(mes, ano) {
  return `${MESES[mes - 1]} de ${ano}`;
}
