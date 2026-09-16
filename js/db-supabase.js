// Leo Personal Trainning — implementação Supabase
//
// Espelha EXATAMENTE as assinaturas de db-local.js. Se as duas divergirem, a
// troca em config.js deixa de ser indolor e as telas quebram — é a única regra
// que este arquivo precisa respeitar.
//
// Aqui a privacidade é de verdade: quem separa os dados de um aluno dos do
// outro são as políticas de RLS no banco, não este código. Um filtro esquecido
// abaixo devolve menos dados, nunca dados de outra pessoa.

// `?bundle` reduz o SDK a três arquivos conhecidos. O service worker consegue
// guardar os três na instalação, em vez de descobrir dependências transitivas
// somente depois de uma segunda abertura online.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4?bundle";
import { SUPABASE } from "./config.js";
import { validarExercicio } from "./exercise-validation.js";
import { buscarTodasAsPaginas } from "./supabase-pagination.js";
import {
  comSnapshot, comSnapshotOuDerivado, lerSnapshot, apagarSnapshots,
} from "./offline-snapshot.js";
import {
  hoje, somarDias, diasEntre, inicioDaSemana, mesDeReferencia, resumoDoSaldo,
  diasDistintos, metaEfetiva, montarSessaoRealizada, ordemAoMover,
} from "./utils.js";

export const sb = createClient(SUPABASE.url, SUPABASE.anonKey);

async function idDaSessao() {
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function snapshotDoProprioAluno(alunoId, nome, buscar) {
  return (await idDaSessao()) === alunoId
    ? comSnapshot(alunoId, nome, buscar)
    : buscar();
}

// Erro de banco vira exceção com mensagem legível, em vez de `null` silencioso
// que só explode três telas adiante.
function ok(res) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// Atualizar uma linha e ter certeza do que aconteceu.
//
// `update(...).select().single()` estoura com "Cannot coerce the result to a
// single JSON object" sempre que o banco devolve zero linhas — e isso acontece
// por dois motivos completamente diferentes: a linha não existe mais, ou o RLS
// não deixou ler o retorno. A mensagem não distingue e não diz nada a ninguém.
//
// Aqui a gravação é conferida relendo a linha: se o valor já está lá, deu certo
// e não há erro nenhum a mostrar; se a linha sumiu ou o valor não mudou, o
// texto diz o que fazer.
async function atualizarLinha(tabela, id, patch, oQueE) {
  const linhas = ok(await sb.from(tabela).update(patch).eq("id", id).select());
  if (linhas.length) return linhas[0];

  const atual = ok(await sb.from(tabela).select("*").eq("id", id).maybeSingle());
  if (!atual) {
    throw new Error(`Esta ${oQueE} não existe mais — a tela está desatualizada. Recarregue a página.`);
  }

  const gravou = Object.entries(patch).every(
    ([campo, valor]) => JSON.stringify(atual[campo]) === JSON.stringify(valor)
  );
  if (gravou) return atual;

  throw new Error(
    `O banco não aceitou esta alteração em ${oQueE}. Saia e entre de novo; se continuar, é regra de acesso.`
  );
}

/* ==================== sessão ==================== */

export async function entrarComSenha(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzErro(error.message));
  return data.user;
}

export async function criarConta(email, senha, nome, codigoConvite = null) {
  const { data, error } = await sb.auth.signUp({
    email,
    password: senha,
    // O código viaja nos metadados: o gatilho do banco confere email + código
    // contra um convite aberto e cria o registro do aluno com os dados que o
    // professor preencheu.
    options: { data: { full_name: nome, invite_code: codigoConvite || null } },
  });
  if (error) throw new Error(traduzErro(error.message));
  return data.user;
}

// Diz se a conta já está vinculada a um cadastro de aluno. Sem isso, quem
// digita o código errado entraria num app vazio sem entender por quê.
export async function alunoVinculado(id) {
  const linha = ok(await sb.from("students").select("id").eq("id", id).maybeSingle());
  return Boolean(linha);
}

// O SDK **não** é suficiente para sair.
//
// `signOut()` só limpa o armazenamento quando encontra a sessão em memória. Se
// ela dessincronizou do disco — outra aba, um reload, token expirado — ele
// responde "Auth session missing" e **deixa o token no localStorage**. Aí a
// próxima abertura do app restaura a conta inteira. `scope: "local"` também
// não limpa nesse estado.
//
// Medido no app publicado em 16/09/2026: depois de tocar em "Sair", um reload
// voltava logado como o professor. Num aparelho emprestado — que é justamente
// quando alguém toca em Sair — isso entrega a conta para a pessoa seguinte.
//
// Então a limpeza do que é local é nossa, e acontece sempre, antes de qualquer
// decisão sobre erro. Revogar no servidor continua sendo o ideal, mas não é o
// que garante a saída.
export async function sairDaConta() {
  const usuarioId = await idDaSessao();
  const { error } = await sb.auth.signOut();

  limparSessaoPersistida();
  apagarSnapshots(usuarioId);

  // "Auth session missing" é o resultado desejado, não falha — não há sessão
  // para encerrar porque ela já não existe. Lançar aqui quebrava o logout
  // inteiro: `sair()` parava no meio e a tela não ia para o login.
  if (error && !/session missing|session_not_found|auth session/i.test(error.message)) {
    throw new Error(error.message);
  }
}

// As chaves que o SDK persiste para ESTE projeto. O nome base é
// `sb-<ref>-auth-token`, e o SDK pode fatiá-lo em `...auth-token.0`, `.1` quando
// o token é grande — por isso a comparação é por prefixo, não por nome exato.
function limparSessaoPersistida() {
  try {
    const ref = new URL(SUPABASE.url).hostname.split(".")[0];
    const prefixo = `sb-${ref}-auth-token`;
    Object.keys(localStorage)
      .filter((chave) => chave.startsWith(prefixo))
      .forEach((chave) => localStorage.removeItem(chave));
  } catch {
    // Sem localStorage não há sessão persistida para limpar.
  }
}

