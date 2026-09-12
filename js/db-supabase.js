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

export async function criarConta(email, senha, nome) {
  const { data, error } = await sb.auth.signUp({
    email,
    password: senha,
    options: { data: { full_name: nome } },
  });
  if (error) throw new Error(traduzErro(error.message));
  return data.user;
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

// O aluno precisa existir em auth.users antes: profiles.id referencia a conta.
// Criar a conta de outra pessoa a partir do navegador exigiria a service_role,
// que nunca entra no front-end — por isso o fluxo real é por convite (PLANO.md
// seção 5). Aqui só se completa o cadastro de quem já tem conta.
export async function criarAluno({ id, full_name, email, phone, ...dados }) {
  if (!id) throw new Error("O aluno precisa criar a conta antes; use o convite.");
  await sb.from("profiles").update({ full_name, email, phone }).eq("id", id);
  return ok(
    await sb.from("students").insert({
      id,
      birth_date: dados.birth_date ?? null,
      goal: dados.goal ?? null,
      height_cm: dados.height_cm ?? null,
      start_weight_kg: dados.start_weight_kg ?? null,
      health_restrictions: dados.health_restrictions ?? null,
      weekly_target: dados.weekly_target ?? 3,
      monthly_fee: dados.monthly_fee ?? null,
      due_day: dados.due_day ?? 5,
      active: true,
    }).select().single()
  );
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
    await sb.from("payments_view").select("*, students!inner(profiles!inner(full_name))").eq("reference_month", mes)
  );
  return linhas
    .map(({ students, ...p }) => ({ ...p, aluno: students?.profiles?.full_name ?? "(sem nome)" }))
    .sort((a, b) => a.aluno.localeCompare(b.aluno, "pt-BR"));
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
