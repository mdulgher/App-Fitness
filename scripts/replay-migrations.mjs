// Aplica as migrations do zero no projeto Supabase de ENSAIO (EXP-00).
//
// Para que serve: provar que o repositório reconstrói o banco sozinho. Hoje
// isso nunca foi testado — as 26 migrations foram aplicadas uma a uma, à mão,
// ao longo de dias. Uma que só funcione "na ordem em que foi escrita naquele
// dia" só aparece num replay limpo, e é justamente o que o EXP-01 vai precisar
// quando mexer em tenancy.
//
//   node scripts/replay-migrations.mjs           # aplica o que falta
//   node scripts/replay-migrations.mjs --reset   # zera o schema antes
//
// NUNCA roda contra produção: o alvo sai de CREDENCIAIS-ENSAIO.local.md e o
// script recusa se o ref bater com o de `js/config.js`. Isso não é paranoia —
// `--reset` derruba o schema `public` inteiro, e os dois projetos se parecem na
// linha de comando.
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { SUPABASE } from "../js/config.js";

const raiz = path.resolve(import.meta.dirname, "..");
const resetar = process.argv.includes("--reset");

const md = await fs.readFile(path.join(raiz, "CREDENCIAIS-ENSAIO.local.md"), "utf8");
const senha = md.match(/Senha do banco \| `([^`]+)`/)?.[1];
const ref = md.match(/\| ref \| (\S+) \|/)?.[1];
if (!senha || !ref) throw new Error("CREDENCIAIS-ENSAIO.local.md: faltou `ref` ou `Senha do banco`.");

const refDeProducao = new URL(SUPABASE.url).hostname.split(".")[0];
if (ref === refDeProducao) {
  throw new Error(`RECUSADO: o ref do ensaio (${ref}) é o mesmo da produção. Este script não roda em produção.`);
}

const cliente = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: "postgres",
  password: senha,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await cliente.connect();
console.log(`Alvo: db.${ref}.supabase.co (produção é ${refDeProducao}, intocada)`);

if (resetar) {
  await cliente.query("drop schema if exists public cascade; create schema public;");
  await cliente.query("grant usage on schema public to anon, authenticated, service_role;");
  await cliente.query("grant all on schema public to postgres;");
  console.log("Schema public zerado.");
}

// ---- compatibilidade: objetos que produção tem e o repositório não cria ----
//
// Achado do EXP-00, 16/09/2026. A migration `20260912192948_endurecer_funcoes`
// faz `revoke execute on function public.rls_auto_enable()`, e NENHUMA migration
// cria essa função. Ela existe no banco de produção sem ter vindo daqui — seja
// porque o stack antigo do Supabase a criava, seja como resto da tentativa com
// Lovable (ver CONTEXTO §11). O projeto de ensaio, em Postgres 17, não a tem.
//
// Consequência que importa mais que o conserto: **o repositório não descreve o
// banco inteiro**. O EXP-01 precisa saber disso antes de prometer "replay do
// zero" como critério de aceite.
//
// Aqui ela nasce como stub vazio, só para o `revoke` ter alvo. O ensaio,
// portanto, NÃO tem o comportamento de ligar RLS sozinho em tabela nova — o que
// é mais um motivo para não tratar o ensaio como cópia fiel da produção.
await cliente.query(`
  create or replace function public.rls_auto_enable()
  returns event_trigger language plpgsql as $$ begin end $$;
`);

// A tabela de controle é nossa, não a do CLI do Supabase: aqui o que importa é
// saber o que este script já aplicou neste banco de ensaio.
await cliente.query(`
  create table if not exists public._replay_migrations (
    arquivo text primary key,
    aplicada_em timestamptz not null default now()
  );
`);
const jaAplicadas = new Set(
  (await cliente.query("select arquivo from public._replay_migrations")).rows.map((r) => r.arquivo)
);

const pasta = path.join(raiz, "supabase", "migrations");
const arquivos = (await fs.readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();

let aplicadas = 0;
for (const arquivo of arquivos) {
  if (jaAplicadas.has(arquivo)) continue;
  const sql = await fs.readFile(path.join(pasta, arquivo), "utf8");
  try {
    // Cada migration é uma transação: falha no meio não deixa meia migration
    // aplicada, que é o estado mais difícil de diagnosticar depois.
    await cliente.query("begin");
    await cliente.query(sql);
    await cliente.query("insert into public._replay_migrations (arquivo) values ($1)", [arquivo]);
    await cliente.query("commit");
    aplicadas++;
    console.log(`  ok   ${arquivo}`);
  } catch (erro) {
    await cliente.query("rollback");
    console.error(`  FALHA ${arquivo}`);
    console.error(`        ${erro.message}`);
    if (erro.position) console.error(`        posição ${erro.position}`);
    await cliente.end();
    console.error("\nReplay interrompido. Uma migration que não reaplica do zero é achado do EXP-00,");
    console.error("não motivo para editar a migration antiga: veja se depende de estado criado à mão.");
    process.exit(1);
  }
}

const tabelas = await cliente.query(
  "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
);
await cliente.end();

console.log(`\nOK: ${aplicadas} migrations aplicadas agora, ${arquivos.length} no total no repositório.`);
console.log(`Tabelas em public: ${tabelas.rows.length}`);
console.log(tabelas.rows.map((r) => "  " + r.table_name).join("\n"));