export async function usuarioDaSessao({ validar = false } = {}) {
  if (!validar) {
    const { data } = await sb.auth.getSession();
    return data.session?.user ?? null;
  }

  const { data, error } = await sb.auth.getUser();
  if (!error) return data.user ?? null;
  // Sessão revogada/expirada é estado, não indisponibilidade. Já uma falha de
  // rede não pode derrubar quem está usando dados offline.
  if (/jwt|session|refresh token|not authenticated|user not found/i.test(error.message)) return null;
  throw new Error(traduzErro(error.message));
}

export function observarSessao(aoMudar) {
  const { data } = sb.auth.onAuthStateChange((evento, sessao) => {
    // O callback do SDK roda sob um lock interno. Sair dele antes de consultar
    // perfil evita deadlock nas chamadas seguintes do próprio Supabase.
    queueMicrotask(() => aoMudar(sessao?.user ?? null, evento));
  });
  return () => data.subscription.unsubscribe();
}

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return "Email ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu email antes de entrar.";
  if (/already registered|already been registered/i.test(msg)) return "Esse email já tem conta.";
  if (/password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 8 caracteres.";
  // Mensagem real do Supabase quando falta minúscula/maiúscula/número; o texto
  // varia ("Password should contain at least one character of each..."), então
  // o padrão é frouxo de propósito. `senhaFraca()` no cliente já evita isso na
  // maioria dos casos — esta é a rede de segurança para quem chamar a API direto.
  if (/character of each|lowercase|uppercase/i.test(msg)) {
    return "A senha precisa ter maiúscula, minúscula e número.";
  }
  if (/different from the old password/i.test(msg)) return "A nova senha precisa ser diferente da atual.";
  if (/weak.?password|pwned|compromised/i.test(msg)) return "Essa senha é muito fácil de adivinhar. Escolha outra.";
  return msg;
}

// Sem equivalente no Supabase: os dados são de verdade e compartilhados.
export async function reiniciarDados() {
  throw new Error("Recarregar dados só existe no modo local.");
}

/* ==================== perfis ==================== */

export async function listarPerfis() {
  return buscarTodasAsPaginas(() =>
    sb.from("profiles").select("*").order("full_name").order("id")
  );
}

export async function buscarPerfil(id) {
  return snapshotDoProprioAluno(id, "perfil", async () => {
    const perfil = ok(await sb.from("profiles").select("*").eq("id", id).maybeSingle());
    return perfil ? await comAvatarAssinado(perfil) : perfil;
  });
}

// Edição do próprio cadastro, por qualquer papel.
//
// A lista de campos não é decoração: o banco revoga UPDATE na coluna `role` e
// só concede nestas quatro. Mandar `role` aqui devolveria "permission denied" —
// que é exatamente a proteção contra um aluno se promover a professor.
const CAMPOS_DO_PROPRIO_PERFIL = ["full_name", "phone", "avatar_url"];

export async function atualizarMeuPerfil(patch) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sua sessão expirou. Entre de novo.");

  const campos = {};
  for (const c of CAMPOS_DO_PROPRIO_PERFIL) if (c in patch) campos[c] = patch[c];
  if (!Object.keys(campos).length) return buscarPerfil(user.id);

  // Passa pelo mesmo tratamento da leitura: o que volta daqui vai direto para a
  // tela, e `avatar_url` gravado é caminho, não URL que o <img> saiba abrir.
  return comAvatarAssinado(
    ok(await sb.from("profiles").update(campos).eq("id", user.id).select().single())
  );
}

export async function alterarMinhaSenha(nova) {
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) throw new Error(traduzErro(error.message));
}

const BUCKET_AVATAR = "avatars";
const VALIDADE_DO_AVATAR = 3600;

// `profiles.avatar_url` guarda o CAMINHO dentro do bucket (`<uid>/<uuid>.jpg`),
// não uma URL. O bucket é privado: URL pública não abre mais, e uma URL assinada
// gravada no banco venceria sozinha e ainda vazaria para quem lesse a linha.
//
// Tolera a URL completa que a versão anterior gravava, para o caso de ter
// sobrado alguma: dela sai o mesmo caminho. URL de fora devolve null, e assim
// apagar a foto anterior nunca tenta mexer em algo que o app não subiu.
function caminhoDoAvatar(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  const marca = `/${BUCKET_AVATAR}/`;
  const i = texto.indexOf(marca);
  if (i >= 0) return decodeURIComponent(texto.slice(i + marca.length).split("?")[0]);

  // Caminho puro: `<uid>/<arquivo>`, sem protocolo.
  return /^[^:]+\/[^/]+$/.test(texto) ? texto : null;
}

// A tela pede `avatar_url` e recebe uma URL que funciona — a assinatura fica
// aqui, na fronteira do banco, e vive só em memória pelo tempo da sessão.
async function comAvatarAssinado(perfil) {
  const caminho = caminhoDoAvatar(perfil.avatar_url);
  if (!caminho) return { ...perfil, avatar_url: null, avatar_path: null };

  const { data, error } = await sb.storage.from(BUCKET_AVATAR)
    .createSignedUrl(caminho, VALIDADE_DO_AVATAR);

  // Foto que não abre não é motivo para a tela inteira falhar: cai nas iniciais.
  return { ...perfil, avatar_url: error ? null : data.signedUrl, avatar_path: caminho };
}

// O nome do arquivo é aleatório, e não `<uid>/avatar.jpg`, para o navegador não
// servir a foto velha de cache depois da troca.
export async function enviarMeuAvatar(arquivo) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sua sessão expirou. Entre de novo.");

  const anterior = (await buscarPerfil(user.id))?.avatar_path ?? null;
  const caminho = `${user.id}/${crypto.randomUUID()}.jpg`;

  const envio = await sb.storage.from(BUCKET_AVATAR)
    .upload(caminho, arquivo, { contentType: "image/jpeg" });
  if (envio.error) throw new Error(envio.error.message);

  let perfil;
  try {
    perfil = await atualizarMeuPerfil({ avatar_url: caminho });
  } catch (err) {
    // O perfil continua apontando para a foto antiga: o arquivo novo que
    // ninguém referencia é lixo, e deixá-lo seria cobrar armazenamento por ele.
    await sb.storage.from(BUCKET_AVATAR).remove([caminho]);
    throw err;
  }

  // Só depois de o perfil apontar para a nova. Apagar antes deixaria o usuário
  // sem foto nenhuma se a gravação falhasse.
  if (anterior) await sb.storage.from(BUCKET_AVATAR).remove([anterior]);
  return perfil;
}

