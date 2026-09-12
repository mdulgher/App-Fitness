// Leo Personal Trainning — implementação local (localStorage)
//
// Mesma assinatura de db-supabase.js. Todas as funções são assíncronas de
// propósito, mesmo sem precisar: é o que permite trocar a implementação na
// Fase 8 sem reescrever nenhuma tela.

import { criarDadosIniciais } from "./seed.js";
import { validarExercicio } from "./exercise-validation.js";
import { atualizarColecaoDemo } from "./catalogo-peito.js";
import {
  hoje,
  somarDias,
  diasEntre,
  inicioDaSemana,
  mesDeReferencia,
  uid,
} from "./utils.js";

const CHAVE = "lpt.db.v1";

let cache = null;

function carregar() {
  if (cache) return cache;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      cache = JSON.parse(bruto);
      if (atualizarColecaoDemo(cache)) salvar();
      return cache;
    }
  } catch {
    // localStorage indisponível ou corrompido: recomeça do zero.
  }
  cache = criarDadosIniciais();
  atualizarColecaoDemo(cache);
  salvar();
  return cache;
}

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch {
    // Sem espaço ou sem permissão: o app segue funcionando em memória.
  }
}

// Tabelas criadas depois do seed original não existem nos dados já salvos no
// navegador. Criar sob demanda evita que quem testou ontem precise apagar tudo
// para ver a tela de hoje.
function tabela(nome) {
  const dados = carregar();
  if (!dados[nome]) {
    dados[nome] = [];
    salvar();
  }
  return dados[nome];
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export async function reiniciarDados() {
  cache = criarDadosIniciais();
  salvar();
}

/* ==================== sessão ====================
   Mesma assinatura de db-supabase.js, mas sem senha de verdade: só confere se
   o email existe nos dados de teste. Nada aqui protege nada — a verificação
   real só existe com o banco. */

const CHAVE_SESSAO = "lpt.session.v1";

export async function entrarComSenha(email) {
  const perfil = tabela("profiles").find(
    (p) => p.email?.toLowerCase().trim() === email.toLowerCase().trim()
  );
  if (!perfil) throw new Error("Email não encontrado.");
  return entrarComoId(perfil.id);
}

export async function entrarComoId(id) {
  try {
    localStorage.setItem(CHAVE_SESSAO, id);
  } catch {}
  return { id };
}

export async function criarConta() {
  throw new Error("Criar conta só funciona com o banco conectado.");
}

export async function alunoVinculado(id) {
  return tabela("students").some((a) => a.id === id);
}

export async function desativarAluno(id, ativo = false) {
  return atualizarAluno(id, { active: ativo });
}

export async function sairDaConta() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {}
}

export async function usuarioDaSessao() {
  try {
    const id = localStorage.getItem(CHAVE_SESSAO);
    return id ? { id } : null;
  } catch {
    return null;
  }
}

/* ==================== perfis ==================== */

export async function listarPerfis() {
  return clone(tabela("profiles"));
}

export async function atualizarMeuPerfil(patch) {
  const id = localStorage.getItem(CHAVE_SESSAO);
  const perfil = tabela("profiles").find((p) => p.id === id);
  if (!perfil) throw new Error("Sua sessão expirou. Entre de novo.");
  for (const c of ["full_name", "phone", "avatar_url"]) {
    if (c in patch) perfil[c] = patch[c];
  }
  salvar();
  return clone(perfil);
}

// No modo local não existe senha de verdade — este método só existe para a
// assinatura bater com a do Supabase.
export async function alterarMinhaSenha() {
  throw new Error("Trocar senha só funciona com o banco conectado.");
}

export async function buscarPerfil(id) {
  return clone(tabela("profiles").find((p) => p.id === id) ?? null);
}

/* ==================== alunos ==================== */

