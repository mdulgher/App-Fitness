// Testes de segurança contra o Supabase real. Não imprime senhas, tokens nem
// dados pessoais e não altera dados de negócio. A única tentativa de escrita é
// uma promoção de papel que deve ser recusada antes de chegar ao banco.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { SUPABASE } from "../js/config.js";

const credenciaisPrincipais = await fs.readFile(new URL("../CREDENCIAIS.local.md", import.meta.url), "utf8");
const credenciaisDeTeste = await fs.readFile(new URL("../SENHAS-TESTE.local.md", import.meta.url), "utf8");

// As contas vêm da seção, não da posição no arquivo. Ler "a segunda linha da
// tabela" já deu falso positivo: uma seção nova de administrador entrou antes
// dos alunos, o "aluno A" do teste virou o admin, e o teste acusou vazamento
// onde havia só um admin fazendo o trabalho dele. Pior seria o contrário —
// passar verde testando a conta errada.
function contasDaSecao(texto, titulo) {
  const corpo = texto.split(new RegExp(`^##\\s+${titulo}\\s*$`, "m"))[1]?.split(/^## /m)[0] ?? "";
  return [...corpo.matchAll(/\|\s*`([^`\s]+@[^`\s]+)`\s*\|\s*`([^`]+)`\s*\|/g)]
    .map((m) => ({ email: m[1], senha: m[2] }));
}

const alunosDeTeste = contasDaSecao(credenciaisDeTeste, "Alunos de teste");
const linhas = [...contasDaSecao(credenciaisPrincipais, "Professor"), ...alunosDeTeste];
assert.ok(alunosDeTeste.length >= 2, "São necessárias as credenciais de pelo menos dois alunos de teste.");

const cabecalhoAnon = { apikey: SUPABASE.anonKey, "Content-Type": "application/json" };

async function requisitar(caminho, { token, ...opcoes } = {}) {
  const headers = { ...cabecalhoAnon, ...(opcoes.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resposta = await fetch(`${SUPABASE.url}${caminho}`, { ...opcoes, headers });
  const textoResposta = await resposta.text();
  let corpo = null;
  try { corpo = textoResposta ? JSON.parse(textoResposta) : null; } catch { corpo = textoResposta; }
  return { status: resposta.status, ok: resposta.ok, corpo };
}

async function entrar({ email, senha }) {
  const r = await requisitar("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password: senha }),
  });
  assert.equal(r.ok, true, `Falha no login de uma conta de teste: HTTP ${r.status}`);
  return { token: r.corpo.access_token, id: r.corpo.user.id };
}

for (const tabela of [
  "profiles", "students", "workout_plans", "workout_days",
  "workout_day_exercises", "attendance", "exercise_logs", "payments",
  "notes", "trainer_settings", "app_errors",
]) {
  const r = await requisitar(`/rest/v1/${tabela}?select=*&limit=1`);
  assert.ok([401, 403].includes(r.status), `${tabela} ainda está acessível anonimamente (HTTP ${r.status}).`);
}

const rpcAnon = await requisitar("/rest/v1/rpc/ativar_ficha", {
  method: "POST",
  body: JSON.stringify({ p_ficha_id: crypto.randomUUID() }),
});
assert.ok([401, 403, 404].includes(rpcAnon.status), `RPC ativar_ficha aceitou acesso anônimo: HTTP ${rpcAnon.status}.`);

const [alunoA, alunoB] = await Promise.all([entrar(alunosDeTeste[0]), entrar(alunosDeTeste[1])]);

for (const [tabela, filtro] of [
  ["profiles", `id=eq.${alunoB.id}`],
  ["students", `id=eq.${alunoB.id}`],
  ["workout_plans", `student_id=eq.${alunoB.id}`],
  ["attendance", `student_id=eq.${alunoB.id}`],
  ["exercise_logs", `student_id=eq.${alunoB.id}`],
  ["payments", `student_id=eq.${alunoB.id}`],
  ["notes", `student_id=eq.${alunoB.id}`],
  ["student_exercises", `student_id=eq.${alunoB.id}`],
]) {
  const r = await requisitar(`/rest/v1/${tabela}?select=*&${filtro}&limit=1`, { token: alunoA.token });
  assert.equal(r.ok, true, `${tabela}: consulta do aluno falhou com HTTP ${r.status}.`);
  assert.deepEqual(r.corpo, [], `${tabela}: um aluno conseguiu ler dados de outro aluno.`);
}

const proprio = await requisitar(`/rest/v1/profiles?select=id,role&id=eq.${alunoA.id}`, { token: alunoA.token });
assert.equal(proprio.ok, true);
assert.equal(proprio.corpo?.[0]?.id, alunoA.id, "O aluno não consegue ler o próprio perfil.");
assert.equal(proprio.corpo?.[0]?.role, "student", "A conta de teste deixou de ser aluno.");

const pixAutenticado = await requisitar("/rest/v1/trainer_settings?select=id&limit=1", { token: alunoA.token });
assert.equal(pixAutenticado.ok, true, `Aluno não consegue ler a configuração PIX: HTTP ${pixAutenticado.status}.`);

const promover = await requisitar(`/rest/v1/profiles?id=eq.${alunoA.id}`, {
  token: alunoA.token,
  method: "PATCH",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ role: "trainer" }),
});
assert.ok([401, 403].includes(promover.status), `CRÍTICO: aluno conseguiu alterar a própria role (HTTP ${promover.status}).`);

const continuaAluno = await requisitar(`/rest/v1/profiles?select=role&id=eq.${alunoA.id}`, { token: alunoA.token });
assert.equal(continuaAluno.corpo?.[0]?.role, "student", "A tentativa de promoção alterou a conta.");

// Bucket de avatares: cada um escreve só na própria pasta. É a barreira que
// impede um aluno de trocar a foto de outro — e o teste limpa o que sobe.
const jpegMinimo = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
  "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");

async function enviarAvatar({ token }, pasta, nome) {
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/avatars/${pasta}/${nome}`, {
    method: "POST",
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: jpegMinimo,
  });
  return r.status;
}