export async function removerMeuAvatar() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Sua sessão expirou. Entre de novo.");

  const anterior = (await buscarPerfil(user.id))?.avatar_path ?? null;
  const perfil = await atualizarMeuPerfil({ avatar_url: null });
  if (anterior) await sb.storage.from(BUCKET_AVATAR).remove([anterior]);
  return perfil;
}

/* ==================== alunos ==================== */

// O resumo é calculado aqui, e não no banco, porque depende de "hoje" e de
// juntar quatro tabelas — em JS fica legível e o volume é de dezenas de linhas,
// não de milhões.
async function montarResumos(alunos) {
  if (!alunos.length) return new Map();
  const ids = alunos.map((a) => a.id);
  const H = hoje();

  const [sessoes, fichas, pagamentos] = await Promise.all([
    buscarTodasAsPaginas(() => sb.from("attendance")
      .select("id,student_id,date,completed_at,in_person")
      .in("student_id", ids).not("completed_at", "is", null).order("id")),
    buscarTodasAsPaginas(() => sb.from("workout_plans")
      .select("id,student_id,end_date,weekly_target")
      .in("student_id", ids).eq("active", true).order("id")),
    buscarTodasAsPaginas(() => sb.from("payments")
      .select("id,student_id,due_date,paid_date")
      .in("student_id", ids).is("paid_date", null).order("id")),
  ]);

  const segunda = inicioDaSemana(H);
  const domingo = somarDias(segunda, 6);
  const mapa = new Map();

  for (const aluno of alunos) {
    const minhas = sessoes.filter((s) => s.student_id === aluno.id).sort((a, b) => b.date.localeCompare(a.date));
    const ultimoTreino = minhas[0]?.date ?? null;
    const ficha = fichas.find((f) => f.student_id === aluno.id);
    const abertos = pagamentos.filter((p) => p.student_id === aluno.id);
    // A semana tem fim: sem o `<= domingo`, uma presença lançada com data
    // futura já entrava na conta da semana atual.
    const naSemana = minhas.filter((s) => s.date >= segunda && s.date <= domingo);

    mapa.set(aluno.id, {
      ultimoTreino,
      diasSemTreinar: ultimoTreino ? diasEntre(ultimoTreino, H) : null,
      // Dias, não sessões: treinar de manhã e ter aula à tarde é um dia de
      // treino, e era o que fazia o cartão e a lista discordarem.
      treinosNaSemana: diasDistintos(naSemana),
      comPersonalNaSemana: diasDistintos(naSemana.filter((s) => s.in_person)),
      metaSemanal: metaEfetiva(ficha),
      temFichaAtiva: Boolean(ficha),
      fichaAtivaId: ficha?.id ?? null,
      fichaVenceEm: ficha?.end_date ?? null,
      statusFinanceiro: abertos.some((p) => p.due_date < H)
        ? "overdue"
        : abertos.length
          ? "pending"
          : "paid",
    });
  }
  return mapa;
}

function achatar(linha) {
  const { profiles, ...aluno } = linha;
  return {
    ...aluno,
    full_name: profiles?.full_name ?? "(sem nome)",
    email: profiles?.email ?? null,
    phone: profiles?.phone ?? null,
    avatar_url: profiles?.avatar_url ?? null,
  };
}