function resumoDoAluno(aluno) {
  const H = hoje();
  const sessoes = tabela("attendance")
    .filter((a) => a.student_id === aluno.id && a.completed_at)
    .sort((a, b) => b.date.localeCompare(a.date));

  const ultimoTreino = sessoes[0]?.date ?? null;
  const segunda = inicioDaSemana(H);
  const treinosNaSemana = sessoes.filter((s) => s.date >= segunda).length;

  const fichaAtiva = tabela("workout_plans").find(
    (p) => p.student_id === aluno.id && p.active
  );

  const pagamentos = tabela("payments").filter((p) => p.student_id === aluno.id);
  const emAberto = pagamentos.filter((p) => !p.paid_date);
  const vencido = emAberto.some((p) => p.due_date < H);

  return {
    ultimoTreino,
    diasSemTreinar: ultimoTreino ? diasEntre(ultimoTreino, H) : null,
    treinosNaSemana,
    metaSemanal: aluno.weekly_target,
    temFichaAtiva: Boolean(fichaAtiva),
    fichaAtivaId: fichaAtiva?.id ?? null,
    fichaVenceEm: fichaAtiva?.end_date ?? null,
    statusFinanceiro: vencido ? "overdue" : emAberto.length ? "pending" : "paid",
  };
}

function juntarPerfil(aluno) {
  const perfil = tabela("profiles").find((p) => p.id === aluno.id);
  return {
    ...clone(aluno),
    full_name: perfil?.full_name ?? "(sem nome)",
    email: perfil?.email ?? null,
    phone: perfil?.phone ?? null,
    avatar_url: perfil?.avatar_url ?? null,
    resumo: resumoDoAluno(aluno),
  };
}

export async function listarAlunos({ incluirInativos = false } = {}) {
  return tabela("students")
    .filter((a) => incluirInativos || a.active)
    .map(juntarPerfil)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
}

export async function buscarAluno(id) {
  const aluno = tabela("students").find((a) => a.id === id);
  return aluno ? juntarPerfil(aluno) : null;
}

export async function criarAluno({ full_name, email, phone, ...dados }) {
  const id = uid();
  tabela("profiles").push({
    id,
    role: "student",
    full_name,
    email,
    phone: phone ?? null,
    avatar_url: null,
    created_at: hoje(),
  });
  tabela("students").push({
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
    created_at: hoje(),
  });
  salvar();
  // Mesmo formato de db-supabase.js, onde a senha temporária volta da Edge
  // Function para o professor repassar ao aluno.
  return { id, email, full_name, senha: null };
}

export async function atualizarAluno(id, patch) {
  const perfil = tabela("profiles").find((p) => p.id === id);
  const aluno = tabela("students").find((a) => a.id === id);
  if (!aluno) return null;
  for (const campo of ["full_name", "email", "phone"]) {
    if (campo in patch && perfil) perfil[campo] = patch[campo];
  }
  for (const [k, v] of Object.entries(patch)) {
    if (!["full_name", "email", "phone"].includes(k)) aluno[k] = v;
  }
  salvar();
  return buscarAluno(id);
}

/* ==================== exercícios ==================== */

export async function listarExercicios({ incluirArquivados = false } = {}) {
  return clone(
    tabela("exercises")
      .filter((e) => incluirArquivados || !e.archived)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  );
}

export async function buscarExercicio(id) {
  return clone(tabela("exercises").find((e) => e.id === id) ?? null);
}

export async function criarExercicio(dados) {
  dados = validarExercicio(dados);
  const novo = {
    id: uid(),
    name: dados.name,
    muscle_group: dados.muscle_group ?? null,
    equipment: dados.equipment ?? null,
    video_url: dados.video_url ?? null,
    photo_url: dados.photo_url ?? null,
    how_to: dados.how_to ?? null,
    archived: false,
    created_at: hoje(),
  };
  tabela("exercises").push(novo);
  salvar();
  return clone(novo);
}

export async function atualizarExercicio(id, patch) {
  patch = validarExercicio(patch, true);
  const ex = tabela("exercises").find((e) => e.id === id);
  if (!ex) throw new Error("Exercício não encontrado.");
  Object.assign(ex, patch);
  salvar();
  return clone(ex);
}

// Arquiva em vez de apagar: exercício apagado furaria todas as fichas antigas
// onde ele aparece, e levaria o histórico de cargas com ele.
export async function arquivarExercicio(id) {
  return atualizarExercicio(id, { archived: true });
}

/* ==================== fichas ==================== */

