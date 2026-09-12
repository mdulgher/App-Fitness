// Ícones locais: sem dependência de rede, sempre acompanhados por texto.
const paths = {
  painel: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  alunos: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  treino: '<path d="M6 5v14M3 8v8m15-11v14m3-11v8M6 12h12"/>',
  financeiro: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-6 6h3"/>',
  evolucao: '<path d="M4 4v16h16M8 14l4-5 4 2 4-7"/>',
  frequencia: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 5 3 2 6-4"/>',
  recados: '<path d="M21 11a8 8 0 0 1-8 8H6l-3 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM7 8h10M7 12h7"/>',
};
export function icone(nome) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[nome] || paths.treino}</svg>`;
}
