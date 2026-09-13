// Smoke test autenticado e conservador: lê dados e reativa uma ficha que já
// está ativa, validando o RPC sem mudar o estado de negócio.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { SUPABASE } from "../js/config.js";

const credenciais = await fs.readFile(new URL("../CREDENCIAIS.local.md", import.meta.url), "utf8");
const professor = credenciais.split("## Professor")[1]?.split("## Alunos")[0];
const loginLocal = professor?.match(/\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
if (!loginLocal) throw new Error("Formato de CREDENCIAIS.local.md não reconhecido.");

const auth = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
  body: JSON.stringify({ email: loginLocal[1], password: loginLocal[2] }),
});
assert.equal(auth.ok, true, `Login do professor: HTTP ${auth.status}`);
const sessao = await auth.json();
const headers = {
  apikey: SUPABASE.anonKey,
  Authorization: `Bearer ${sessao.access_token}`,
  "Content-Type": "application/json",
};

async function json(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE.url}/rest/v1/${caminho}`, { headers, ...opcoes });
  const texto = await resposta.text();
  assert.equal(resposta.ok, true, `${caminho}: HTTP ${resposta.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const [ficha] = await json("workout_plans?select=id&active=eq.true&is_template=eq.false&limit=1");
assert.ok(ficha?.id, "O banco precisa ter uma ficha ativa para validar o RPC.");
const reativada = await json("rpc/ativar_ficha", {
  method: "POST",
  body: JSON.stringify({ p_ficha_id: ficha.id }),
});
assert.equal(reativada.id, ficha.id);

// O RPC funcionar no banco não prova que o app o usa: durante um dia inteiro a
// função existiu aqui enquanto `ativarFicha` seguia com os dois UPDATEs soltos,
// e este teste passava verde. Conferir o chamador é o que fecha a lacuna.
const fonte = await fs.readFile(new URL("../js/db-supabase.js", import.meta.url), "utf8");
const corpo = fonte.split("export async function ativarFicha")[1]?.split("\nexport ")[0] ?? "";
assert.match(corpo, /rpc\(\s*["']ativar_ficha["']/,
  "ativarFicha precisa chamar o RPC ativar_ficha; dois UPDATEs separados deixam o aluno sem ficha se o segundo falhar.");

const erros = await json("app_errors?select=id&limit=1");
assert.ok(Array.isArray(erros));
console.log("OK: login, leitura protegida, log e ativação transacional no Supabase.");