function montarFicha(ficha) {
  if (!ficha) return null;
  const dias = tabela("workout_days")
    .filter((d) => d.workout_plan_id === ficha.id)
    .sort((a, b) => a.order_index - b.order_index)
    .map((dia) => ({
      ...clone(dia),
      exercicios: tabela("workout_day_exercises")
        .filter((x) => x.workout_day_id === dia.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((item) => ({
          ...clone(item),
          exercicio: clone(
            tabela("exercises").find((e) => e.id === item.exercise_id) ?? null
          ),
        })),
    }));
  return { ...clone(ficha), dias };
}

export async function fichaAtiva(alunoId) {
  const ficha = tabela("workout_plans").find(
    (p) => p.student_id === alunoId && p.active
  );
  return montarFicha(ficha);
}

export async function buscarFicha(id) {
  return montarFicha(tabela("workout_plans").find((p) => p.id === id));
}

export async function listarFichas(alunoId) {
  return tabela("workout_plans")
    .filter((p) => p.student_id === alunoId)
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""))
    .map(clone);
}

export async function listarTemplates() {
  return clone(tabela("workout_plans").filter((p) => p.is_template));
}

/* ---------- edição da ficha ---------- */

export async function criarFicha({ alunoId, titulo, descricao = null, inicio = hoje(), fim = null }) {
  const nova = {
    id: uid(),
    student_id: alunoId,
    is_template: false,
    title: titulo,
    description: descricao,
    start_date: inicio,
    end_date: fim,
    active: false,
    created_at: hoje(),
    updated_at: hoje(),
  };
  tabela("workout_plans").push(nova);
  salvar();
  return clone(nova);
}

export async function atualizarFicha(id, patch) {
  const f = tabela("workout_plans").find((p) => p.id === id);
  if (!f) throw new Error("Ficha não encontrada.");
  Object.assign(f, patch, { updated_at: hoje() });
  salvar();
  return clone(f);
}

// Uma ficha ativa por aluno: `fichaAtiva()` devolve a primeira que encontrar e
// duas ativas dariam ao aluno um treino diferente a cada recarga.
export async function ativarFicha(id) {
  const alvo = tabela("workout_plans").find((p) => p.id === id);
  if (!alvo) throw new Error("Ficha não encontrada.");
  for (const f of tabela("workout_plans")) {
    if (f.student_id === alvo.student_id) f.active = f.id === id;
  }
  salvar();
  return clone(alvo);
}

export async function removerFicha(id) {
  const dados = carregar();
  const dias = tabela("workout_days").filter((d) => d.workout_plan_id === id).map((d) => d.id);
  dados.workout_day_exercises = tabela("workout_day_exercises").filter((x) => !dias.includes(x.workout_day_id));
  dados.workout_days = tabela("workout_days").filter((d) => d.workout_plan_id !== id);
  dados.workout_plans = tabela("workout_plans").filter((p) => p.id !== id);
  salvar();
}

export async function criarDia({ fichaId, rotulo, ordem = 0, diasSemana = [] }) {
  const novo = {
    id: uid(),
    workout_plan_id: fichaId,
    label: rotulo,
    order_index: ordem,
    weekdays: diasSemana,
    weekday_suggestion: null,
  };
  tabela("workout_days").push(novo);
  salvar();
  return clone(novo);
}

export async function atualizarDia(id, patch) {
  const d = tabela("workout_days").find((x) => x.id === id);
  if (!d) throw new Error("Divisão não encontrada.");
  Object.assign(d, patch);
  salvar();
  return clone(d);
}

export async function removerDia(id) {
  const dados = carregar();
  dados.workout_day_exercises = tabela("workout_day_exercises").filter((x) => x.workout_day_id !== id);
  dados.workout_days = tabela("workout_days").filter((d) => d.id !== id);
  salvar();
}

export async function adicionarExercicioNoDia({ diaId, exercicioId, ...resto }) {
  const irmaos = tabela("workout_day_exercises").filter((x) => x.workout_day_id === diaId);
  const novo = {
    id: uid(),
    workout_day_id: diaId,
    exercise_id: exercicioId,
    order_index: resto.ordem ?? irmaos.reduce((max, i) => Math.max(max, i.order_index + 1), 0),
    group_label: resto.grupo ?? null,
    sets: resto.series ?? 3,
    reps: resto.reps ?? "10-12",
    rest_seconds: resto.descanso ?? 60,
    load_notes: resto.carga ?? null,
    trainer_notes: resto.observacao ?? null,
  };
  tabela("workout_day_exercises").push(novo);
  salvar();
  return clone(novo);
}

export async function atualizarItemDoDia(id, patch) {
  const item = tabela("workout_day_exercises").find((x) => x.id === id);
  if (!item) throw new Error("Exercício não encontrado na ficha.");
  Object.assign(item, patch);
  salvar();
  return clone(item);
}

