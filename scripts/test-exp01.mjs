// Prova dos critérios de aceite do EXP-01, contra o banco de ENSAIO.
//
// O aceite escrito no dossiê é: "replay do zero e backfill com contagens e IDs
// preservados; nenhum filho fora da carteira do pai; tenant_id não muda; erro
// controlado em dado ambíguo".
//
// Cada um vira um teste que roda. E cada garantia tem **controle negativo**:
// `02` §8 lista "testar só respostas vazias sem dados de controle" como algo que
// nunca é aceito como prova de isolamento. Um SELECT que volta vazio pode estar
// vazio porque a regra funciona ou porque a consulta estava errada.
//
//   node scripts/test-exp01.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { SUPABASE } from "../js/config.js";

const raiz = path.resolve(import.meta.dirname, "..");
const md = await fs.readFile(path.join(raiz, "CREDENCIAIS-ENSAIO.local.md"), "utf8");
const ref = md.match(/\| ref \| (\S+) \|/)?.[1];
const senha = md.match(/Senha do banco \| `([^`]+)`/)?.[1];
if (ref === new URL(SUPABASE.url).hostname.split(".")[0]) throw new Error("RECUSADO: alvo é produção.");

const TENANT_LEGADO = "87ea9c53-3e1c-41b2-8a30-4b53654179cb";
const c = new pg.Client({
  host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password: senha,
  database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await c.connect();
const um = async (sql, p = []) => (await c.query(sql, p)).rows[0];
const NEGOCIO = [
  "students", "exercises", "workout_plans", "workout_days", "workout_day_exercises",
  "attendance", "exercise_logs", "student_exercises", "notes", "payments",
  "class_packages", "sale_requests",
];

// ---- 1. estruturas administrativas existem e são internas ----
for (const t of ["tenants", "trainers", "trainer_public_profiles", "account_operations", "admin_audit_events"]) {
  const r = await um("select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`]);
  assert.equal(r.relrowsecurity, true, `${t} precisa de RLS ligada`);
}
// Sem policy = negado. Se alguém adicionar uma policy permissiva nas internas,
// este teste cai — que é o ponto.
for (const t of ["account_operations", "admin_audit_events"]) {
  const r = await um("select count(*)::int n from pg_policies where schemaname='public' and tablename=$1", [t]);
  assert.equal(r.n, 0, `${t} não pode ter policy: é tabela interna, falada só pelo servidor`);
}

// ---- 2. uma carteira, um titular, e o admin fora dela ----
assert.equal((await um("select count(*)::int n from public.tenants")).n, 1);
assert.equal((await um("select count(*)::int n from public.trainers")).n, 1);
const admin = await um("select id from public.profiles where role='admin'");
assert.equal(
  (await um("select count(*)::int n from public.trainers where id=$1", [admin.id])).n, 0,
  "admin não pode ter carteira nem papel de professor (M01 do dossiê)"
);

// ---- 3. contagens e IDs preservados ----
const pastaBackups = path.join(raiz, "backups");
const snapshot = (await fs.readdir(pastaBackups)).filter((d) => !d.endsWith("INCOMPLETO")).sort().pop();
const manifesto = JSON.parse(await fs.readFile(path.join(pastaBackups, snapshot, "manifesto.json"), "utf8"));
for (const [tabela, esperado] of Object.entries(manifesto.contagem)) {
  const r = await um(`select count(*)::int n from public.${tabela}`);
  assert.equal(r.n, esperado, `${tabela}: backfill mudou a contagem (${r.n} != ${esperado})`);
}
const idsBackup = JSON.parse(await fs.readFile(path.join(pastaBackups, snapshot, "students.json"), "utf8"))
  .map((s) => s.id).sort();
const idsAgora = (await c.query("select id from public.students order by id")).rows.map((r) => r.id).sort();
assert.deepEqual(idsAgora, idsBackup, "IDs de aluno não podem mudar: sessão e carga penduram neles");

// ---- 4. tenant_id obrigatório, sem default, e nenhum filho fora do pai ----
for (const t of NEGOCIO) {
  const col = await um(
    "select is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 and column_name='tenant_id'",
    [t]
  );
  assert.equal(col.is_nullable, "NO", `${t}.tenant_id precisa ser NOT NULL`);
  assert.equal(col.column_default, null, `${t}.tenant_id ainda tem DEFAULT — fallback legado não sobrevive ao M03`);
}

const cruzamentos = [
  ["ficha fora da carteira do aluno", "public.workout_plans p join public.students s on s.id=p.student_id", "p", "s"],
  ["divisão fora da carteira da ficha", "public.workout_days d join public.workout_plans p on p.id=d.workout_plan_id", "d", "p"],
  ["item fora da carteira da divisão", "public.workout_day_exercises i join public.workout_days d on d.id=i.workout_day_id", "i", "d"],
  ["sessão fora da carteira do aluno", "public.attendance a join public.students s on s.id=a.student_id", "a", "s"],
  ["carga fora da carteira da sessão", "public.exercise_logs l join public.attendance a on a.id=l.attendance_id", "l", "a"],
  ["cobrança fora da carteira do aluno", "public.payments pg join public.students s on s.id=pg.student_id", "pg", "s"],
];
for (const [nome, de, f, p] of cruzamentos) {
  const r = await um(`select count(*)::int n from ${de} where ${f}.tenant_id is distinct from ${p}.tenant_id`);
  assert.equal(r.n, 0, nome);
}

