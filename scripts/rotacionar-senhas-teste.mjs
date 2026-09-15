// Rotaciona as senhas das contas fictícias sem imprimir credenciais.
//
// Na primeira execução, lê os alunos de CREDENCIAIS.local.md. Nas seguintes,
// usa SENHAS-TESTE.local.md. Ambos ficam fora do Git. Um arquivo pendente é
// gravado antes da primeira chamada para que uma interrupção nunca faça a nova
// senha de uma conta se perder.

import fs from "node:fs/promises";
import crypto from "node:crypto";
import { SUPABASE } from "../js/config.js";

const raiz = new URL("../", import.meta.url);
const arquivoPrincipal = new URL("CREDENCIAIS.local.md", raiz);
const arquivoSenhas = new URL("SENHAS-TESTE.local.md", raiz);
const arquivoPendente = new URL("SENHAS-TESTE.rotacao-pendente.local.md", raiz);
const arquivoProgresso = new URL("SENHAS-TESTE.rotacao-progresso.local.txt", raiz);

async function existe(url) {
  try { await fs.access(url); return true; }
  catch { return false; }
}

function contasDaSecao(texto) {
  const corpo = texto.split(/^##\s+Alunos de teste\s*$/m)[1]?.split(/^##\s+/m)[0] ?? "";
  return [...corpo.matchAll(/\|\s*`([^`\s]+@[^`\s]+)`\s*\|\s*`([^`]+)`\s*\|/g)]
    .map((m) => ({ email: m[1], senha: m[2] }));
}

function senhaForte() {
  const grupos = [
    "abcdefghijkmnpqrstuvwxyz",
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "23456789",
  ];
  const todos = grupos.join("");
  const caracteres = grupos.map((grupo) => grupo[crypto.randomInt(grupo.length)]);
  while (caracteres.length < 20) caracteres.push(todos[crypto.randomInt(todos.length)]);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

function documento(contas, concluido) {
  const momento = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `# Senhas locais das contas fictícias

> ${concluido ? "Rotação concluída" : "ROTAÇÃO PENDENTE"} em ${momento}.
> Arquivo local: nunca adicionar ao Git, enviar por mensagem ou publicar.

## Alunos de teste

| Email | Senha |
|---|---|
${contas.map((c) => `| \`${c.email}\` | \`${c.novaSenha}\` |`).join("\n")}
`;
}

async function autenticar(email, senha) {
  let resposta;
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    resposta = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    });
    if (resposta.status !== 429) return resposta;
    const informado = Number(resposta.headers.get("retry-after"));
    const espera = Number.isFinite(informado) && informado > 0
      ? Math.min(informado * 1000, 45_000)
      : 20_000;
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
  return resposta;
}

async function corpoJson(resposta) {
  try { return await resposta.json(); }
  catch { return {}; }
}

function exigir(resposta, etapa, indice) {
  if (!resposta.ok) throw new Error(`Conta ${indice + 1}: ${etapa} falhou (HTTP ${resposta.status}).`);
}

async function rotacionar(conta, indice, verificarRetomada = false) {
  // Permite retomar com segurança depois de uma interrupção: se a senha nova
  // já funciona, a troca desta conta terminou e falta apenas validar/revogar.
  const novaJaAtiva = verificarRetomada ? await autenticar(conta.email, conta.novaSenha) : null;
  if (novaJaAtiva?.ok) {
    const repetiuAntiga = await autenticar(conta.email, conta.senha);
    if (repetiuAntiga.ok) throw new Error(`Conta ${indice + 1}: as senhas antiga e nova foram aceitas.`);
    await revogar(await corpoJson(novaJaAtiva), indice);
    return;
  }

  const loginAntigo = await autenticar(conta.email, conta.senha);
  exigir(loginAntigo, "login com a senha atual", indice);
  const sessaoAntiga = await corpoJson(loginAntigo);

  const troca = await fetch(`${SUPABASE.url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${sessaoAntiga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: conta.novaSenha }),
  });
  exigir(troca, "troca da senha", indice);

  const loginNovo = await autenticar(conta.email, conta.novaSenha);
  exigir(loginNovo, "validação da senha nova", indice);
  await revogar(await corpoJson(loginNovo), indice);
}

async function revogar(sessaoNova, indice) {
  const logout = await fetch(`${SUPABASE.url}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${sessaoNova.access_token}`,
      "Content-Type": "application/json",
    },
  });
  exigir(logout, "encerramento global das sessões", indice);

  const refreshRevogado = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: sessaoNova.refresh_token }),
  });
  if (refreshRevogado.ok) throw new Error(`Conta ${indice + 1}: a sessão ainda conseguiu renovar o token.`);
}

const primeiraExecucao = !(await existe(arquivoSenhas));
const origem = primeiraExecucao ? arquivoPrincipal : arquivoSenhas;
const textoOrigem = await fs.readFile(origem, "utf8");
const antigas = contasDaSecao(textoOrigem);
const retomando = await existe(arquivoPendente);
const novasPendentes = retomando
  ? new Map(contasDaSecao(await fs.readFile(arquivoPendente, "utf8")).map((c) => [c.email, c.senha]))
  : null;
const contas = antigas.map((conta) => ({
  ...conta,
  novaSenha: novasPendentes?.get(conta.email) ?? senhaForte(),
}));
if (contas.length < 2) throw new Error(`Esperadas contas fictícias; encontradas ${contas.length}.`);
if (new Set(contas.map((c) => c.email.toLowerCase())).size !== contas.length) {
  throw new Error("Há emails repetidos na lista de contas fictícias.");
}
if (retomando && contas.some((c) => !novasPendentes.has(c.email))) {
  throw new Error("O arquivo da rotação pendente não corresponde às contas atuais.");
}

if (!retomando) {
  await fs.writeFile(arquivoPendente, documento(contas, false), { encoding: "utf8", flag: "wx" });
}

const inicio = await existe(arquivoProgresso)
  ? Number((await fs.readFile(arquivoProgresso, "utf8")).trim())
  : 0;
if (!Number.isInteger(inicio) || inicio < 0 || inicio > contas.length) {
  throw new Error("O progresso local da rotação é inválido.");
}

try {
  for (let i = inicio; i < contas.length; i++) {
    await rotacionar(contas[i], i, retomando && i === inicio);
    await fs.writeFile(arquivoProgresso, String(i + 1), "utf8");
  }
  await fs.writeFile(arquivoSenhas, documento(contas, true), "utf8");

  if (primeiraExecucao) {
    const inicio = textoOrigem.search(/^##\s+Alunos de teste\s*$/m);
    if (inicio >= 0) {
      const depois = textoOrigem.slice(inicio).search(/^##\s+(?!Alunos de teste\s*$)/m);
      const fim = depois > 0 ? inicio + depois : textoOrigem.length;
      const aviso = "## Alunos de teste\n\nCredenciais rotacionadas. Consulte `SENHAS-TESTE.local.md` nesta máquina.\n";
      await fs.writeFile(arquivoPrincipal, textoOrigem.slice(0, inicio) + aviso + textoOrigem.slice(fim), "utf8");
    }
  }

  await fs.rm(arquivoPendente);
  await fs.rm(arquivoProgresso, { force: true });
  console.log(`OK: ${contas.length} senhas rotacionadas, logins validados e sessões revogadas.`);
  console.log("OK: novas credenciais guardadas em SENHAS-TESTE.local.md (ignorado pelo Git).");
} catch (erro) {
  console.error(erro.message);
  console.error("As novas senhas estão preservadas em SENHAS-TESTE.rotacao-pendente.local.md.");
  process.exitCode = 1;
}