export async function removerItemDoDia(id) {
  const dados = carregar();
  dados.workout_day_exercises = tabela("workout_day_exercises").filter((x) => x.id !== id);
  salvar();
}

export async function buscarDiaDeTreino(diaId) {
  const dia = tabela("workout_days").find((d) => d.id === diaId);
  if (!dia) return null;
  const ficha = await buscarFicha(dia.workout_plan_id);
  return ficha?.dias.find((d) => d.id === diaId) ?? null;
}

/* ==================== sessões de treino (frequência) ==================== */

export async function listarSessoes(alunoId, { de = null, ate = null } = {}) {
  return tabela("attendance")
    .filter(
      (a) =>
        a.student_id === alunoId &&
        (!de || a.date >= de) &&
        (!ate || a.date <= ate)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(clone);
}

// Abre a sessão do dia (ou devolve a que já existe). As cargas precisam de uma
// sessão para se pendurar, por isso ela nasce quando o aluno entra no treino e
// só é concluída no final.
export async function abrirSessao(alunoId, diaId, data = hoje()) {
  const existente = tabela("attendance").find(
    (a) =>
      a.student_id === alunoId && a.date === data && a.workout_day_id === diaId
  );
  if (existente) return clone(existente);

  const nova = {
    id: uid(),
    student_id: alunoId,
    workout_day_id: diaId,
    date: data,
    completed_at: null,
    marked_by: "student",
    created_at: new Date().toISOString(),
  };
  tabela("attendance").push(nova);
  salvar();
  return clone(nova);
}

export async function concluirSessao(sessaoId, porQuem = "student") {
  const s = tabela("attendance").find((a) => a.id === sessaoId);
  if (!s) return null;
  s.completed_at = new Date().toISOString();
  s.marked_by = porQuem;
  salvar();
  return clone(s);
}

export async function removerSessao(sessaoId) {
  const db = carregar();
  db.attendance = db.attendance.filter((a) => a.id !== sessaoId);
  db.exercise_logs = db.exercise_logs.filter((l) => l.attendance_id !== sessaoId);
  salvar();
}

export async function resumoDaSemana(alunoId, referencia = hoje()) {
  const segunda = inicioDaSemana(referencia);
  const domingo = somarDias(segunda, 6);
  const aluno = tabela("students").find((a) => a.id === alunoId);
  const feitos = tabela("attendance").filter(
    (a) =>
      a.student_id === alunoId &&
      a.completed_at &&
      a.date >= segunda &&
      a.date <= domingo
  );
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

// Próximo treino da rotação A -> B -> C, para o aluno não repetir sempre o A.
export async function proximoTreinoSugerido(alunoId) {
  const ficha = await fichaAtiva(alunoId);
  if (!ficha || !ficha.dias.length) return null;
  const ultima = tabela("attendance")
    .filter((a) => a.student_id === alunoId && a.completed_at && a.workout_day_id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!ultima) return ficha.dias[0];
  const idx = ficha.dias.findIndex((d) => d.id === ultima.workout_day_id);
  return ficha.dias[(idx + 1) % ficha.dias.length];
}

/* ==================== cargas / progressão ==================== */

export async function listarCargasDaSessao(sessaoId) {
  return clone(
    tabela("exercise_logs")
      .filter((l) => l.attendance_id === sessaoId)
      .sort((a, b) => a.set_number - b.set_number)
  );
}

export async function registrarSerie({
  alunoId,
  sessaoId,
  workoutDayExerciseId,
  exercicioId,
  serie,
  peso = null,
  reps = null,
  duracao = null,
  rpe = null,
  notas = null,
}) {
  const existente = tabela("exercise_logs").find(
    (l) =>
      l.attendance_id === sessaoId &&
      l.workout_day_exercise_id === workoutDayExerciseId &&
      l.set_number === serie
  );
  if (existente) {
    Object.assign(existente, {
      weight_kg: peso,
      reps_done: reps,
      duration_seconds: duracao,
      rpe,
      notes: notas,
    });
    salvar();
    return clone(existente);
  }
  const novo = {
    id: uid(),
    student_id: alunoId,
    attendance_id: sessaoId,
    workout_day_exercise_id: workoutDayExerciseId,
    exercise_id: exercicioId, // redundante de propósito: sobrevive à troca de ficha
    set_number: serie,
    weight_kg: peso,
    reps_done: reps,
    duration_seconds: duracao,
    rpe,
    notes: notas,
    created_at: new Date().toISOString(),
  };
  tabela("exercise_logs").push(novo);
  salvar();
  return clone(novo);
}

// A referência que faz o registro de carga valer a pena: sem ver o que fez na
// última vez, o aluno não sabe o que tentar hoje.
export async function ultimaVezNoExercicio(alunoId, exercicioId, ignorarSessaoId = null) {
  const logs = tabela("exercise_logs").filter(
    (l) =>
      l.student_id === alunoId &&
      l.exercise_id === exercicioId &&
      l.attendance_id !== ignorarSessaoId
  );
  if (!logs.length) return null;

  const sessoes = tabela("attendance");
  const comData = logs.map((l) => ({
    ...l,
    data: sessoes.find((a) => a.id === l.attendance_id)?.date ?? "",
  }));
  const ultimaData = comData.map((l) => l.data).sort().at(-1);
  const series = comData
    .filter((l) => l.data === ultimaData)
    .sort((a, b) => a.set_number - b.set_number);

  return {
    data: ultimaData,
    series: clone(series),
    pesoMaximo: Math.max(...series.map((s) => s.weight_kg ?? 0)) || null,
  };
}

export async function progressaoDoExercicio(alunoId, exercicioId) {
  const sessoes = tabela("attendance");
  const logs = tabela("exercise_logs").filter(
    (l) => l.student_id === alunoId && l.exercise_id === exercicioId
  );

  const porData = new Map();
  for (const l of logs) {
    const data = sessoes.find((a) => a.id === l.attendance_id)?.date;
    if (!data) continue;
    if (!porData.has(data)) porData.set(data, []);
    porData.get(data).push(l);
  }

  const pontos = [...porData.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, series]) => {
      const pesos = series.map((s) => s.weight_kg ?? 0);
      const volume = series.reduce(
        (t, s) => t + (s.weight_kg ?? 0) * (s.reps_done ?? 0),
        0
      );
      return {
        data,
        pesoMaximo: Math.max(...pesos) || null,
        volume: volume || null,
        series: series.length,
      };
    });

  return {
    pontos,
    recorde: pontos.reduce(
      (max, p) => (p.pesoMaximo > (max?.pesoMaximo ?? 0) ? p : max),
      null
    ),
  };
}

