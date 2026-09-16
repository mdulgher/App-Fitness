// Backfill do AT-12: copia a meta semanal do cadastro para a ficha.
//
// A decisão de 16/09/2026 é que a meta é da ficha (`workout_plans.weekly_target`)
// e que `students.weekly_target` deixa de ser lido. A maioria das fichas tinha
// meta nula e vinha sendo exibida com o valor do cadastro; sem este passo, elas
// passariam de "4 treinos por semana" para "sem meta" no dia em que o fallback
// saiu — perda silenciosa de um combinado real.
//
// Só preenche ficha com meta nula, e só a partir do cadastro do próprio aluno.
// Nunca sobrescreve meta já definida, nunca toca em modelo (`is_template`, que
// não tem aluno) e nunca inventa número: aluno sem meta no cadastro fica sem
// meta na ficha, que é a resposta honesta.
//
// Roda como o professor, pelas mesmas RLS do app — de propósito. Um backfill
// com `service_role` provaria menos: passaria mesmo se a política do professor
// estivesse errada.
//
//   node scripts/backfill-meta-da-ficha.mjs             # simulação (padrão)
//   node scripts/backfill-meta-da-ficha.mjs --aplicar   # grava
//
// Não imprime nome, email nem senha: só contagens e o id da ficha.
import fs from "node:fs/promises";
import { SUPABASE } from "../js/config.js";

const aplicar = process.argv.includes("--aplicar");

const credenciais = await fs.readFile(new URL("../CREDENCIAIS.local.md", import.meta.url), "utf8");
const secao = credenciais.split("## Professor")[1]?.split("## Alunos")[0];
const par = secao?.match(/\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
if (!par) throw new Error("Formato de credenciais não reconhecido.");

const login = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: par[1], password: par[2] }),
});
if (!login.ok) throw new Error(`Login: HTTP ${login.status}`);
const sessao = await login.json();
const headers = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.access_token}` };

const pegar = async (caminho) => {
  const r = await fetch(`${SUPABASE.url}/rest/v1/${caminho}`, { headers });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status}`);
  return r.json();
};

const fichas = await pegar("workout_plans?select=id,student_id,weekly_target,is_template");
const alunos = await pegar("students?select=id,weekly_target");
const metaDoCadastro = new Map(alunos.map((a) => [a.id, a.weekly_target]));

const semMeta = fichas.filter((f) => f.weekly_target == null && !f.is_template && f.student_id);
const aPreencher = semMeta
  .map((f) => ({ id: f.id, meta: metaDoCadastro.get(f.student_id) ?? null }))
  .filter((f) => f.meta != null);
const semOrigem = semMeta.length - aPreencher.length;

console.log(JSON.stringify({
  modo: aplicar ? "aplicar" : "simulação",
  fichas: fichas.length,
  modelos: fichas.filter((f) => f.is_template).length,
  jaComMeta: fichas.filter((f) => f.weekly_target != null).length,
  semMeta: semMeta.length,
  aPreencher: aPreencher.length,
  semMetaNoCadastro: semOrigem,
  metas: aPreencher.reduce((c, f) => ({ ...c, [f.meta]: (c[f.meta] ?? 0) + 1 }), {}),
}, null, 2));

if (!aplicar) {
  console.log("Simulação: nada foi gravado. Repita com --aplicar para gravar.");
  process.exit(0);
}

let gravadas = 0;
for (const f of aPreencher) {
  // `weekly_target=is.null` na condição: se outra pessoa definiu a meta entre a
  // leitura e agora, a escrita não pega nada em vez de sobrescrever.
  const r = await fetch(
    `${SUPABASE.url}/rest/v1/workout_plans?id=eq.${f.id}&weekly_target=is.null`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ weekly_target: f.meta }),
    }
  );
  if (!r.ok) { console.log(JSON.stringify({ ficha: f.id, erro: r.status })); continue; }
  const linhas = await r.json();
  if (linhas.length) gravadas += 1;
  else console.log(JSON.stringify({ ficha: f.id, pulada: "meta deixou de ser nula" }));
}

const depois = await pegar("workout_plans?select=id,weekly_target,is_template,student_id");
const restam = depois.filter((f) => f.weekly_target == null && !f.is_template && f.student_id).length;
console.log(JSON.stringify({ gravadas, restamSemMeta: restam, esperado: semOrigem }));
if (restam !== semOrigem) throw new Error("Sobrou ficha sem meta além das que não tinham origem.");
console.log("OK backfill AT-12");
