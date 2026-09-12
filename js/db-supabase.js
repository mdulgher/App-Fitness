// Leo Personal Trainning — implementação Supabase
//
// Espelha EXATAMENTE as assinaturas de db-local.js. Se as duas divergirem, a
// troca em config.js deixa de ser indolor e as telas quebram — é a única regra
// que este arquivo precisa respeitar.
//
// Aqui a privacidade é de verdade: quem separa os dados de um aluno dos do
// outro são as políticas de RLS no banco, não este código. Um filtro esquecido
// abaixo devolve menos dados, nunca dados de outra pessoa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE } from "./config.js";
import { validarExercicio } from "./exercise-validation.js";
import { hoje, somarDias, diasEntre, inicioDaSemana, mesDeReferencia } from "./utils.js";

export const sb = createClient(SUPABASE.url, SUPABASE.anonKey);

// Erro de banco vira exceção com mensagem legível, em vez de `null` silencioso
// que só explode três telas adiante.
function ok(res) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
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

export async function sairDaConta() {
  await sb.auth.signOut();
}

export async function usuarioDaSessao() {
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

function traduzErro(msg) {
  if (/invalid login credentials/i.test(msg)) return "Email ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu email antes de entrar.";
  if (/already registered|already been registered/i.test(msg)) return "Esse email já tem conta.";
  if (/password should be at least/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
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
  return ok(await sb.from("profiles").select("*").order("full_name"));
}

export async function buscarPerfil(id) {
  return ok(await sb.from("profiles").select("*").eq("id", id).maybeSingle());
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

  return ok(await sb.from("profiles").update(campos).eq("id", user.id).select().single());
}

export async function alterarMinhaSenha(nova) {
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) throw new Error(traduzErro(error.message));
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
    ok(await sb.from("attendance").select("student_id,date,completed_at").in("student_id", ids).not("completed_at", "is", null)),
    ok(await sb.from("workout_plans").select("id,student_id,end_date").in("student_id", ids).eq("active", true)),
    ok(await sb.from("payments").select("student_id,due_date,paid_date").in("student_id", ids).is("paid_date", null)),
  ]);

  const segunda = inicioDaSemana(H);
  const mapa = new Map();

  for (const aluno of alunos) {
    const minhas = sessoes.filter((s) => s.student_id === aluno.id).sort((a, b) => b.date.localeCompare(a.date));
    const ultimoTreino = minhas[0]?.date ?? null;
    const ficha = fichas.find((f) => f.student_id === aluno.id);
    const abertos = pagamentos.filter((p) => p.student_id === aluno.id);

    mapa.set(aluno.id, {
      ultimoTreino,
      diasSemTreinar: ultimoTreino ? diasEntre(ultimoTreino, H) : null,
      treinosNaSemana: minhas.filter((s) => s.date >= segunda).length,
      metaSemanal: aluno.weekly_target,
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
  let q = sb.from("students").select("*, profiles!inner(full_name,email,phone,avatar_url)");
  if (!incluirInativos) q = q.eq("active", true);

  const alunos = ok(await q).map(achatar);
  const resumos = await montarResumos(alunos);
  return alunos
    .map((a) => ({ ...a, resumo: resumos.get(a.id) }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
}

export async function buscarAluno(id) {
  const linha = ok(
    await sb.from("students").select("*, profiles!inner(full_name,email,phone,avatar_url)").eq("id", id).maybeSingle()
  );
  if (!linha) return null;
  const aluno = achatar(linha);
  const resumos = await montarResumos([aluno]);
  return { ...aluno, resumo: resumos.get(aluno.id) };
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

export async function desativarAluno(id, ativo = false) {
  return ok(await sb.from("students").update({ active: ativo }).eq("id", id).select().single());
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
  let q = sb.from("exercises").select("*").order("name");
  if (!incluirArquivados) q = q.eq("archived", false);
  return ok(await q);
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
  const f = ok(
    await sb.from("workout_plans").select(FICHA_COMPLETA).eq("student_id", alunoId).eq("active", true).maybeSingle()
  );
  return normalizar(f);
}

export async function buscarFicha(id) {
  return normalizar(ok(await sb.from("workout_plans").select(FICHA_COMPLETA).eq("id", id).maybeSingle()));
}

export async function listarFichas(alunoId) {
  return ok(
    await sb.from("workout_plans").select("*").eq("student_id", alunoId).order("start_date", { ascending: false })
  );
}

export async function listarTemplates() {
  return ok(await sb.from("workout_plans").select("*").eq("is_template", true).order("title"));
}

/* ---------- edição da ficha (só o professor; garantido por RLS) ---------- */

export async function criarFicha({ alunoId, titulo, descricao = null, inicio = hoje(), fim = null }) {
  return ok(
    await sb.from("workout_plans").insert({
      student_id: alunoId, title: titulo, description: descricao,
      start_date: inicio, end_date: fim, active: false,
    }).select().single()
  );
}

export async function atualizarFicha(id, patch) {
  return ok(await sb.from("workout_plans").update(patch).eq("id", id).select().single());
}

// Ativar uma ficha desativa as outras do mesmo aluno: `fichaAtiva()` usa
// `maybeSingle()` e duas ativas quebrariam a tela do aluno com erro de
// "múltiplas linhas" em vez de simplesmente mostrar a mais nova.
export async function ativarFicha(id) {
  const ficha = ok(await sb.from("workout_plans").select("student_id").eq("id", id).maybeSingle());
  if (!ficha) throw new Error("Ficha não encontrada.");
  ok(await sb.from("workout_plans").update({ active: false }).eq("student_id", ficha.student_id));
  return ok(await sb.from("workout_plans").update({ active: true }).eq("id", id).select().single());
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
  return ok(await sb.from("workout_days").update(patch).eq("id", id).select().single());
}

export async function removerDia(id) {
  ok(await sb.from("workout_days").delete().eq("id", id));
}

export async function adicionarExercicioNoDia({ diaId, exercicioId, ...resto }) {
  const existentes = ok(await sb.from("workout_day_exercises").select("order_index").eq("workout_day_id", diaId));
  const ordem = existentes.reduce((max, e) => Math.max(max, e.order_index + 1), 0);
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
  return ok(await sb.from("workout_day_exercises").update(patch).eq("id", id).select().single());
}

export async function removerItemDoDia(id) {
  ok(await sb.from("workout_day_exercises").delete().eq("id", id));
}

export async function buscarDiaDeTreino(diaId) {
  const dia = ok(await sb.from("workout_days").select("workout_plan_id").eq("id", diaId).maybeSingle());
  if (!dia) return null;
  const ficha = await buscarFicha(dia.workout_plan_id);
  return ficha?.dias.find((d) => d.id === diaId) ?? null;
}

/* ==================== sessões de treino ==================== */

export async function listarSessoes(alunoId, { de = null, ate = null } = {}) {
  let q = sb.from("attendance").select("*").eq("student_id", alunoId).order("date", { ascending: false });
  if (de) q = q.gte("date", de);
  if (ate) q = q.lte("date", ate);
  return ok(await q);
}

export async function abrirSessao(alunoId, diaId, data = hoje()) {
  const existente = ok(
    await sb.from("attendance").select("*").eq("student_id", alunoId).eq("date", data).eq("workout_day_id", diaId).maybeSingle()
  );
  if (existente) return existente;

  return ok(
    await sb.from("attendance").insert({ student_id: alunoId, workout_day_id: diaId, date: data }).select().single()
  );
}

export async function concluirSessao(sessaoId, porQuem = "student") {
  return ok(
    await sb.from("attendance")
      .update({ completed_at: new Date().toISOString(), marked_by: porQuem })
      .eq("id", sessaoId).select().single()
  );
}

export async function removerSessao(sessaoId) {
  ok(await sb.from("attendance").delete().eq("id", sessaoId));
}

export async function resumoDaSemana(alunoId, referencia = hoje()) {
  const segunda = inicioDaSemana(referencia);
  const domingo = somarDias(segunda, 6);

  const [aluno, feitos] = await Promise.all([
    ok(await sb.from("students").select("weekly_target").eq("id", alunoId).maybeSingle()),
    ok(await sb.from("attendance").select("date").eq("student_id", alunoId)
      .not("completed_at", "is", null).gte("date", segunda).lte("date", domingo)),
  ]);

  const meta = aluno?.weekly_target ?? 0;
  return {
    inicio: segunda,
    fim: domingo,
    feitos: feitos.length,
    meta,
    aderencia: meta ? Math.min(1, feitos.length / meta) : 0,
    datas: feitos.map((f) => f.date).sort(),
  };
}

export async function proximoTreinoSugerido(alunoId) {
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
}

/* ==================== cargas e progressão ==================== */

export async function listarCargasDaSessao(sessaoId) {
  return ok(await sb.from("exercise_logs").select("*").eq("attendance_id", sessaoId).order("set_number"));
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
  const logs = ok(
    await sb.from("exercise_logs")
      .select("*, attendance!inner(date)")
      .eq("student_id", alunoId).eq("exercise_id", exercicioId)
  );
  return logs.map(({ attendance, ...l }) => ({ ...l, data: attendance?.date ?? "" }));
}

export async function ultimaVezNoExercicio(alunoId, exercicioId, ignorarSessaoId = null) {
  const logs = (await logsComData(alunoId, exercicioId)).filter((l) => l.attendance_id !== ignorarSessaoId);
  if (!logs.length) return null;

  const ultimaData = logs.map((l) => l.data).sort().at(-1);
  const series = logs.filter((l) => l.data === ultimaData).sort((a, b) => a.set_number - b.set_number);

  return {
    data: ultimaData,
    series,
    pesoMaximo: Math.max(...series.map((s) => s.weight_kg ?? 0)) || null,
  };
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
    .map(([data, series]) => ({
      data,
      pesoMaximo: Math.max(...series.map((s) => s.weight_kg ?? 0)) || null,
      volume: series.reduce((t, s) => t + (s.weight_kg ?? 0) * (s.reps_done ?? 0), 0) || null,
      series: series.length,
    }));

  return {
    pontos,
    recorde: pontos.reduce((max, p) => (p.pesoMaximo > (max?.pesoMaximo ?? 0) ? p : max), null),
  };
}

export async function exerciciosComHistorico(alunoId) {
  const logs = ok(
    await sb.from("exercise_logs").select("exercise_id, exercises(*)")
      .eq("student_id", alunoId).not("weight_kg", "is", null)
  );
  const vistos = new Map();
  for (const l of logs) if (l.exercises) vistos.set(l.exercise_id, l.exercises);
  return [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* ==================== lista pessoal do aluno ====================
   Separada da ficha: o professor prescreve, o aluno guarda o que quiser
   treinar por conta. Quem escreve aqui é só o dono da lista — o professor
   enxerga, mas não mexe. */

export async function listarListaPessoal(alunoId) {
  const linhas = ok(
    await sb.from("student_exercises").select("*, exercises(*)")
      .eq("student_id", alunoId).order("order_index")
  );
  return linhas.map(({ exercises, ...item }) => ({ ...item, exercicio: exercises ?? null }));
}

export async function adicionarNaListaPessoal({ alunoId, exercicioId, notas = null }) {
  const atuais = ok(await sb.from("student_exercises").select("order_index").eq("student_id", alunoId));
  const ordem = atuais.reduce((max, i) => Math.max(max, i.order_index + 1), 0);
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
  return ok(
    await sb.from("notes").select("*").eq("student_id", alunoId)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false })
  );
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
  return ok(
    await sb.from("payments_view").select("*").eq("student_id", alunoId)
      .order("reference_month", { ascending: false })
  );
}

export async function listarPagamentosDoMes(mes = mesDeReferencia()) {
  const linhas = ok(
    await sb.from("payments_view")
      .select("*, students!inner(profiles!inner(full_name,phone))")
      .eq("reference_month", mes)
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
  return ok(
    await sb.from("payments").update({ paid_date: null, payment_method: null })
      .eq("id", pagamentoId).select().single()
  );
}

export async function criarPagamento(dados) {
  return ok(
    await sb.from("payments").insert({
      student_id: dados.alunoId,
      reference_month: dados.mes,
      amount: dados.valor,
      due_date: dados.vencimento,
      notes: dados.notas ?? null,
    }).select().single()
  );
}

export async function gerarCobrancasDoMes(mes = mesDeReferencia()) {
  const [alunos, existentes] = await Promise.all([
    ok(await sb.from("students").select("id,monthly_fee,due_day").eq("active", true).not("monthly_fee", "is", null)),
    ok(await sb.from("payments").select("student_id").eq("reference_month", mes)),
  ]);

  const jaTem = new Set(existentes.map((p) => p.student_id));
  const novos = alunos
    .filter((a) => !jaTem.has(a.id))
    .map((a) => ({
      student_id: a.id,
      reference_month: mes,
      amount: a.monthly_fee,
      due_date: `${mes.slice(0, 7)}-${String(a.due_day ?? 5).padStart(2, "0")}`,
    }));

  if (!novos.length) return [];
  // ignoreDuplicates: clicar duas vezes não gera cobrança repetida, garantido
  // pela restrição de unicidade do banco e não por sorte de temporização.
  return ok(await sb.from("payments").upsert(novos, { onConflict: "student_id,reference_month", ignoreDuplicates: true }).select());
}
