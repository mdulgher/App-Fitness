// O PostgREST/Supabase limita a quantidade de linhas por resposta. Uma
// consulta sem paginação pode parecer completa e, ao passar desse limite,
// simplesmente perder o restante sem erro. Este helper percorre intervalos
// explícitos e só termina quando recebe uma página incompleta.

export const TAMANHO_DA_PAGINA = 500;
const MAXIMO_DE_PAGINAS = 2000;

export async function buscarTodasAsPaginas(criarConsulta, {
  tamanho = TAMANHO_DA_PAGINA,
  maximoDePaginas = MAXIMO_DE_PAGINAS,
} = {}) {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new Error("O tamanho da página precisa ser um inteiro positivo.");
  }

  const todas = [];
  for (let pagina = 0; pagina < maximoDePaginas; pagina += 1) {
    const inicio = pagina * tamanho;
    const resposta = await criarConsulta().range(inicio, inicio + tamanho - 1);
    if (resposta.error) throw new Error(resposta.error.message);

    const linhas = resposta.data ?? [];
    todas.push(...linhas);
    if (linhas.length < tamanho) return todas;
  }

  throw new Error(
    "A consulta ultrapassou o limite interno de paginação. Refine o período antes de continuar."
  );
}