// Exercícios que o aluno já registrou carga, para a tela de progressão.
export async function exerciciosComHistorico(alunoId) {
  const ids = [
    ...new Set(
      tabela("exercise_logs")
        .filter((l) => l.student_id === alunoId && l.weight_kg != null)
        .map((l) => l.exercise_id)
    ),
  ];
  return ids
    .map((id) => clone(tabela("exercises").find((e) => e.id === id)))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* ==================== lista pessoal do aluno ==================== */

export async function listarListaPessoal(alunoId) {
  return tabela("student_exercises")
    .filter((i) => i.student_id === alunoId)
    .sort((a, b) => a.order_index - b.order_index)
    .map((item) => ({
      ...clone(item),
      exercicio: clone(tabela("exercises").find((e) => e.id === item.exercise_id) ?? null),
    }));
}

export async function adicionarNaListaPessoal({ alunoId, exercicioId, notas = null }) {
  const minhas = tabela("student_exercises").filter((i) => i.student_id === alunoId);
  if (minhas.some((i) => i.exercise_id === exercicioId)) {
    throw new Error("Esse exercício já está na sua lista.");
  }
  const novo = {
    id: uid(),
    student_id: alunoId,
    exercise_id: exercicioId,
    notes: notas,
    order_index: minhas.reduce((max, i) => Math.max(max, i.order_index + 1), 0),
    created_at: hoje(),
  };
  tabela("student_exercises").push(novo);
  salvar();
  return clone(novo);
}

export async function atualizarItemDaListaPessoal(id, patch) {
  const item = tabela("student_exercises").find((i) => i.id === id);
  if (!item) throw new Error("Item não encontrado.");
  Object.assign(item, patch);
  salvar();
  return clone(item);
}

export async function removerDaListaPessoal(id) {
  const dados = carregar();
  dados.student_exercises = tabela("student_exercises").filter((i) => i.id !== id);
  salvar();
}

/* ==================== anotações ==================== */

export async function listarAnotacoes(alunoId) {
  return clone(
    tabela("notes")
      .filter((n) => n.student_id === alunoId)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return String(b.created_at).localeCompare(String(a.created_at));
      })
  );
}

