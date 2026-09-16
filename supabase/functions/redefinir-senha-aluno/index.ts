// Redefine a senha de um aluno, a pedido do professor.
//
// Por que existe: trocar a senha de outra pessoa exige a chave service_role,
// que ignora todas as regras de acesso do banco e por isso nunca pode ir para o
// navegador. Mesma razao da funcao `criar-aluno`, e o mesmo desenho: o
// navegador so chama; quem tem a chave e o servidor.
//
// Por que nao e o email de redefinicao do Supabase: aqui o professor entrega a
// conta ao aluno pessoalmente e o canal e o WhatsApp. O fluxo por email exigiria
// SMTP proprio (o gratuito do Supabase e limitado por hora e cai em spam),
// template, URL de retorno e uma rota nova no app para o token de recuperacao.
// A senha temporaria na tela e o mesmo caminho que o professor ja percorre no
// cadastro, e funciona offline do lado do aluno.
//
// A senha devolvida aparece UMA vez, na tela do professor. Nao fica gravada em
// lugar nenhum: o Supabase guarda so o hash.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_PROJETO = Deno.env.get("SUPABASE_URL")!;
const CHAVE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CHAVE_ADMIN = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Igual a de `criar-aluno`: sem I, O, 0 e 1, que se confundem ao telefone, e
// com minuscula, maiuscula e digito por construcao — nao por sorte.
function senhaTemporaria() {
  const minusculas = "abcdefghijkmnpqrstuvwxyz";
  const maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "23456789";
  const alfabeto = minusculas + maiusculas + digitos;

  const sorteia = (fonte: string) => fonte[crypto.getRandomValues(new Uint32Array(1))[0] % fonte.length];

  const todos = [sorteia(minusculas), sorteia(maiusculas), sorteia(digitos),
    ...Array.from({ length: 9 }, () => sorteia(alfabeto))];
  for (let i = todos.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [todos[i], todos[j]] = [todos[j], todos[i]];
  }
  return todos.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  const autorizacao = req.headers.get("Authorization") ?? "";
  if (!autorizacao) return responder({ error: "Sessão ausente." }, 401);

  const comoUsuario = createClient(URL_PROJETO, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
  });

  const { data: { user }, error: erroSessao } = await comoUsuario.auth.getUser();
  if (erroSessao || !user) return responder({ error: "Sessão inválida." }, 401);

  const { data: perfil } = await comoUsuario
    .from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (perfil?.role !== "trainer") {
    return responder({ error: "Apenas o professor pode redefinir a senha de um aluno." }, 403);
  }

  let dados;
  try { dados = await req.json(); }
  catch { return responder({ error: "Dados inválidos." }, 400); }

  const alunoId = String(dados.alunoId ?? "").trim();
  if (!alunoId) return responder({ error: "Informe o aluno." }, 400);

  const admin = createClient(URL_PROJETO, CHAVE_ADMIN, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // O alvo precisa ser um ALUNO. Sem esta conferencia, a funcao aceitaria
  // qualquer id de usuario — inclusive o do proprio professor ou o do admin —
  // e viraria uma tomada de conta com um id chutado. `students` nao basta: o
  // papel esta em `profiles`, e e ele que decide o que a pessoa pode fazer.
  const { data: alvo } = await admin
    .from("profiles").select("id, role, full_name, email").eq("id", alunoId).maybeSingle();

  if (!alvo) return responder({ error: "Aluno não encontrado." }, 404);
  if (alvo.role !== "student") {
    return responder({ error: "Só a senha de um aluno pode ser redefinida por aqui." }, 403);
  }

  const { data: registro } = await admin
    .from("students").select("id").eq("id", alunoId).maybeSingle();
  if (!registro) return responder({ error: "Essa conta não é de um aluno cadastrado." }, 404);

  const senha = senhaTemporaria();
  const { error: erroTroca } = await admin.auth.admin.updateUserById(alunoId, { password: senha });
  if (erroTroca) return responder({ error: `Não foi possível redefinir: ${erroTroca.message}` }, 400);

  // Derruba as sessoes abertas: sem isto, um aparelho que ficou logado continua
  // logado com a senha antiga, e "redefinir" nao teria tirado ninguem de lugar
  // nenhum — foi exatamente o que aconteceu com o "Sair" em 16/09.
  //
  // Vai depois da troca, e uma falha aqui nao desfaz a senha nova: avisa. O
  // professor precisa saber a diferenca entre "a senha mudou e os aparelhos
  // cairam" e "a senha mudou e alguem pode continuar dentro".
  const { error: erroSessoes } = await admin.auth.admin.signOut(alunoId, "global");

  return responder({
    id: alunoId,
    email: alvo.email,
    full_name: alvo.full_name,
    senha,
    sessoesEncerradas: !erroSessoes,
  }, 200);
});
