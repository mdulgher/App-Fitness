// Export completo das tabelas do app para JSON local (OP-01).
//
// Por que existe: o banco de produção não tem desfazer. As migrations são
// rodadas à mão no SQL Editor — três só em 16/09/2026, uma delas um
// `drop column` — e é esse o cenário de perda mais provável neste projeto,
// bem mais que "apagaram um aluno pela tela": o app não tem caminho de
// exclusão de aluno em tela nenhuma.
//
// Rode ANTES de cada migration. É read-only e leva segundos.
//
//   node scripts/backup.mjs
//
// A lista de tabelas é derivada das migrations, não escrita à mão: tabela nova
// entra sozinha no backup. Escrever a lista aqui significaria que, no dia em
// que alguém criasse uma tabela, o backup continuaria verde exportando tudo
// menos ela.
//
// ================== O QUE ESTE BACKUP NÃO É ==================
//
// 1. NÃO restaura o login de ninguém. `profiles.id` referencia
//    `auth.users(id)`, e `auth.users` não sai pela API do app — só pela
//    `service_role` ou pelo painel. Restaurar só o que está aqui falharia já
//    no insert de `profiles`, por falta do usuário correspondente.
//
// 2. NÃO é o banco inteiro: roda sob a RLS do professor, então exporta o que o
//    professor enxerga. Hoje isso é essencialmente tudo, mas é uma garantia do
//    papel, não do arquivo.
//
// 3. NÃO foi provado em um restore. Enquanto não existir um lugar para
//    restaurar que não seja produção (OP-02), este arquivo é uma rede de
//    segurança sem teste de queda — melhor que nada, e menos do que o OP-01
//    pede. Não tratar o OP-01 como fechado por causa dele.
import fs from "node:fs/promises";
import path from "node:path";
import { SUPABASE, RELEASE_ID } from "../js/config.js";

const raiz = path.resolve(import.meta.dirname, "..");

const credenciais = await fs.readFile(path.join(raiz, "CREDENCIAIS.local.md"), "utf8");
const secao = credenciais.split("## Professor")[1]?.split("## Administrador")[0];
const par = secao?.match(/\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
if (!par) throw new Error("Formato de CREDENCIAIS.local.md não reconhecido.");

const login = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: par[1], password: par[2] }),
});
if (!login.ok) throw new Error(`Login falhou: HTTP ${login.status}`);
const sessao = await login.json();
const headers = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.access_token}` };

// --- tabelas, derivadas das migrations ---
const pasta = path.join(raiz, "supabase", "migrations");
const criadas = new Set();
for (const arquivo of (await fs.readdir(pasta)).sort()) {
  const sql = await fs.readFile(path.join(pasta, arquivo), "utf8");
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) criadas.add(m[1]);
  for (const m of sql.matchAll(/drop table (?:if exists )?public\.(\w+)/gi)) criadas.delete(m[1]);
}
const tabelas = [...criadas].sort();
if (!tabelas.length) throw new Error("Nenhuma tabela encontrada nas migrations — o formato mudou?");

// --- export, com paginação ---
const PAGINA = 1000;
async function exportar(tabela) {
  const linhas = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const resposta = await fetch(`${SUPABASE.url}/rest/v1/${tabela}?select=*`, {
      headers: { ...headers, Range: `${inicio}-${inicio + PAGINA - 1}` },
    });
    if (!resposta.ok) throw new Error(`${tabela}: HTTP ${resposta.status} ${await resposta.text()}`);
    const pagina = await resposta.json();
    linhas.push(...pagina);
    if (pagina.length < PAGINA) return linhas;
  }
}

const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const destino = path.join(raiz, "backups", carimbo);
await fs.mkdir(destino, { recursive: true });

const contagem = {};
const falhas = [];
for (const tabela of tabelas) {
  try {
    const linhas = await exportar(tabela);
    await fs.writeFile(path.join(destino, `${tabela}.json`), JSON.stringify(linhas, null, 2));
    contagem[tabela] = linhas.length;
  } catch (erro) {
    falhas.push({ tabela, erro: erro.message });
  }
}

await fs.writeFile(path.join(destino, "manifesto.json"), JSON.stringify({
  gerado_em: new Date().toISOString(),
  release: RELEASE_ID,
  projeto: SUPABASE.url,
  papel: "trainer",
  contagem,
  falhas,
  avisos: [
    "Não inclui auth.users: ninguém consegue entrar a partir deste backup.",
    "Exportado sob a RLS do professor, não como service_role.",
    "Restore nunca foi provado — ver OP-01/OP-02 no parking lot.",
  ],
}, null, 2));

const total = Object.values(contagem).reduce((s, n) => s + n, 0);
for (const [tabela, n] of Object.entries(contagem)) console.log(`  ${tabela.padEnd(24)} ${n}`);
if (falhas.length) {
  // O nome da pasta precisa denunciar o estado. Quem vai atrás de um backup
  // está com pressa e olha a lista de pastas, não abre o manifesto de cada uma
  // — e uma pasta parcial com nome de pasta boa é a pior das duas opções.
  const marcado = `${destino}-INCOMPLETO`;
  await fs.rename(destino, marcado);
  console.error("\nTabelas que NÃO foram exportadas:");
  for (const f of falhas) console.error(`  ${f.tabela}: ${f.erro}`);
  console.error(`\nBackup incompleto, salvo em backups/${path.basename(marcado)}/.`);
  console.error("Um arquivo parcial que parece completo é pior que nenhum.");
  process.exit(1);
}

console.log(`\nOK: ${tabelas.length} tabelas, ${total} linhas em backups/${carimbo}/`);
console.log("Lembrete: não restaura login (auth.users fica de fora) e o restore nunca foi provado.");
