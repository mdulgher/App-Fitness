// Cria a conta de um aluno em nome do professor.
//
// Por que existe: criar usuario para outra pessoa exige a chave service_role,
// que ignora todas as regras de acesso do banco. Ela nunca pode ir para o
// navegador — quem abrisse o DevTools viraria administrador. Aqui ela fica no
// servidor, como variavel de ambiente, e o navegador so chama esta funcao.
//
// A funcao confere, com a propria sessao de quem chamou, se o solicitante e o
// professor. Sem essa checagem, qualquer aluno logado criaria contas.

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

// Espelha a política ligada em 14/09/2026 no painel do Supabase (Authentication
// → Sign In/Providers → Email): mínimo 8, com minúscula, maiúscula e número.
// Repetido aqui (e em js/utils.js, do lado do cliente) porque o servidor de
// Auth não expõe essa regra para quem chama — se o painel mudar, mudar as duas
// pontas junto.
const SENHA_MINIMA = 8;

function senhaFraca(senha: string): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (!/[a-z]/.test(senha)) return "A senha precisa ter ao menos uma letra minúscula.";
  if (!/[A-Z]/.test(senha)) return "A senha precisa ter ao menos uma letra maiúscula.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter ao menos um número.";
  return null;
}

// Senha temporaria legivel ao telefone: sem I, O, 0 e 1, que se confundem.
// Garante minuscula+maiuscula+numero por CONSTRUCAO (um de cada, sorteados
// primeiro), e nao por sorte: sortear 12 caracteres de um alfabeto misto quase
// sempre cai nos três tipos, mas "quase sempre" falharia a validação acima em
// algum cadastro raro, sem que o professor tivesse feito nada de errado.
function senhaTemporaria() {
  const minusculas = "abcdefghijkmnpqrstuvwxyz";
  const maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "23456789";
  const alfabeto = minusculas + maiusculas + digitos;

  const sorteia = (fonte: string) => fonte[crypto.getRandomValues(new Uint32Array(1))[0] % fonte.length];

  const obrigatorios = [sorteia(minusculas), sorteia(maiusculas), sorteia(digitos)];
  const resto = Array.from({ length: 9 }, () => sorteia(alfabeto));

  // Embaralha para os três primeiros caracteres não seguirem sempre o mesmo
  // padrão minúscula-maiúscula-número.
  const todos = [...obrigatorios, ...resto];
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

  // Cliente com a sessao de quem chamou: serve para descobrir quem e, sem
  // qualquer privilegio extra.
  const comoUsuario = createClient(URL_PROJETO, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
  });

  const { data: { user }, error: erroSessao } = await comoUsuario.auth.getUser();
  if (erroSessao || !user) return responder({ error: "Sessão inválida." }, 401);

  const { data: perfil } = await comoUsuario
    .from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (perfil?.role !== "trainer") {
    return responder({ error: "Apenas o professor pode cadastrar alunos." }, 403);
  }

  let dados;
  try { dados = await req.json(); }
  catch { return responder({ error: "Dados inválidos." }, 400); }

  const email = String(dados.email ?? "").trim().toLowerCase();
  const nome = String(dados.full_name ?? "").trim();
  if (!email || !nome) return responder({ error: "Informe o nome e o email do aluno." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: "Email inválido." }, 400);

  const senhaInformada = String(dados.senha ?? "").trim();
  const senha = senhaInformada || senhaTemporaria();
  // Só valida a senha DIGITADA pelo professor; a gerada aqui já nasce válida
  // por construção, e rodar a mesma checagem nela seria redundante.
  if (senhaInformada) {
    const fraca = senhaFraca(senhaInformada);
    if (fraca) return responder({ error: fraca }, 400);
  }

  const admin = createClient(URL_PROJETO, CHAVE_ADMIN, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // email_confirm: o professor responde pelo aluno, entao nao ha por que
  // esperar confirmacao por email para o acesso funcionar.
  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });

  // Email ja cadastrado nao e necessariamente "aluno ja existe". Pode ser o
  // resto de uma tentativa anterior que falhou DEPOIS de criar a conta de
  // acesso: conexao caiu, o navegador fechou, o `deleteUser` de emergencia la
  // embaixo nao completou. Nesse estado a conta existe no Auth mas o app nao
  // sabe quem e a pessoa, e o professor ficava num beco sem saida — toda nova
  // tentativa devolvia "Já existe uma conta com esse email" e nao havia por
  // onde sair, nem pela tela nem pelo app.
  //
  // Entao aqui a funcao olha o estado real antes de recusar. Falta o registro
  // em `students`? Completa o cadastro na conta que ja existe, com senha nova,
  // porque a senha da tentativa anterior o professor nunca chegou a ver.
  let id: string;
  let retomado = false;

  if (erroCriacao) {
    const jaExiste = /already|registered|exists/i.test(erroCriacao.message);
    if (!jaExiste) return responder({ error: erroCriacao.message }, 400);

    // `profiles` tem o email porque o gatilho de criacao de conta o grava. Isso
    // evita varrer `auth.admin.listUsers()` pagina a pagina so para achar um id.
    const { data: perfilExistente } = await admin
      .from("profiles").select("id, role").eq("email", email).maybeSingle();

    if (!perfilExistente) {
      return responder({ error: "Já existe uma conta com esse email." }, 409);
    }
    if (perfilExistente.role !== "student") {
      return responder({ error: "Esse email já pertence a uma conta que não é de aluno." }, 409);
    }

    const { data: jaAluno } = await admin
      .from("students").select("id").eq("id", perfilExistente.id).maybeSingle();

    if (jaAluno) {
      return responder({
        error: "Esse aluno já está cadastrado. Se ele perdeu a senha, use “Redefinir senha” na página dele.",
      }, 409);
    }

    id = perfilExistente.id;
    retomado = true;
    const { error: erroSenha } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (erroSenha) {
      return responder({ error: `Não foi possível retomar o cadastro: ${erroSenha.message}` }, 400);
    }
  } else {
    id = criado!.user.id;
  }

  // O gatilho ja criou o perfil. Completa o que o professor preencheu.
  await admin.from("profiles").update({ full_name: nome, phone: dados.phone || null }).eq("id", id);

  // `weekly_target` saiu daqui em 16/09: a meta semanal e da ficha
  // (`workout_plans.weekly_target`) e ninguem mais le a coluna do cadastro.
  // Ela ainda existe no banco, com `default 3`, e so cai na migration propria —
  // que so pode rodar DEPOIS desta versao estar no ar.
  const { error: erroAluno } = await admin.from("students").insert({
    id,
    birth_date: dados.birth_date || null,
    goal: dados.goal || null,
    height_cm: dados.height_cm ? Number(dados.height_cm) : null,
    start_weight_kg: dados.start_weight_kg ? Number(dados.start_weight_kg) : null,
    health_restrictions: dados.health_restrictions || null,
    monthly_fee: dados.monthly_fee === "" || dados.monthly_fee == null ? null : Number(dados.monthly_fee),
    due_day: Number(dados.due_day) || 5,
    active: true,
  });

  if (erroAluno) {
    // Conta sem registro de aluno seria um fantasma: existe para entrar, mas o
    // app nao sabe quem e. Desfaz para nao deixar lixo no meio do caminho.
    //
    // So desfaz o que ESTA chamada criou. Numa retomada a conta de acesso e
    // anterior, e apagar levaria junto o historico de quem ja treinava — o
    // proximo cadastro cria tudo de novo do zero, entao o caminho seguro e
    // deixar como esta e contar o que aconteceu.
    if (!retomado) {
      await admin.auth.admin.deleteUser(id);
      return responder({ error: `Não foi possível concluir o cadastro: ${erroAluno.message}` }, 400);
    }
    return responder({
      error: `A conta de acesso existe, mas o cadastro não completou: ${erroAluno.message}. Tente de novo.`,
    }, 400);
  }

  return responder({ id, email, senha, full_name: nome, retomado }, 201);
});