export async function listarAlunos({ incluirInativos = false } = {}) {
  const alunos = (await buscarTodasAsPaginas(() => {
    let q = sb.from("students")
      .select("*, profiles!inner(full_name,email,phone,avatar_url)")
      .order("id");
    if (!incluirInativos) q = q.eq("active", true);
    return q;
  })).map(achatar);
  const resumos = await montarResumos(alunos);
  return alunos
    .map((a) => ({ ...a, resumo: resumos.get(a.id) }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
}

export async function buscarAluno(id) {
  return snapshotDoProprioAluno(id, "aluno", async () => {
    const linha = ok(
      await sb.from("students").select("*, profiles!inner(full_name,email,phone,avatar_url)").eq("id", id).maybeSingle()
    );
    if (!linha) return null;
    const aluno = achatar(linha);
    const resumos = await montarResumos([aluno]);
    return { ...aluno, resumo: resumos.get(aluno.id) };
  });
}

// O professor cria a conta do aluno de verdade. A chamada vai para a Edge
// Function `criar-aluno`, porque criar usuário para outra pessoa exige a chave
// service_role — que ignora todas as regras de acesso e por isso nunca pode
// estar no navegador. Lá no servidor ela confere que quem pediu é o professor.
//
// Devolve a senha temporária para o professor repassar ao aluno.
export async function criarAluno(dados) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Faça login novamente para cadastrar.");

  const { data, error } = await sb.functions.invoke("criar-aluno", { body: dados });

  if (error) {
    // O corpo do erro traz a mensagem em português vinda da função; sem isso o
    // professor veria só "Edge Function returned a non-2xx status code".
    let detalhe = null;
    try { detalhe = (await error.context?.json?.())?.error; } catch {}
    throw new Error(detalhe || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Redefine a senha do aluno e devolve a nova para o professor repassar.
//
// Mesma razão de `criarAluno` para viver numa Edge Function: trocar a senha de
// outra pessoa exige `service_role`. A função confere no servidor que quem pede
// é o professor e que o alvo é mesmo um aluno — sem isso, um id chutado no
// corpo da requisição viraria tomada de conta.
//
// A senha volta uma vez só. O Supabase guarda apenas o hash; nem o professor
// consegue consultá-la depois, o que é por que a tela avisa antes de fechar.
export async function redefinirSenhaDoAluno(alunoId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Faça login novamente para redefinir a senha.");

  const { data, error } = await sb.functions.invoke("redefinir-senha-aluno", {
    body: { alunoId },
  });

  if (error) {
    let detalhe = null;
    try { detalhe = (await error.context?.json?.())?.error; } catch {}
    throw new Error(detalhe || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Situação COMERCIAL: entra ou não na geração de mensalidade. Não mexe no
// acesso do aluno ao app — para isso existe `bloquearAcesso`.
export async function desativarAluno(id, ativo = false) {
  return ok(await sb.from("students").update({ active: ativo }).eq("id", id).select().single());
}

// Acesso ao app. Quem faz valer é a RLS: as políticas do aluno conferem
// `acesso_bloqueado()`, então bloquear vale também para um JWT já emitido e
// para quem chamar a API por fora do app. Cobrança e histórico ficam como estão.
export async function bloquearAcesso(id, bloqueado = true) {
  return ok(await sb.from("students").update({ access_blocked: bloqueado }).eq("id", id).select().single());
}

export async function meuAcessoBloqueado() {
  const { data, error } = await sb.rpc("acesso_bloqueado");
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function atualizarAluno(id, patch) {
  const doPerfil = {};
  const doAluno = {};
  for (const [k, v] of Object.entries(patch)) {
    if (["full_name", "email", "phone", "avatar_url"].includes(k)) doPerfil[k] = v;
    else doAluno[k] = v;
  }
  if (Object.keys(doPerfil).length) ok(await sb.from("profiles").update(doPerfil).eq("id", id));
  if (Object.keys(doAluno).length) ok(await sb.from("students").update(doAluno).eq("id", id));
  return buscarAluno(id);
}

/* ==================== exercícios ==================== */

export async function listarExercicios({ incluirArquivados = false } = {}) {
  return buscarTodasAsPaginas(() => {
    let q = sb.from("exercises").select("*").order("name").order("id");
    if (!incluirArquivados) q = q.eq("archived", false);
    return q;
  });
}

export async function buscarExercicio(id) {
  return ok(await sb.from("exercises").select("*").eq("id", id).maybeSingle());
}

export async function criarExercicio(dados) {
  return ok(await sb.from("exercises").insert(validarExercicio(dados)).select().single());
}

export async function atualizarExercicio(id, patch) {
  return ok(await sb.from("exercises").update(validarExercicio(patch, true)).eq("id", id).select().single());
}

export async function arquivarExercicio(id) {
  return atualizarExercicio(id, { archived: true });
}

/* ==================== fichas ==================== */

const FICHA_COMPLETA = `
  *,
  workout_days (
    *,
    workout_day_exercises (
      *,
      exercises (*)
    )
  )
`;

// Traduz o formato aninhado do Supabase para o mesmo formato que db-local.js
// entrega. As telas não podem perceber diferença.
function normalizar(ficha) {
  if (!ficha) return null;
  const dias = (ficha.workout_days ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((dia) => ({
      ...dia,
      exercicios: (dia.workout_day_exercises ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(({ exercises, ...item }) => ({ ...item, exercicio: exercises ?? null })),
    }));
  dias.forEach((d) => delete d.workout_day_exercises);
  const { workout_days, ...resto } = ficha;
  return { ...resto, dias };
}

export async function fichaAtiva(alunoId) {
  return snapshotDoProprioAluno(alunoId, "ficha-ativa", async () => {
    const f = ok(
      await sb.from("workout_plans").select(FICHA_COMPLETA).eq("student_id", alunoId).eq("active", true).maybeSingle()
    );
    return normalizar(f);
  });
}

export async function buscarFicha(id) {
  return normalizar(ok(await sb.from("workout_plans").select(FICHA_COMPLETA).eq("id", id).maybeSingle()));
}

export async function listarFichas(alunoId) {
  return buscarTodasAsPaginas(() => sb.from("workout_plans").select("*")
    .eq("student_id", alunoId)
    .order("start_date", { ascending: false }).order("id", { ascending: false }));
}

export async function listarTemplates() {
  return buscarTodasAsPaginas(() => sb.from("workout_plans").select("*")
    .eq("is_template", true).order("title").order("id"));
}

/* ---------- edição da ficha (só o professor; garantido por RLS) ---------- */

export async function criarFicha({ alunoId, titulo, descricao = null, inicio = hoje(), fim = null, metaSemanal = null }) {
  return ok(
    await sb.from("workout_plans").insert({
      student_id: alunoId, title: titulo, description: descricao,
      start_date: inicio, end_date: fim, active: false,
      weekly_target: metaSemanal,
    }).select().single()
  );
}

export async function atualizarFicha(id, patch) {
  return ok(await sb.from("workout_plans").update(patch).eq("id", id).select().single());
}

// Duplica a prescrição — ver a explicação em db-local.js.
//
// Não é transacional: são várias inserções em sequência, e uma falha no meio
// deixa a cópia incompleta. É aceito aqui porque a cópia nasce **inativa** e o
// aluno não vê nada até o professor ativar; o conserto é excluir e duplicar de
// novo. Uma RPC resolveria e fica para quando isto virar operação frequente.
export async function duplicarFicha(fichaId, { alunoId = null, titulo = null, comoTemplate = false } = {}) {
  const origem = ok(await sb.from("workout_plans").select("*").eq("id", fichaId).maybeSingle());
  if (!origem) throw new Error("Esta ficha não existe mais — a tela está desatualizada. Recarregue a página.");

  const dono = comoTemplate ? null : (alunoId ?? origem.student_id);
  if (!comoTemplate && !dono) throw new Error("Escolha o aluno que vai receber a cópia.");

  const { id: _id, student_id: _aluno, is_template: _t, active: _a, title: _titulo,
    start_date: _i, end_date: _f, created_at: _c, updated_at: _u, ...resto } = origem;

  const nova = ok(
    await sb.from("workout_plans").insert({
      ...resto,
      student_id: dono,
      is_template: comoTemplate,
      title: titulo?.trim() || `${origem.title} (cópia)`,
      start_date: comoTemplate ? null : hoje(),
      end_date: null,
      active: false,
    }).select().single()
  );

  const dias = ok(await sb.from("workout_days").select("*")
    .eq("workout_plan_id", fichaId).order("order_index").order("id"));

  for (const [ordem, dia] of dias.entries()) {
    const { id: _d, workout_plan_id: _fp, order_index: _o, ...camposDoDia } = dia;
    const novoDia = ok(
      await sb.from("workout_days")
        .insert({ ...camposDoDia, workout_plan_id: nova.id, order_index: ordem })
        .select().single()
    );

    const itens = ok(await sb.from("workout_day_exercises").select("*")
      .eq("workout_day_id", dia.id).order("order_index").order("id"));
    if (!itens.length) continue;

    ok(await sb.from("workout_day_exercises").insert(
      itens.map((item, i) => {
        const { id: _i2, workout_day_id: _wd, order_index: _o2, ...campos } = item;
        return { ...campos, workout_day_id: novoDia.id, order_index: i };
      })
    ));
  }

  return nova;
}

export async function moverDia(diaId, direcao) {
  const dia = ok(await sb.from("workout_days").select("workout_plan_id").eq("id", diaId).maybeSingle());
  if (!dia) throw new Error("Esta divisão não existe mais — recarregue a página.");
  const irmaos = ok(await sb.from("workout_days").select("id,order_index")
    .eq("workout_plan_id", dia.workout_plan_id).order("order_index").order("id"));
  return gravarOrdem("workout_days", irmaos, ordemAoMover(irmaos.map((d) => d.id), diaId, direcao));
}

export async function moverItemDoDia(itemId, direcao) {
  const item = ok(await sb.from("workout_day_exercises").select("workout_day_id").eq("id", itemId).maybeSingle());
  if (!item) throw new Error("Este exercício não está mais na ficha — recarregue a página.");
  const irmaos = ok(await sb.from("workout_day_exercises").select("id,order_index")
    .eq("workout_day_id", item.workout_day_id).order("order_index").order("id"));
  return gravarOrdem("workout_day_exercises", irmaos, ordemAoMover(irmaos.map((x) => x.id), itemId, direcao));
}

// Grava só quem mudou de posição. Com `order_index` repetido a primeira
// reordenação reescreve vários; depois são dois. Não há índice único em
// (pai, order_index), então não existe colisão no meio da sequência.
async function gravarOrdem(nomeDaTabela, linhas, ordens) {
  const atual = new Map(linhas.map((l) => [l.id, l.order_index]));
  const mudanca = ordens.filter(({ id, ordem }) => atual.get(id) !== ordem);
  for (const { id, ordem } of mudanca) {
    ok(await sb.from(nomeDaTabela).update({ order_index: ordem }).eq("id", id).select("id"));
  }
  return mudanca.length > 0;
}

// Ativar uma ficha desativa as outras do mesmo aluno: `fichaAtiva()` usa
// `maybeSingle()` e duas ativas quebrariam a tela do aluno com erro de
// "múltiplas linhas" em vez de simplesmente mostrar a mais nova.
//
// Desativar e ativar em duas requisições deixava o aluno sem ficha nenhuma se a
// segunda falhasse. O RPC faz a troca dentro de uma transação e roda com as
// permissões de quem chamou (`security invoker`), então o RLS continua valendo.
export async function ativarFicha(id) {
  return ok(await sb.rpc("ativar_ficha", { p_ficha_id: id }));
}

export async function removerFicha(id) {
  ok(await sb.from("workout_plans").delete().eq("id", id));
}

export async function criarDia({ fichaId, rotulo, ordem = 0, diasSemana = [] }) {
  return ok(
    await sb.from("workout_days").insert({
      workout_plan_id: fichaId, label: rotulo, order_index: ordem, weekdays: diasSemana,
    }).select().single()
  );
}

export async function atualizarDia(id, patch) {
  return atualizarLinha("workout_days", id, patch, "divisão do treino");
}

export async function removerDia(id) {
  ok(await sb.from("workout_days").delete().eq("id", id));
}

export async function adicionarExercicioNoDia({ diaId, exercicioId, ...resto }) {
  const ultimo = ok(await sb.from("workout_day_exercises").select("order_index")
    .eq("workout_day_id", diaId).order("order_index", { ascending: false }).limit(1));
  const ordem = (ultimo[0]?.order_index ?? -1) + 1;
  return ok(
    await sb.from("workout_day_exercises").insert({
      workout_day_id: diaId,
      exercise_id: exercicioId,
      order_index: resto.ordem ?? ordem,
      sets: resto.series ?? 3,
      reps: resto.reps ?? "10-12",
      rest_seconds: resto.descanso ?? 60,
      load_notes: resto.carga ?? null,
      trainer_notes: resto.observacao ?? null,
      group_label: resto.grupo ?? null,
    }).select().single()
  );
}

export async function atualizarItemDoDia(id, patch) {
  return atualizarLinha("workout_day_exercises", id, patch, "este exercício da ficha");
}

export async function removerItemDoDia(id) {
  ok(await sb.from("workout_day_exercises").delete().eq("id", id));
}

export async function buscarDiaDeTreino(diaId) {
  const alunoId = await idDaSessao();
  const buscar = async () => {
    const dia = ok(await sb.from("workout_days").select("workout_plan_id").eq("id", diaId).maybeSingle());
    if (!dia) return null;
    const ficha = await buscarFicha(dia.workout_plan_id);
    return ficha?.dias.find((d) => d.id === diaId) ?? null;
  };
  return alunoId
    ? comSnapshotOuDerivado(
      alunoId,
      `dia:${diaId}`,
      buscar,
      (storage) => lerSnapshot(alunoId, "ficha-ativa", storage).valor?.dias?.find((d) => d.id === diaId) ?? null,
    )
    : buscar();
}

/* ==================== sessões de treino ==================== */

export async function listarSessoes(alunoId, { de = null, ate = null } = {}) {
  return snapshotDoProprioAluno(alunoId, `sessoes:${de ?? "inicio"}:${ate ?? "fim"}`, () => buscarTodasAsPaginas(() => {
    let q = sb.from("attendance").select("*").eq("student_id", alunoId)
      .order("date", { ascending: false }).order("id", { ascending: false });
    if (de) q = q.gte("date", de);
    if (ate) q = q.lte("date", ate);
    return q;
  }));
}

// Treinos realizados — ver a explicação em db-local.js.
//
// Uma consulta só, com a divisão e as cargas embutidas. O limite de sessões
// segura o tamanho: o embutido não é paginado, e sem teto no lado de fora o
// histórico de um ano voltaria inteiro para desenhar uma lista de vinte linhas.
//
// O nome do exercício vem por `exercise_logs → exercises`, não pela ficha: a
// FK de `exercise_id` é `on delete restrict`, então esse nome existe mesmo
// depois de o professor refazer a prescrição. Já `attendance.workout_day_id` e
// `workout_day_exercise_id` são `on delete set null` — daí a divisão poder vir
// nula numa sessão antiga, o que a tela escreve em vez de esconder.
export async function historicoDeSessoes(alunoId, { de = null, ate = null, limite = 30 } = {}) {
  return snapshotDoProprioAluno(
    alunoId,
    `historico:${de ?? "inicio"}:${ate ?? "fim"}:${limite ?? "tudo"}`,
    async () => {
      let q = sb.from("attendance")
        .select("*, workout_days(label), exercise_logs(*, exercises(name,muscle_group))")
        .eq("student_id", alunoId)
        .not("completed_at", "is", null)
        .order("date", { ascending: false })
        .order("completed_at", { ascending: false });
      if (de) q = q.gte("date", de);
      if (ate) q = q.lte("date", ate);
      if (limite) q = q.limit(limite);

      return ok(await q).map(({ workout_days, exercise_logs, ...sessao }) =>
        montarSessaoRealizada(
          sessao,
          workout_days?.label ?? null,
          (exercise_logs ?? []).map(({ exercises, ...carga }) => ({
            ...carga,
            exercicio: exercises ?? null,
          }))
        )
      );
    }
  );
}

// Ler e depois inserir é uma corrida: entre as duas chamadas, outra aba, outro
// aparelho ou um reenvio da fila pode criar a mesma sessão. O índice único
// `attendance_uma_por_dia` (aluno, data, divisão) recusava a segunda inserção,
// e o aluno via o texto cru do Postgres sobre violação de restrição — para uma
// situação em que o que ele queria (a sessão existir) já tinha acontecido.
//
// A restrição do banco é a fonte da verdade, então a duplicidade não é erro
// aqui: é a resposta de que alguém chegou primeiro. Relê e segue.
export async function abrirSessao(alunoId, diaId, data = hoje()) {
  const buscar = async () => ok(
    await sb.from("attendance").select("*").eq("student_id", alunoId).eq("date", data).eq("workout_day_id", diaId).maybeSingle()
  );

  const existente = await buscar();
  if (existente) return existente;

  const criada = await sb.from("attendance")
    .insert({ student_id: alunoId, workout_day_id: diaId, date: data }).select().single();
  if (!criada.error) return criada.data;
  if (criada.error.code !== "23505") throw new Error(criada.error.message);

  const jaCriada = await buscar();
  if (!jaCriada) throw new Error(criada.error.message);
  return jaCriada;
}

export async function concluirSessao(sessaoId, porQuem = "student") {
  return ok(
    await sb.from("attendance")
      .update({ completed_at: new Date().toISOString(), marked_by: porQuem })
      .eq("id", sessaoId).select().single()
  );
}

export async function desconcluirSessao(sessaoId) {
  return ok(
    await sb.from("attendance")
      .update({ completed_at: null })
      .eq("id", sessaoId).select().single()
  );
}

export async function removerSessao(sessaoId) {
  ok(await sb.from("attendance").delete().eq("id", sessaoId));
}

export async function resumoDaSemana(alunoId, referencia = hoje()) {
  return snapshotDoProprioAluno(alunoId, `semana:${inicioDaSemana(referencia)}`, async () => {
    const segunda = inicioDaSemana(referencia);
    const domingo = somarDias(segunda, 6);

    // A consulta a `students.weekly_target` saiu junto com o fallback (AT-12):
    // era uma ida ao banco por semana para ler um número que ninguém combinou.
    const [ficha, feitos] = await Promise.all([
      ok(await sb.from("workout_plans").select("weekly_target").eq("student_id", alunoId).eq("active", true).maybeSingle()),
      ok(await sb.from("attendance").select("date,in_person").eq("student_id", alunoId)
        .not("completed_at", "is", null).gte("date", segunda).lte("date", domingo)),
    ]);

    const meta = metaEfetiva(ficha);
    const dias = diasDistintos(feitos);

    return {
      inicio: segunda,
      fim: domingo,
      feitos: dias,
      comPersonal: diasDistintos(feitos.filter((f) => f.in_person)),
      sessoes: feitos.length,
      meta,
      aderencia: meta ? Math.min(1, dias / meta) : 0,
      datas: [...new Set(feitos.map((f) => f.date))].sort(),
    };
  });
}

export async function proximoTreinoSugerido(alunoId) {
  return snapshotDoProprioAluno(alunoId, "proximo-treino", async () => {
    const ficha = await fichaAtiva(alunoId);
    if (!ficha?.dias.length) return null;

    const ultimas = ok(
      await sb.from("attendance").select("workout_day_id,date").eq("student_id", alunoId)
        .not("completed_at", "is", null).not("workout_day_id", "is", null)
        .order("date", { ascending: false }).limit(1)
    );
    if (!ultimas.length) return ficha.dias[0];

    const idx = ficha.dias.findIndex((d) => d.id === ultimas[0].workout_day_id);
    return ficha.dias[(idx + 1) % ficha.dias.length];
  });
}

/* ==================== cargas e progressão ==================== */

export async function listarCargasDaSessao(sessaoId) {
  const alunoId = await idDaSessao();
  const buscar = () => buscarTodasAsPaginas(() => sb.from("exercise_logs").select("*")
    .eq("attendance_id", sessaoId).order("set_number").order("id"));
  return alunoId ? comSnapshot(alunoId, `cargas:${sessaoId}`, buscar) : buscar();
}

export async function registrarSerie({
  alunoId, sessaoId, workoutDayExerciseId, exercicioId, serie,
  peso = null, reps = null, duracao = null, rpe = null, notas = null,
}) {
  // O índice único (attendance_id, workout_day_exercise_id, set_number) faz
  // desta operação uma correção quando a série já foi registrada, em vez de
  // criar linha duplicada a cada toque do aluno.
  return ok(
    await sb.from("exercise_logs").upsert({
      student_id: alunoId,
      attendance_id: sessaoId,
      workout_day_exercise_id: workoutDayExerciseId,
      exercise_id: exercicioId,
      set_number: serie,
      weight_kg: peso,
      reps_done: reps,
      duration_seconds: duracao,
      rpe,
      notes: notas,
    }, { onConflict: "attendance_id,workout_day_exercise_id,set_number" }).select().single()
  );
}

async function logsComData(alunoId, exercicioId) {
  const logs = await buscarTodasAsPaginas(() =>
    sb.from("exercise_logs")
      .select("*, attendance!inner(date)")
      .eq("student_id", alunoId).eq("exercise_id", exercicioId).order("id")
  );
  return logs.map(({ attendance, ...l }) => ({ ...l, data: attendance?.date ?? "" }));
}

export async function ultimaVezNoExercicio(alunoId, exercicioId, ignorarSessaoId = null) {
  return snapshotDoProprioAluno(alunoId, `ultima:${exercicioId}:${ignorarSessaoId ?? "nenhuma"}`, async () => {
    const logs = (await logsComData(alunoId, exercicioId)).filter((l) => l.attendance_id !== ignorarSessaoId);
    if (!logs.length) return null;

    const ultimaData = logs.map((l) => l.data).sort().at(-1);
    const series = logs.filter((l) => l.data === ultimaData).sort((a, b) => a.set_number - b.set_number);

    return {
      data: ultimaData,
      series,
      pesoMaximo: Math.max(...series.map((s) => s.weight_kg ?? 0)) || null,
    };
  });
}

export async function progressaoDoExercicio(alunoId, exercicioId) {
  const logs = await logsComData(alunoId, exercicioId);

  const porData = new Map();
  for (const l of logs) {
    if (!l.data) continue;
    if (!porData.has(l.data)) porData.set(l.data, []);
    porData.get(l.data).push(l);
  }

  const pontos = [...porData.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, series]) => {
      const detalhes = [...series]
        .sort((a, b) => a.set_number - b.set_number)
        .map((s) => ({
          numero: s.set_number,
          peso: s.weight_kg,
          repeticoes: s.reps_done,
        }));
      return {
        data,
        pesoMaximo: Math.max(...series.map((s) => s.weight_kg ?? 0)) || null,
        volume: series.reduce((t, s) => t + (s.weight_kg ?? 0) * (s.reps_done ?? 0), 0) || null,
        series: series.length,
        detalhes,
      };
    });

  return {
    pontos,
    recorde: pontos.reduce((max, p) => (p.pesoMaximo > (max?.pesoMaximo ?? 0) ? p : max), null),
  };
}

export async function exerciciosComHistorico(alunoId) {
  const logs = await buscarTodasAsPaginas(() => sb.from("exercise_logs")
    .select("id,exercise_id, exercises(*)")
    .eq("student_id", alunoId).not("weight_kg", "is", null).order("id"));
  const vistos = new Map();
  for (const l of logs) if (l.exercises) vistos.set(l.exercise_id, l.exercises);
  return [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* ==================== lista pessoal do aluno ====================
   Separada da ficha: o professor prescreve, o aluno guarda o que quiser
   treinar por conta. Quem escreve aqui é só o dono da lista — o professor
   enxerga, mas não mexe. */

export async function listarListaPessoal(alunoId) {
  const linhas = await buscarTodasAsPaginas(() => sb.from("student_exercises")
    .select("*, exercises(*)").eq("student_id", alunoId)
    .order("order_index").order("id"));
  return linhas.map(({ exercises, ...item }) => ({ ...item, exercicio: exercises ?? null }));
}

export async function adicionarNaListaPessoal({ alunoId, exercicioId, notas = null }) {
  const ultimo = ok(await sb.from("student_exercises").select("order_index")
    .eq("student_id", alunoId).order("order_index", { ascending: false }).limit(1));
  const ordem = (ultimo[0]?.order_index ?? -1) + 1;
  return ok(
    await sb.from("student_exercises")
      .insert({ student_id: alunoId, exercise_id: exercicioId, notes: notas, order_index: ordem })
      .select().single()
  );
}

export async function atualizarItemDaListaPessoal(id, patch) {
  return ok(await sb.from("student_exercises").update(patch).eq("id", id).select().single());
}

export async function removerDaListaPessoal(id) {
  ok(await sb.from("student_exercises").delete().eq("id", id));
}

/* ==================== anotações ==================== */

export async function listarAnotacoes(alunoId) {
  return snapshotDoProprioAluno(alunoId, "anotacoes", () => buscarTodasAsPaginas(() => sb.from("notes").select("*").eq("student_id", alunoId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false }).order("id", { ascending: false })));
}

export async function criarAnotacao({ alunoId, conteudo, fixada = false }) {
  return ok(
    await sb.from("notes").insert({ student_id: alunoId, content: conteudo, pinned: fixada }).select().single()
  );
}

export async function atualizarAnotacao(id, patch) {
  const campos = {};
  if ("conteudo" in patch) campos.content = patch.conteudo;
  if ("fixada" in patch) campos.pinned = patch.fixada;
  return ok(await sb.from("notes").update(campos).eq("id", id).select().single());
}

export async function removerAnotacao(id) {
  ok(await sb.from("notes").delete().eq("id", id));
}

/* ==================== financeiro ==================== */

// Lê da VIEW, não da tabela: é ela que traz o status derivado. Ler a tabela
// direto devolveria pagamentos sem status e o app teria que recalcular — com
// risco de divergir da regra do banco.
export async function listarPagamentos(alunoId) {
  return buscarTodasAsPaginas(() => sb.from("payments_view").select("*")
    .eq("student_id", alunoId)
    .order("reference_month", { ascending: false }).order("id", { ascending: false }));
}

export async function listarPagamentosDoMes(mes = mesDeReferencia()) {
  const linhas = await buscarTodasAsPaginas(() =>
    sb.from("payments_view")
      .select("*, students!inner(profiles!inner(full_name,phone))")
      .eq("reference_month", mes).order("id")
  );
  return linhas
    .map(({ students, ...p }) => ({
      ...p,
      aluno: students?.profiles?.full_name ?? "(sem nome)",
      telefone: students?.profiles?.phone ?? null,
    }))
    .sort((a, b) => a.aluno.localeCompare(b.aluno, "pt-BR"));
}

/* ---------- dados de cobrança (chave Pix e texto da mensagem) ---------- */

export async function buscarConfiguracaoDeCobranca() {
  return ok(await sb.from("trainer_settings").select("*").eq("id", true).maybeSingle());
}

export async function salvarConfiguracaoDeCobranca(patch) {
  return ok(
    await sb.from("trainer_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", true).select().single()
  );
}

export async function darBaixa(pagamentoId, { data = hoje(), metodo = null } = {}) {
  return ok(
    await sb.from("payments").update({ paid_date: data, payment_method: metodo })
      .eq("id", pagamentoId).select().single()
  );
}

export async function reabrirPagamento(pagamentoId) {
  return atualizarLinha("payments", pagamentoId, { paid_date: null, payment_method: null }, "cobrança");
}

export async function criarPagamento(dados) {
  return ok(
    await sb.from("payments").insert({
      student_id: dados.alunoId,
      reference_month: dados.mes,
      amount: dados.valor,
      due_date: dados.vencimento,
      notes: dados.notas ?? null,
      // `package` fica fora da unicidade de uma cobrança por mês: o aluno pode
      // comprar dois pacotes no mesmo mês, e compra mesmo, quando as aulas
      // acabam antes do fim do mês.
      kind: dados.tipo ?? "monthly",
    }).select().single()
  );
}

// Quem decide o conjunto é o banco, não esta função.
//
// Antes havia duas regras de elegibilidade escritas em lugares diferentes — uma
// aqui e outra na tela da prévia — e elas discordavam em três pontos
// (`billing_type`, mensalidade zero e, o pior, `kind`: um pacote comprado no mês
// fazia a mensalidade do aluno desaparecer do lote sem aviso). Agora as duas
// chamam a mesma função SQL, então não têm como divergir.
export async function previaDeMensalidades(mes = mesDeReferencia()) {
  return ok(await sb.rpc("previa_de_mensalidades", { p_mes: mes }));
}

export async function gerarCobrancasDoMes(mes = mesDeReferencia()) {
  const linhas = ok(await sb.rpc("gerar_mensalidades", { p_mes: mes }));
  // A RPC devolve contagem, não as linhas: `[]` não distingue mais "nada a
  // fazer" de "o lote inteiro falhou por conflito numa linha só".
  const { criadas = 0, ja_existiam = 0 } = linhas?.[0] ?? {};
  return { criadas, jaExistiam: ja_existiam };
}

/* ==================== pacote de aulas avulsas ====================
   Pré-pago: o professor vende N aulas e o saldo cai a cada aula presencial
   dada. O saldo é SEMPRE derivado (comprado − consumido), nunca uma coluna:
   um contador guardado divergiria na primeira vez que alguém corrigisse uma
   aula lançada errado, e não haveria como saber qual dos dois está certo.
   É a mesma razão do status de pagamento (armadilha 2).                    */

// Traz a cobrança junto: sem ela não dá para dizer se o pacote foi pago, e o
// saldo não sabia distinguir aula comprada de aula fiada (REL-04).
export async function listarPacotes(alunoId) {
  const linhas = await buscarTodasAsPaginas(() => sb.from("class_packages")
    .select("*, pagamento:payments(id,paid_date,due_date)")
    .eq("student_id", alunoId)
    .order("purchased_on", { ascending: false }).order("id", { ascending: false }));
  return linhas.map((p) => ({ ...p, pago: Boolean(p.pagamento?.paid_date) }));
}

// A venda cria o pacote e a cobrança correspondente, ligados: dar baixa na
// cobrança é o que diz que o pacote foi pago, e não existe um segundo lugar
// para registrar o mesmo dinheiro.
// Uma transação no banco, com chave de idempotência.
//
// Antes eram duas requisições e uma compensação cega: se o pacote gravava e só a
// resposta se perdia, o `catch` apagava a cobrança boa e a FK `on delete set
// null` deixava o pacote órfão. Agora o par nasce junto ou não nasce.
//
// `requestId` é a INTENÇÃO, não a tentativa: um retry do mesmo clique repete a
// chave e recebe de volta a mesma venda. Gerar chave nova a cada tentativa
// venderia duas vezes — por isso ela é parâmetro, e não criada aqui dentro.
export async function venderPacote({ alunoId, aulas, valor, vencimento, notas = null, requestId }) {
  const linhas = ok(
    await sb.rpc("vender_pacote", {
      p_request_id: requestId ?? crypto.randomUUID(),
      p_student_id: alunoId,
      p_classes: aulas,
      p_amount: valor,
      p_due_date: vencimento ?? hoje(),
      p_notes: notas,
    })
  );
  const venda = linhas?.[0];
  if (!venda) throw new Error("A venda não retornou confirmação. Confira o financeiro do aluno.");
  return { id: venda.package_id, payment_id: venda.payment_id, criada: venda.criada };
}

export async function removerPacote(id) {
  // O banco recusa se a cobrança já foi paga ou se já houve aula presencial:
  // apagar nesses casos produziria saldo negativo e sumiria com o histórico.
  ok(await sb.rpc("cancelar_pacote", { p_package_id: id }));
}

// Aula presencial é uma linha de frequência com `workout_day_id` nulo e
// `in_person`. Já nasce concluída: o professor só marca depois que aconteceu.
export async function marcarAulaPresencial(alunoId, data = hoje()) {
  return ok(
    await sb.from("attendance").insert({
      student_id: alunoId,
      workout_day_id: null,
      date: data,
      in_person: true,
      completed_at: new Date().toISOString(),
      marked_by: "trainer",
    }).select().single()
  );
}

export async function listarAulasPresenciais(alunoId) {
  return buscarTodasAsPaginas(() => sb.from("attendance").select("*")
    .eq("student_id", alunoId).eq("in_person", true)
    .order("date", { ascending: false }).order("id", { ascending: false }));
}

export async function removerAulaPresencial(id) {
  ok(await sb.from("attendance").delete().eq("id", id).eq("in_person", true));
}

export async function saldoDeAulas(alunoId) {
  const [pacotes, aulas] = await Promise.all([listarPacotes(alunoId), listarAulasPresenciais(alunoId)]);
  return resumoDoSaldo(pacotes, aulas);
}
