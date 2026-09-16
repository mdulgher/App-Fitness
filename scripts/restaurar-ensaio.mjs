// Restaura um snapshot de `backups/` no projeto Supabase de ENSAIO (EXP-00).
//
// É a metade que faltava do OP-01: um backup que nunca foi restaurado não é
// backup, é um arquivo. Aqui o snapshot volta a virar banco, e as contagens são
// conferidas contra o manifesto.
//
//   node scripts/restaurar-ensaio.mjs                 # usa o snapshot mais recente
//   node scripts/restaurar-ensaio.mjs 2026-09-16T...  # usa um específico
//
// O que este script resolve e o export não resolvia: `auth.users`. O snapshot
// não traz login nenhum, e `profiles.id` referencia `auth.users(id)` — sem
// recriar as contas com o MESMO id, nada entra. A API admin aceita `id` na
// criação (sondado em 16/09), então o grafo inteiro se mantém.
//
// O que continua impossível: as senhas. Hash não sai pelo export nem pela API.
// Todas as contas restauradas recebem uma senha nova, comum, gravada em
// CREDENCIAIS-ENSAIO.local.md. Para fixtures isso serve; para um restore de
// produção de verdade, significa que todo mundo sairia com senha trocada — é a
// limitação que mantém o OP-01 aberto, e ela fica registrada aqui em vez de ser
// descoberta no dia do desastre.
//
// SEMPRE limpa o ensaio antes de restaurar, para o resultado ser o snapshot e
// não uma mistura. Recusa rodar se o alvo for produção.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { SUPABASE } from "../js/config.js";

const raiz = path.resolve(import.meta.dirname, "..");
const md = await fs.readFile(path.join(raiz, "CREDENCIAIS-ENSAIO.local.md"), "utf8");
const url = md.match(/\| URL \| (\S+) \|/)?.[1];
const ref = md.match(/\| ref \| (\S+) \|/)?.[1];
const senhaBanco = md.match(/Senha do banco \| `([^`]+)`/)?.[1];
const secret = md.match(/secret key[^|]*\| `([^`]+)`/)?.[1];
if (!url || !ref || !senhaBanco || !secret) throw new Error("CREDENCIAIS-ENSAIO.local.md incompleto.");

if (ref === new URL(SUPABASE.url).hostname.split(".")[0]) {
  throw new Error("RECUSADO: o alvo é o projeto de produção.");
}

const pastaBackups = path.join(raiz, "backups");
const escolhido = process.argv[2] ?? (await fs.readdir(pastaBackups)).filter((d) => !d.endsWith("INCOMPLETO")).sort().pop();
const origem = path.join(pastaBackups, escolhido);
const manifesto = JSON.parse(await fs.readFile(path.join(origem, "manifesto.json"), "utf8"));
console.log(`Snapshot: ${escolhido} (gerado ${manifesto.gerado_em})`);
console.log(`Alvo: ${ref}\n`);

const ler = async (tabela) => JSON.parse(await fs.readFile(path.join(origem, `${tabela}.json`), "utf8"));

// Pais antes de filhos. A ordem não é estética: `exercise_logs` referencia
// sessão, aluno, item prescrito e exercício ao mesmo tempo.
const ORDEM = [
  "exercises", "profiles", "students", "trainer_settings", "workout_plans",
  "workout_days", "workout_day_exercises", "attendance", "exercise_logs",
  "notes", "payments", "student_exercises", "class_packages", "sale_requests", "app_errors",
];

const cliente = new pg.Client({
  host: `db.${ref}.supabase.co`, port: 5432, user: "postgres",
  password: senhaBanco, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await cliente.connect();

// --- limpeza ---
await cliente.query(`truncate table ${ORDEM.map((t) => `public.${t}`).join(", ")} cascade;`);
await cliente.query("delete from auth.users;");
console.log("Ensaio limpo (tabelas e contas).\n");

// --- contas de login ---
const perfis = await ler("profiles");
const senhaComum = `Ensaio#${crypto.randomBytes(6).toString("hex")}`;
const H = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

let criadas = 0;
const semEmail = [];
for (const p of perfis) {
  if (!p.email) { semEmail.push(p.id); continue; }
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ id: p.id, email: p.email, password: senhaComum, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`conta ${p.id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  criadas++;
}
console.log(`Contas recriadas: ${criadas}${semEmail.length ? ` (${semEmail.length} perfis sem email, sem conta)` : ""}`);

// --- dados ---
// `handle_new_user` já criou uma linha em `profiles` para cada conta, sempre
// como 'student'. Por isso profiles entra com upsert: o papel verdadeiro (e o
// nome, telefone, avatar) vem do snapshot, não do gatilho.
const contagem = {};
for (const tabela of ORDEM) {
  const linhas = await ler(tabela);
  if (!linhas.length) { contagem[tabela] = 0; continue; }
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const lista = colunas.map((c) => `"${c}"`).join(", ");

  for (const linha of linhas) {
    const valores = colunas.map((c) => linha[c] ?? null);
    const marcadores = colunas.map((_, i) => `$${i + 1}`).join(", ");
    const atualiza = colunas.filter((c) => c !== "id").map((c) => `"${c}" = excluded."${c}"`).join(", ");
    await cliente.query(
      `insert into public.${tabela} (${lista}) values (${marcadores})` +
      (colunas.includes("id") && atualiza ? ` on conflict (id) do update set ${atualiza}` : ""),
      valores
    );
  }
  contagem[tabela] = linhas.length;
}

// --- conferência: o que voltou é o que saiu? ---
console.log("\nTabela                    snapshot  restaurado");
let divergiu = 0;
for (const tabela of ORDEM) {
  const { rows } = await cliente.query(`select count(*)::int as n from public.${tabela}`);
  const esperado = manifesto.contagem[tabela] ?? 0;
  const bate = rows[0].n === esperado;
  if (!bate) divergiu++;
  console.log(`  ${tabela.padEnd(24)} ${String(esperado).padStart(6)}  ${String(rows[0].n).padStart(9)}${bate ? "" : "   <-- DIVERGE"}`);
}
await cliente.end();

if (divergiu) {
  console.error(`\n${divergiu} tabela(s) com contagem diferente. Restore NÃO confere.`);
  process.exit(1);
}

console.log(`\nOK: restore confere com o manifesto em todas as ${ORDEM.length} tabelas.`);
console.log(`Senha comum das contas restauradas: ${senhaComum}`);
console.log("Anote em CREDENCIAIS-ENSAIO.local.md. As senhas originais NÃO voltam — é a limitação conhecida do OP-01.");
