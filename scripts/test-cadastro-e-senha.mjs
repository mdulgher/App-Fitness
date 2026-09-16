// AT-06 contra o Supabase real: retomada do cadastro e redefinição de senha.
//
// Exercita as Edge Functions `criar-aluno` e `redefinir-senha-aluno` pelo mesmo
// caminho do app — sessão do professor, chamada HTTP autenticada — porque bater
// no endpoint com `service_role` provaria o servidor e não o que o professor
// vive.
//
// Usa uma conta DESCARTÁVEL, criada e apagada aqui. Nenhum aluno fictício é
// tocado: as oito FKs que apontam para `students` são `on delete cascade`, então
// apagar a linha de um aluno levaria junto presenças, cargas, pagamentos,
// fichas, recados e pacotes dele.
//
// Não imprime email, senha nem token — só o nome do que foi verificado.
import fs from "node:fs/promises";
import { SUPABASE } from "../js/config.js";

const credenciais = await fs.readFile(new URL("../CREDENCIAIS.local.md", import.meta.url), "utf8");

const conta = (secao, ate) => {
  const bloco = credenciais.split(secao)[1]?.split(ate)[0];
  const par = bloco?.match(/\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
  if (!par) throw new Error(`Credenciais não encontradas em ${secao}.`);
  return { email: par[1], senha: par[2] };
};

const entrar = async ({ email, senha }) => {
  const r = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  return r.ok ? (await r.json()).access_token : null;
};

const chamar = async (token, funcao, corpo) => {
  const r = await fetch(`${SUPABASE.url}/functions/v1/${funcao}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

const rest = async (token, caminho, init) => {
  const r = await fetch(`${SUPABASE.url}/rest/v1/${caminho}`, {
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...init,
  });
  return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => []) };
};

const professor = conta("## Professor", "## Administrador");
const tokenProfessor = await entrar(professor);
if (!tokenProfessor) throw new Error("Login do professor falhou.");

const perfilProfessor = await rest(tokenProfessor, "profiles?select=id&role=eq.trainer");
const meuId = perfilProfessor.corpo[0]?.id;
if (!meuId) throw new Error("Não achei o id do professor.");

const verificacoes = [];
const conferir = (nome, condicao) => {
  if (!condicao) throw new Error(`FALHOU: ${nome}`);
  verificacoes.push(nome);
};

/* ---------- recusas: nenhuma delas troca a senha de ninguém ---------- */

// A recusa a um aluno logado é verificada mais abaixo, com a sessão da própria
// conta descartável: as senhas dos alunos fictícios moram em outro arquivo, e
// não há motivo para este teste precisar delas.

const inexistente = await chamar(tokenProfessor, "redefinir-senha-aluno", {
  alunoId: "00000000-0000-4000-8000-000000000000",
});
conferir("id inexistente é recusado (404)", inexistente.status === 404);

// A checagem que impede a porta de virar tomada de conta: o alvo tem de ser
// aluno, mesmo quando quem pede é o professor de verdade.
const contraOProfessor = await chamar(tokenProfessor, "redefinir-senha-aluno", { alunoId: meuId });
conferir(
  "professor não redefine a própria senha por esta porta (403)",
  contraOProfessor.status === 403 && /aluno/i.test(contraOProfessor.corpo.error ?? "")
);

const semAlvo = await chamar(tokenProfessor, "redefinir-senha-aluno", {});
conferir("sem alvo é recusado (400)", semAlvo.status === 400);

/* ---------- conta descartável: cadastro, retomada e redefinição ---------- */

const emailTeste = `at06.${Date.now().toString(36)}@example.com`;
let idTeste = null;

try {
  const criado = await chamar(tokenProfessor, "criar-aluno", {
    full_name: "Conta de teste AT-06",
    email: emailTeste,
    goal: "Saúde geral",
    due_day: 5,
  });
  conferir("cadastro novo responde 201", criado.status === 201);
  conferir("cadastro novo não vem marcado como retomada", criado.corpo.retomado === false);
  conferir(
    "cadastro novo devolve senha utilizável",
    typeof criado.corpo.senha === "string" && criado.corpo.senha.length >= 8
  );
  idTeste = criado.corpo.id;
  const tokenAluno = await entrar({ email: emailTeste, senha: criado.corpo.senha });
  conferir("a senha do cadastro entra no app", Boolean(tokenAluno));

  // Quem está logado como aluno não pode redefinir senha de ninguém — nem a do
  // professor, nem a de outro aluno, nem a própria por esta porta. Sem isso,
  // bastaria abrir o DevTools estando logado como aluno.
  const comoAluno = await chamar(tokenAluno, "redefinir-senha-aluno", { alunoId: meuId });
  conferir("aluno logado não redefine a senha do professor (403)", comoAluno.status === 403);
  const alunoContraSiMesmo = await chamar(tokenAluno, "redefinir-senha-aluno", { alunoId: idTeste });
  conferir("aluno logado não redefine nem a própria senha (403)", alunoContraSiMesmo.status === 403);
  const alunoCriandoConta = await chamar(tokenAluno, "criar-aluno", {
    full_name: "Invasor", email: `invasor.${Date.now().toString(36)}@example.com`,
  });
  conferir("aluno logado não cria conta (403)", alunoCriandoConta.status === 403);

  // `weekly_target` saiu do insert nesta versão. Se a coluna tivesse sido
  // derrubada ANTES desta versão subir, o cadastro acima teria falhado — é a
  // ordem registrada no parking lot, e este teste é o passo 2 dela.
  const linha = await rest(tokenProfessor, `students?select=id,goal&id=eq.${idTeste}`);
  conferir("o registro do aluno existe depois do cadastro", linha.corpo[0]?.id === idTeste);

  // Monta o estado de cadastro interrompido: conta de acesso existe, registro
  // não. Seguro só aqui, porque esta conta não tem histórico para o cascade.
  const removeu = await rest(tokenProfessor, `students?id=eq.${idTeste}`, { method: "DELETE" });
  conferir("preparação do cenário: registro removido", removeu.ok);

  const retomada = await chamar(tokenProfessor, "criar-aluno", {
    full_name: "Conta de teste AT-06",
    email: emailTeste,
    goal: "Hipertrofia",
    due_day: 5,
  });
  conferir("cadastro interrompido é retomado, não recusado", retomada.status === 201);
  conferir("a retomada vem marcada", retomada.corpo.retomado === true);
  conferir("a retomada reusa a mesma conta", retomada.corpo.id === idTeste);
  conferir("a retomada devolve senha nova", retomada.corpo.senha !== criado.corpo.senha);
  conferir(
    "a senha da retomada entra no app",
    Boolean(await entrar({ email: emailTeste, senha: retomada.corpo.senha }))
  );

  const depois = await rest(tokenProfessor, `students?select=goal&id=eq.${idTeste}`);
  conferir("a retomada grava o que o professor preencheu", depois.corpo[0]?.goal === "Hipertrofia");

  // Com o aluno completo de novo, email repetido volta a ser recusa — e a
  // mensagem precisa apontar a saída, senão o professor fica sem caminho.
  const repetido = await chamar(tokenProfessor, "criar-aluno", {
    full_name: "Conta de teste AT-06",
    email: emailTeste,
  });
  conferir("aluno completo recusa email repetido (409)", repetido.status === 409);
  conferir("a recusa aponta o caminho de recuperação", /Redefinir senha/i.test(repetido.corpo.error ?? ""));

  /* ---------- redefinição de senha ---------- */

  const sessaoAntiga = await entrar({ email: emailTeste, senha: retomada.corpo.senha });
  conferir("havia sessão aberta antes da redefinição", Boolean(sessaoAntiga));

  const redefinida = await chamar(tokenProfessor, "redefinir-senha-aluno", { alunoId: idTeste });
  conferir("redefinição responde 200", redefinida.status === 200);
  conferir("redefinição devolve senha diferente da anterior", redefinida.corpo.senha !== retomada.corpo.senha);
  conferir("redefinição afirma ter derrubado as sessões", redefinida.corpo.sessoesEncerradas === true);
  conferir(
    "a senha antiga não entra mais",
    !(await entrar({ email: emailTeste, senha: retomada.corpo.senha }))
  );
  conferir(
    "a senha nova entra",
    Boolean(await entrar({ email: emailTeste, senha: redefinida.corpo.senha }))
  );

  // O que separa "redefinir" de "fingir que redefiniu": senha nova sem derrubar
  // sessão deixa o aparelho antigo logado, que é a armadilha do "Sair" que não
  // saía, de 16/09. Aqui o token de antes tem de estar morto.
  const usoDaSessaoAntiga = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessaoAntiga}` },
  });
  conferir("o token de antes da redefinição não vale mais", !usoDaSessaoAntiga.ok);
} finally {
  // A conta de acesso em si só some com `service_role`, que não mora aqui: o
  // registro do aluno é removido e a conta órfã fica registrada na saída para
  // ser apagada no painel.
  if (idTeste) {
    await rest(tokenProfessor, `students?id=eq.${idTeste}`, { method: "DELETE" });
    console.log(JSON.stringify({ limpeza: "registro removido", contaOrfaParaApagarNoPainel: idTeste }));
  }
}

console.log(verificacoes.map((v) => `  · ${v}`).join("\n"));
console.log(`OK AT-06: ${verificacoes.length} verificações contra o Supabase real.`);