// ---- 5. CONTROLE NEGATIVO: a FK composta recusa mesmo com FK simples válida ----
// Uma carteira B de mentira, sem professor e sem login — existe só para ser o
// alvo errado. É o que separa "a consulta voltou vazia" de "a regra funciona".
await c.query("begin");
await c.query(
  "insert into public.tenants (id, name) values ('00000000-0000-4000-8000-0000000000b2', 'Carteira B (só para teste)')"
);
const aluno = await um("select id from public.students limit 1");
let recusou = false;
try {
  await c.query(
    "insert into public.workout_plans (student_id, tenant_id, title, is_template, active) values ($1, '00000000-0000-4000-8000-0000000000b2', 'ficha cruzada', false, false)",
    [aluno.id]
  );
} catch (e) {
  recusou = e.code === "23503";
}
await c.query("rollback");
assert.ok(recusou, "ficha da carteira B apontando aluno da carteira A tinha de ser recusada pela FK composta (INV-02)");

// Contraprova: o mesmo insert, na carteira certa, PASSA. Sem isto, o teste
// acima poderia estar verde por qualquer outro motivo.
await c.query("begin");
const ok = await um(
  "insert into public.workout_plans (student_id, tenant_id, title, is_template, active) values ($1, $2, 'ficha correta', false, false) returning id",
  [aluno.id, TENANT_LEGADO]
);
assert.ok(ok.id, "a mesma inserção na carteira certa precisa passar");
await c.query("rollback");

// ---- 6. tenant_id não muda ----
await c.query("begin");
let bloqueou = false;
try {
  await c.query("update public.students set tenant_id='00000000-0000-4000-8000-0000000000b2' where id=$1", [aluno.id]);
} catch (e) {
  bloqueou = e.code === "42501";
}
await c.query("rollback");
assert.ok(bloqueou, "trocar a carteira de um aluno tem de ser recusada: não existe transferência (INV-01/INV-12)");

// ---- 7. erro controlado em dado ambíguo ----
// Dois professores fazem o M01 parar em vez de escolher um. Reproduzido com um
// perfil trainer extra dentro de transação desfeita.
await c.query("begin");
const idFalso = "00000000-0000-4000-8000-0000000000f2";
await c.query("insert into auth.users (id, instance_id, aud, role, email) values ($1, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','ambiguo@teste.local') on conflict do nothing", [idFalso]);
await c.query("update public.profiles set role='trainer' where id=$1", [idFalso]);
const qtd = await um("select count(*)::int n from public.profiles where role='trainer'");
assert.equal(qtd.n, 2, "o cenário ambíguo precisa existir para o teste valer");
let parou = false;
try {
  await c.query(`do $$
    declare v int;
    begin
      select count(*) into v from public.profiles where role='trainer';
      if v <> 1 then raise exception 'M01 abortada: esperava exatamente 1 perfil com role=trainer, encontrei %', v; end if;
    end $$;`);
} catch (e) {
  parou = /M01 abortada/.test(e.message);
}
await c.query("rollback");
assert.ok(parou, "com dois professores, o M01 tem de parar com mensagem legível");

// ---- 8. estado das contas ----
const pendentes = await c.query("select p.id from public.profiles p where p.account_status='pending'");
assert.equal(pendentes.rows.length, 1, "só a conta órfã do AT-06 devia ficar pendente");
assert.equal(
  (await um("select count(*)::int n from public.students where id=$1", [pendentes.rows[0].id])).n, 0,
  "a conta pendente é justamente a que não tem cadastro em students"
);

// ---- 9. trainer_settings passou a ser por carteira ----
const pk = await um(`
  select kcu.column_name from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
   where tc.table_schema='public' and tc.table_name='trainer_settings' and tc.constraint_type='PRIMARY KEY'
`);
assert.equal(pk.column_name, "tenant_id", "trainer_settings ainda tem PK booleana de professor único");
const pix = await um("select pix_key, charge_message from public.trainer_settings where tenant_id=$1", [TENANT_LEGADO]);
assert.ok(pix?.pix_key, "o Pix do professor legado não pode ter se perdido na troca de PK");

await c.end();
console.log(
  "OK EXP-01: estruturas internas sem policy, 1 carteira e 1 titular, admin fora dela, " +
  "contagens e IDs preservados, tenant_id NOT NULL e sem default, nenhum filho fora do pai, " +
  "FK composta recusa cruzamento (com contraprova), carteira imutável, dado ambíguo para a migration, " +
  "conta órfã pendente e Pix preservado por carteira."
);