export async function criarAnotacao({ alunoId, conteudo, fixada = false }) {
  const nova = {
    id: uid(),
    student_id: alunoId,
    content: conteudo,
    pinned: fixada,
    created_at: hoje(),
  };
  tabela("notes").push(nova);
  salvar();
  return clone(nova);
}

export async function atualizarAnotacao(id, patch) {
  const n = tabela("notes").find((x) => x.id === id);
  if (!n) return null;
  if ("conteudo" in patch) n.content = patch.conteudo;
  if ("fixada" in patch) n.pinned = patch.fixada;
  salvar();
  return clone(n);
}

export async function removerAnotacao(id) {
  const db = carregar();
  db.notes = db.notes.filter((n) => n.id !== id);
  salvar();
}

/* ==================== financeiro ==================== */

export async function listarPagamentos(alunoId) {
  return clone(
    tabela("payments")
      .filter((p) => p.student_id === alunoId)
      .sort((a, b) => b.reference_month.localeCompare(a.reference_month))
  );
}

export async function listarPagamentosDoMes(mes = mesDeReferencia()) {
  return tabela("payments")
    .filter((p) => p.reference_month === mes)
    .map((p) => {
      const perfil = tabela("profiles").find((x) => x.id === p.student_id);
      return {
        ...clone(p),
        aluno: perfil?.full_name ?? "(sem nome)",
        telefone: perfil?.phone ?? null,
      };
    })
    .sort((a, b) => a.aluno.localeCompare(b.aluno, "pt-BR"));
}

/* ---------- dados de cobrança (chave Pix e texto da mensagem) ---------- */

const COBRANCA_PADRAO = {
  id: true,
  pix_key: null,
  pix_key_type: null,
  pix_name: null,
  pix_city: null,
  charge_message: null,
};

export async function buscarConfiguracaoDeCobranca() {
  const linhas = tabela("trainer_settings");
  if (!linhas.length) {
    linhas.push({ ...COBRANCA_PADRAO });
    salvar();
  }
  return clone(linhas[0]);
}

export async function salvarConfiguracaoDeCobranca(patch) {
  await buscarConfiguracaoDeCobranca();
  Object.assign(tabela("trainer_settings")[0], patch);
  salvar();
  return clone(tabela("trainer_settings")[0]);
}

export async function darBaixa(pagamentoId, { data = hoje(), metodo = null } = {}) {
  const p = tabela("payments").find((x) => x.id === pagamentoId);
  if (!p) return null;
  p.paid_date = data;
  p.payment_method = metodo;
  salvar();
  return clone(p);
}

export async function reabrirPagamento(pagamentoId) {
  const p = tabela("payments").find((x) => x.id === pagamentoId);
  if (!p) return null;
  p.paid_date = null;
  p.payment_method = null;
  salvar();
  return clone(p);
}

export async function criarPagamento(dados) {
  const novo = {
    id: uid(),
    student_id: dados.alunoId,
    reference_month: dados.mes,
    amount: dados.valor,
    due_date: dados.vencimento,
    paid_date: null,
    payment_method: null,
    notes: dados.notas ?? null,
    created_at: hoje(),
  };
  tabela("payments").push(novo);
  salvar();
  return clone(novo);
}

// Gera a cobrança de todos os alunos ativos de uma vez. Rodar duas vezes não
// duplica nada — é o equivalente à restrição de unicidade do banco.
export async function gerarCobrancasDoMes(mes = mesDeReferencia()) {
  const existentes = new Set(
    tabela("payments")
      .filter((p) => p.reference_month === mes)
      .map((p) => p.student_id)
  );
  const criados = [];
  for (const aluno of tabela("students").filter((a) => a.active)) {
    if (existentes.has(aluno.id) || !aluno.monthly_fee) continue;
    criados.push(
      await criarPagamento({
        alunoId: aluno.id,
        mes,
        valor: aluno.monthly_fee,
        vencimento: `${mes.slice(0, 7)}-${String(aluno.due_day ?? 5).padStart(2, "0")}`,
      })
    );
  }
  return criados;
}