const nomeDoTeste = `${crypto.randomUUID()}.jpg`;
const naPastaDeOutro = await enviarAvatar(alunoA, alunoB.id, nomeDoTeste);
assert.ok([400, 401, 403].includes(naPastaDeOutro),
  `CRÍTICO: um aluno conseguiu escrever na pasta de avatar de outro (HTTP ${naPastaDeOutro}).`);

const naPropriaPasta = await enviarAvatar(alunoA, alunoA.id, nomeDoTeste);
assert.ok(naPropriaPasta === 200, `O aluno não consegue subir o próprio avatar: HTTP ${naPropriaPasta}.`);

const apagar = await fetch(`${SUPABASE.url}/storage/v1/object/avatars/${alunoA.id}/${nomeDoTeste}`, {
  method: "DELETE",
  headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${alunoA.token}` },
});
assert.equal(apagar.ok, true, `O aluno não consegue apagar o próprio avatar: HTTP ${apagar.status}.`);

// Aula presencial é aula paga: quem marca é o professor. Se o aluno conseguisse
// inserir uma linha `in_person`, ele se daria aulas de graça — o saldo do pacote
// cairia sem ninguém ter dado aula nenhuma.
const aulaDeGraca = await requisitar("/rest/v1/attendance", {
  token: alunoA.token,
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    student_id: alunoA.id,
    date: new Date().toISOString().slice(0, 10),
    in_person: true,
    completed_at: new Date().toISOString(),
  }),
});
assert.ok([401, 403].includes(aulaDeGraca.status),
  `CRÍTICO: um aluno conseguiu marcar a própria aula presencial (HTTP ${aulaDeGraca.status}).`);

// E o pacote: o aluno lê o saldo dele, mas não se vende aulas.
const pacoteDeGraca = await requisitar("/rest/v1/class_packages", {
  token: alunoA.token,
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({ student_id: alunoA.id, classes_total: 10, price: 0 }),
});
assert.ok([401, 403].includes(pacoteDeGraca.status),
  `CRÍTICO: um aluno conseguiu criar o próprio pacote de aulas (HTTP ${pacoteDeGraca.status}).`);

const pacoteDoOutro = await requisitar(
  `/rest/v1/class_packages?select=*&student_id=eq.${alunoB.id}&limit=1`, { token: alunoA.token });
assert.deepEqual(pacoteDoOutro.corpo, [], "Um aluno viu o pacote de aulas de outro.");

const senhasAtuaisNoHistorico = linhas.filter(({ senha }) => {
  const busca = spawnSync("git", ["log", "--all", "--format=%H", `-S${senha}`, "--", "."], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  return busca.status === 0 && busca.stdout.trim();
}).length;

console.log("OK: acesso anônimo bloqueado, isolamento entre alunos, promoção de papel recusada, avatar isolado por pasta e aula presencial só do professor.");
console.log(`INFO: ${senhasAtuaisNoHistorico} senha(s) atual(is) de contas de teste aparecem no histórico Git.`);
