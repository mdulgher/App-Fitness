// Prova read-only do AT-01 contra o Supabase real.
//
// Exercita a mesma consulta relacional usada por `historicoDeSessoes`, confirma
// que o professor lê a carteira e que um aluno não lê o histórico de outro.
// Não imprime credenciais, tokens, nomes, emails nem conteúdo das cargas.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { SUPABASE } from "../js/config.js";

function contasDaSecao(texto, titulo) {
  const corpo = texto.split(new RegExp(`^##\\s+${titulo}\\s*$`, "m"))[1]?.split(/^## /m)[0] ?? "";
  return [...corpo.matchAll(/\|\s*`([^`\s]+@[^`\s]+)`\s*\|\s*`([^`]+)`\s*\|/g)]
    .map((m) => ({ email: m[1], senha: m[2] }));
}

const credenciaisPrincipais = await fs.readFile(new URL("../CREDENCIAIS.local.md", import.meta.url), "utf8");
const credenciaisDeTeste = await fs.readFile(new URL("../SENHAS-TESTE.local.md", import.meta.url), "utf8");
const [professor] = contasDaSecao(credenciaisPrincipais, "Professor");
const alunos = contasDaSecao(credenciaisDeTeste, "Alunos de teste");
assert.ok(professor, "Credencial fictícia do professor não encontrada.");
assert.ok(alunos.length >= 2, "São necessárias pelo menos duas contas fictícias de aluno.");

const cabecalhoPublico = { apikey: SUPABASE.anonKey, "Content-Type": "application/json" };

async function requisitar(caminho, token, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE.url}${caminho}`, {
    ...opcoes,
    headers: {
      ...cabecalhoPublico,
      Authorization: `Bearer ${token}`,
      ...(opcoes.headers ?? {}),
    },
  });
  const texto = await resposta.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  assert.equal(resposta.ok, true, `${caminho}: HTTP ${resposta.status}`);
  return corpo;
}

async function entrar({ email, senha }) {
  const resposta = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: cabecalhoPublico,
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await resposta.json();
  assert.equal(resposta.ok, true, `Login de conta fictícia falhou: HTTP ${resposta.status}`);
  return { token: corpo.access_token, id: corpo.user.id };
}

// Mantenha este select igual ao de `historicoDeSessoes`: é justamente a parte
// que pode falhar no banco real por relacionamento ambíguo ou RLS no embutido.
const selectHistorico =
  "id,student_id,date,completed_at,workout_day_id,in_person," +
  "workout_days(label)," +
  "exercise_logs(id,student_id,attendance_id,exercise_id,set_number,weight_kg,reps_done,duration_seconds," +
  "exercises(name,muscle_group))";

async function historico(token, alunoId = null, limite = 200) {
  const filtroAluno = alunoId ? `&student_id=eq.${encodeURIComponent(alunoId)}` : "";
  return requisitar(
    `/rest/v1/attendance?select=${encodeURIComponent(selectHistorico)}` +
    `&completed_at=not.is.null${filtroAluno}&order=date.desc,completed_at.desc&limit=${limite}`,
    token,
  );
}

const sessaoProfessor = await entrar(professor);
const vistosPeloProfessor = await historico(sessaoProfessor.token);
assert.ok(vistosPeloProfessor.length > 0, "O professor não recebeu nenhum treino concluído.");
assert.ok(new Set(vistosPeloProfessor.map((s) => s.student_id)).size >= 2,
  "A prova precisa alcançar pelo menos dois alunos da carteira do professor.");

const cargas = vistosPeloProfessor.flatMap((s) => s.exercise_logs ?? []);
assert.ok(cargas.length > 0, "A consulta embutida não retornou nenhuma carga registrada.");
assert.ok(cargas.some((carga) => carga.exercises?.name),
  "O relacionamento exercise_logs → exercises não trouxe o nome do exercício.");

const comDivisao = vistosPeloProfessor.find((s) => s.workout_day_id != null);
assert.ok(comDivisao, "A prova precisa de ao menos uma sessão vinculada a uma divisão.");
assert.ok(comDivisao.workout_days?.label,
  "O relacionamento attendance → workout_days não trouxe o rótulo da divisão.");

const porAlunoEData = new Map();
for (const sessao of vistosPeloProfessor) {
  const chave = `${sessao.student_id}:${sessao.date}`;
  porAlunoEData.set(chave, [...(porAlunoEData.get(chave) ?? []), sessao.id]);
}
assert.ok([...porAlunoEData.values()].some((ids) => new Set(ids).size >= 2),
  "A base de prova não contém duas sessões separadas do mesmo aluno no mesmo dia.");

const [alunoA, alunoB] = await Promise.all([entrar(alunos[0]), entrar(alunos[1])]);
const proprioHistorico = await historico(alunoA.token, alunoA.id, 30);
assert.ok(proprioHistorico.every((s) => s.student_id === alunoA.id),
  "O histórico próprio retornou sessão de outro aluno.");

const historicoDoOutro = await historico(alunoA.token, alunoB.id, 30);
assert.deepEqual(historicoDoOutro, [], "Um aluno conseguiu ler treinos realizados de outro aluno.");

const fonte = await fs.readFile(new URL("../js/db-supabase.js", import.meta.url), "utf8");
const corpoDaFuncao = fonte.split("export async function historicoDeSessoes")[1]?.split("\nexport ")[0] ?? "";
assert.match(corpoDaFuncao, /workout_days\(label\)/,
  "historicoDeSessoes deixou de embutir workout_days.");
assert.match(corpoDaFuncao, /exercise_logs\(\*, exercises\(name,muscle_group\)\)/,
  "historicoDeSessoes deixou de embutir exercise_logs → exercises.");
assert.match(corpoDaFuncao, /montarSessaoRealizada/,
  "historicoDeSessoes deixou de passar pelo montador usado pela interface.");

console.log(
  "OK AT-01: consulta relacional real, duas sessões no mesmo dia, cargas com exercício, " +
  "leitura da carteira pelo professor e isolamento entre alunos."
);
