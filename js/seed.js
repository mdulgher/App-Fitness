// Leo Personal Trainning — dados de teste
//
// Precisam ser realistas o suficiente para as telas serem julgáveis:
// três alunos em situações diferentes (em dia, inadimplente e sumido),
// uma ficha A/B/C completa e — o mais importante — histórico de cargas.
// Sem carga antiga não há como avaliar o gráfico de progressão nem o
// "última vez: 20 kg x 10", que é o detalhe que decide o recurso.
//
// As datas são geradas em relação a HOJE, então o cenário continua fazendo
// sentido daqui a um mês (o aluno sumido segue sumido há 10 dias).

import { hoje, somarDias, mesDeReferencia } from "./utils.js";

// ATENÇÃO: os links de vídeo abaixo são placeholders. O único que aponta para
// um vídeo real existente é o da esteira, e ele está aqui apenas para provar
// que o player embutido funciona — troque todos pelos vídeos do Leo na Fase 2.
const VIDEO_PLACEHOLDER = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export function criarDadosIniciais() {
  const H = hoje();
  const mesAtual = mesDeReferencia(H);
  const mesPassado = mesDeReferencia(somarDias(H, -32));

  /* ---------------- pessoas ---------------- */

  const profiles = [
    {
      id: "u-leo",
      role: "trainer",
      full_name: "Leo Martins",
      email: "leo@leopersonal.com",
      phone: "(11) 99999-0001",
      avatar_url: null,
      created_at: somarDias(H, -400),
    },
    {
      id: "u-carla",
      role: "student",
      full_name: "Carla Mendes",
      email: "carla@email.com",
      phone: "(11) 98888-1111",
      avatar_url: null,
      created_at: somarDias(H, -120),
    },
    {
      id: "u-joao",
      role: "student",
      full_name: "João Batista",
      email: "joao@email.com",
      phone: "(11) 97777-2222",
      avatar_url: null,
      created_at: somarDias(H, -200),
    },
    {
      id: "u-rafaela",
      role: "student",
      full_name: "Rafaela Souza",
      email: "rafaela@email.com",
      phone: "(11) 96666-3333",
      avatar_url: null,
      created_at: somarDias(H, -14),
    },
  ];

  const students = [
    {
      id: "u-carla",
      birth_date: "1992-04-18",
      goal: "Hipertrofia",
      height_cm: 165,
      start_weight_kg: 62.5,
      health_restrictions: null,
      weekly_target: 4,
      monthly_fee: 320,
      due_day: 5,
      active: true,
      created_at: somarDias(H, -120),
    },
    {
      id: "u-joao",
      birth_date: "1985-11-02",
      goal: "Emagrecimento",
      height_cm: 178,
      start_weight_kg: 94,
      // O caso que justifica o campo existir: o professor precisa ver isso
      // antes de prescrever agachamento livre.
      health_restrictions:
        "Hérnia de disco L5-S1. Sem agachamento livre e sem impacto. Priorizar leg press com amplitude curta.",
      weekly_target: 3,
      monthly_fee: 280,
      due_day: 10,
      active: true,
      created_at: somarDias(H, -200),
    },
    {
      id: "u-rafaela",
      birth_date: "1999-07-25",
      goal: "Condicionamento",
      height_cm: 170,
      start_weight_kg: 68,
      health_restrictions: "Condromalácia no joelho direito (leve).",
      weekly_target: 3,
      monthly_fee: 280,
      due_day: 15,
      active: true,
      created_at: somarDias(H, -14),
    },
  ];

  /* ---------------- biblioteca de exercícios ---------------- */

  const ex = (id, name, muscle_group, equipment, how_to, video_url = null) => ({
    id,
    name,
    muscle_group,
    equipment,
    video_url,
    photo_url: null, // a capa é derivada do vídeo (ver utils.capaDoVideo)
    how_to,
    archived: false,
    created_at: somarDias(H, -300),
  });

  const exercises = [
    ex("ex-supino", "Supino reto com barra", "Peito", "Barra",
      "Deite no banco com os pés firmes no chão. Pegada um pouco mais larga que a linha dos ombros. Desça a barra até a linha do mamilo controlando o movimento, sem quicar no peito. Suba empurrando sem travar o cotovelo no final.",
      VIDEO_PLACEHOLDER),
    ex("ex-crucifixo", "Crucifixo com halteres", "Peito", "Halter",
      "Deitado no banco, braços abertos com leve flexão no cotovelo. Abra até sentir o alongamento no peito, sem descer além da linha do ombro. Feche como se abraçasse alguém.",
      VIDEO_PLACEHOLDER),
    ex("ex-triceps-testa", "Tríceps testa", "Braço", "Barra",
      "Deitado, braços a 90°. Desça a barra até próximo da testa mantendo o cotovelo apontado para cima e parado. Estenda sem abrir o cotovelo.",
      VIDEO_PLACEHOLDER),
    ex("ex-triceps-corda", "Tríceps na corda", "Braço", "Máquina",
      "Cotovelo colado ao corpo e fixo. Estenda abrindo a corda no final do movimento. Volte controlando, sem deixar o peso puxar.",
      null),
    ex("ex-puxada", "Puxada frontal", "Costas", "Máquina",
      "Pegada aberta, peito estufado. Puxe a barra até a altura do queixo levando os cotovelos para baixo e para trás. Não jogue o corpo para trás.",
      VIDEO_PLACEHOLDER),
    ex("ex-remada", "Remada baixa", "Costas", "Máquina",
      "Costas retas, leve inclinação. Puxe em direção ao abdômen aproximando as escápulas no final. Volte sem arredondar a lombar.",
      null),
    ex("ex-rosca-direta", "Rosca direta", "Braço", "Barra",
      "Em pé, cotovelo colado ao tronco. Suba sem balançar o corpo e desça controlando até a extensão quase completa.",
      null),
    ex("ex-rosca-alt", "Rosca alternada", "Braço", "Halter",
      "Um braço por vez, girando o punho para fora durante a subida. Mantenha o outro braço parado.",
      null),
    ex("ex-agachamento", "Agachamento livre", "Perna", "Livre",
      "Barra apoiada no trapézio, pés na largura dos ombros. Desça empurrando o quadril para trás até a coxa ficar paralela ao chão. Joelho alinhado com o pé.",
      VIDEO_PLACEHOLDER),
    ex("ex-leg-press", "Leg press 45°", "Perna", "Máquina",
      "Pés na plataforma na largura do quadril. Desça até 90° no joelho sem descolar o quadril do apoio. Empurre sem travar o joelho.",
      null),
    ex("ex-extensora", "Cadeira extensora", "Perna", "Máquina",
      "Costas apoiadas, joelho alinhado ao eixo da máquina. Estenda até quase travar e segure um instante no topo.",
      null),
    ex("ex-panturrilha", "Panturrilha em pé", "Perna", "Máquina",
      "Suba o máximo na ponta do pé e desça até sentir o alongamento. Movimento lento, sem pular.",
      null),
    ex("ex-prancha", "Prancha abdominal", "Core", "Peso do corpo",
      "Antebraços no chão, corpo em linha reta do calcanhar à cabeça. Contraia o abdômen e o glúteo. Não deixe o quadril cair nem subir.",
      null),
    ex("ex-esteira", "Esteira — caminhada inclinada", "Cardio", "Máquina",
      "Inclinação entre 6% e 10%, velocidade em que ainda consiga conversar com dificuldade. Sem se segurar no apoio.",
      null),
  ];

  /* ---------------- ficha da Carla (A/B/C completa) ---------------- */

  const workout_plans = [
    {
      id: "fp-carla",
      student_id: "u-carla",
      is_template: false,
      title: "Hipertrofia — Superior/Inferior",
      description: "Foco em membros superiores. Progressão de carga semanal.",
      start_date: somarDias(H, -42),
      end_date: somarDias(H, 42),
      active: true,
      created_at: somarDias(H, -42),
      updated_at: somarDias(H, -42),
    },
    {
      // Ficha anterior arquivada: prova que o histórico sobrevive à troca.
      id: "fp-carla-antiga",
      student_id: "u-carla",
      is_template: false,
      title: "Adaptação — Corpo inteiro",
      description: "Primeiras 8 semanas.",
      start_date: somarDias(H, -120),
      end_date: somarDias(H, -43),
      active: false,
      created_at: somarDias(H, -120),
      updated_at: somarDias(H, -43),
    },
    {
      id: "fp-joao",
      student_id: "u-joao",
      is_template: false,
      title: "Emagrecimento — Circuito + cardio",
      description: "Sem impacto. Respeitar restrição lombar.",
      start_date: somarDias(H, -30),
      end_date: null,
      active: true,
      created_at: somarDias(H, -30),
      updated_at: somarDias(H, -30),
    },
    {
      id: "fp-template-hiper",
      student_id: null,
      is_template: true,
      title: "TEMPLATE — Hipertrofia iniciante A/B",
      description: "Base para alunos novos de hipertrofia.",
      start_date: null,
      end_date: null,
      active: false,
      created_at: somarDias(H, -60),
      updated_at: somarDias(H, -60),
    },
  ];

  const workout_days = [
    { id: "wd-carla-a", workout_plan_id: "fp-carla", label: "Treino A — Peito e Tríceps", order_index: 1, weekday_suggestion: "seg/qui" },
    { id: "wd-carla-b", workout_plan_id: "fp-carla", label: "Treino B — Costas e Bíceps", order_index: 2, weekday_suggestion: "ter/sex" },
    { id: "wd-carla-c", workout_plan_id: "fp-carla", label: "Treino C — Pernas e Core", order_index: 3, weekday_suggestion: "qua" },
    { id: "wd-joao-a", workout_plan_id: "fp-joao", label: "Treino A — Corpo inteiro", order_index: 1, weekday_suggestion: "seg/qua/sex" },
  ];

  const wde = (id, workout_day_id, exercise_id, order_index, sets, reps, rest_seconds, load_notes, opts = {}) => ({
    id,
    workout_day_id,
    exercise_id,
    order_index,
    group_label: opts.group ?? null,
    sets,
    reps,
    rest_seconds,
    load_notes,
    trainer_notes: opts.notes ?? null,
  });

  const workout_day_exercises = [
    // Treino A — com um bi-set (A1/A2) para exercitar o agrupamento
    wde("wx-a1", "wd-carla-a", "ex-supino", 1, 4, "8-10", 90, "22 kg"),
    wde("wx-a2", "wd-carla-a", "ex-crucifixo", 2, 3, "12", 60, "8 kg cada", { group: "A1" }),
    wde("wx-a3", "wd-carla-a", "ex-triceps-testa", 3, 3, "12", 60, "15 kg", { group: "A2", notes: "Emendar com o crucifixo, sem descanso entre os dois." }),
    wde("wx-a4", "wd-carla-a", "ex-triceps-corda", 4, 3, "15", 45, "Placa 6"),

    // Treino B
    wde("wx-b1", "wd-carla-b", "ex-puxada", 1, 4, "10", 90, "30 kg"),
    wde("wx-b2", "wd-carla-b", "ex-remada", 2, 3, "12", 75, "27 kg"),
    wde("wx-b3", "wd-carla-b", "ex-rosca-direta", 3, 3, "10-12", 60, "12 kg"),
    wde("wx-b4", "wd-carla-b", "ex-rosca-alt", 4, 3, "12 cada", 45, "7 kg"),

    // Treino C — inclui peso corporal e exercício por tempo
    wde("wx-c1", "wd-carla-c", "ex-agachamento", 1, 4, "10", 120, "35 kg"),
    wde("wx-c2", "wd-carla-c", "ex-leg-press", 2, 3, "12", 90, "80 kg"),
    wde("wx-c3", "wd-carla-c", "ex-extensora", 3, 3, "15", 60, "Placa 5"),
    wde("wx-c4", "wd-carla-c", "ex-panturrilha", 4, 4, "20", 45, "40 kg"),
    wde("wx-c5", "wd-carla-c", "ex-prancha", 5, 3, "40s", 45, "Peso do corpo"),

    // João — respeitando a restrição lombar
    wde("wx-j1", "wd-joao-a", "ex-leg-press", 1, 3, "15", 60, "60 kg", { notes: "Amplitude curta. Não passar de 90°." }),
    wde("wx-j2", "wd-joao-a", "ex-puxada", 2, 3, "12", 60, "25 kg"),
    wde("wx-j3", "wd-joao-a", "ex-supino", 3, 3, "12", 60, "20 kg"),
    wde("wx-j4", "wd-joao-a", "ex-esteira", 4, 1, "20min", 0, "Inclinação 8%"),

    // Template
    wde("wx-t1", null, "ex-supino", 1, 3, "10", 90, "A definir"),
  ].filter((x) => x.workout_day_id !== null);

  /* ---------------- histórico: frequência e cargas ---------------- */

  const attendance = [];
  const exercise_logs = [];

  // Carla: 6 semanas treinando, rotação A -> B -> C, com progressão de carga.
  // As cargas sobem ao longo do tempo para o gráfico de evolução ter forma.
  const rotacao = ["wd-carla-a", "wd-carla-b", "wd-carla-c"];
  const cargaBase = {
    "wx-a1": 18, "wx-a2": 6, "wx-a3": 12, "wx-a4": 5,
    "wx-b1": 25, "wx-b2": 22, "wx-b3": 10, "wx-b4": 6,
    "wx-c1": 28, "wx-c2": 65, "wx-c3": 4, "wx-c4": 32,
  };

  let sessao = 0;
  // Dia -40 até hoje, 4 treinos por semana (seg, ter, qua, qui).
  for (let d = 40; d >= 0; d--) {
    const data = somarDias(H, -d);
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay(); // 1=seg
    if (![1, 2, 3, 4].includes(diaSemana)) continue;
    // Uma falta proposital, para a aderência não ficar 100% e o cálculo ser visível.
    if (d === 16) continue;

    const dayId = rotacao[sessao % 3];
    const attId = `at-carla-${data}`;
    attendance.push({
      id: attId,
      student_id: "u-carla",
      workout_day_id: dayId,
      date: data,
      completed_at: `${data}T20:30:00Z`,
      marked_by: "student",
      created_at: `${data}T19:00:00Z`,
    });

    // Cargas da sessão: sobem ~1 kg (ou 2,5 nas pernas) a cada 3 semanas.
    const semanas = Math.floor((40 - d) / 7);
    for (const item of workout_day_exercises.filter((w) => w.workout_day_id === dayId)) {
      const base = cargaBase[item.id];
      const ehPeso = base != null;
      for (let s = 1; s <= item.sets; s++) {
        const incremento = ehPeso ? Math.floor(semanas / 2) * (base > 50 ? 5 : base > 20 ? 2.5 : 1) : 0;
        exercise_logs.push({
          id: `lg-${attId}-${item.id}-${s}`,
          student_id: "u-carla",
          attendance_id: attId,
          workout_day_exercise_id: item.id,
          exercise_id: item.exercise_id, // guardado de propósito: sobrevive à troca de ficha
          set_number: s,
          weight_kg: ehPeso ? base + incremento : null,
          reps_done: item.id === "wx-c5" ? null : Number(String(item.reps).match(/\d+/)?.[0] ?? 10),
          duration_seconds: item.id === "wx-c5" ? 40 : null,
          rpe: s === item.sets ? 8 : 7,
          notes: null,
          created_at: `${data}T20:00:00Z`,
        });
      }
    }
    sessao++;
  }

  // João: parou de treinar. Última sessão há 10 dias — aparece em "precisa de atenção".
  for (const d of [10, 13, 15, 18, 20]) {
    const data = somarDias(H, -d);
    const attId = `at-joao-${data}`;
    attendance.push({
      id: attId,
      student_id: "u-joao",
      workout_day_id: "wd-joao-a",
      date: data,
      completed_at: `${data}T07:30:00Z`,
      marked_by: "student",
      created_at: `${data}T06:40:00Z`,
    });
    for (const item of workout_day_exercises.filter((w) => w.workout_day_id === "wd-joao-a")) {
      for (let s = 1; s <= item.sets; s++) {
        const ehEsteira = item.id === "wx-j4";
        exercise_logs.push({
          id: `lg-${attId}-${item.id}-${s}`,
          student_id: "u-joao",
          attendance_id: attId,
          workout_day_exercise_id: item.id,
          exercise_id: item.exercise_id,
          set_number: s,
          weight_kg: ehEsteira ? null : item.id === "wx-j1" ? 60 : item.id === "wx-j2" ? 25 : 20,
          reps_done: ehEsteira ? null : 12,
          duration_seconds: ehEsteira ? 1200 : null,
          rpe: 7,
          notes: null,
          created_at: `${data}T07:20:00Z`,
        });
      }
    }
  }

  // Rafaela: aluna nova, sem ficha ainda — testa o estado "sem ficha".
  for (const d of [3, 6]) {
    const data = somarDias(H, -d);
    attendance.push({
      id: `at-rafaela-${data}`,
      student_id: "u-rafaela",
      workout_day_id: null,
      date: data,
      completed_at: `${data}T18:00:00Z`,
      marked_by: "trainer",
      created_at: `${data}T18:00:00Z`,
    });
  }

  /* ---------------- anotações ---------------- */

  const notes = [
    {
      id: "nt-1",
      student_id: "u-carla",
      content:
        "Carla, subi a carga do supino para 22 kg. Se fechar as 4 séries de 10 com folga, me avisa que subimos de novo na semana que vem.",
      pinned: true,
      created_at: somarDias(H, -5),
    },
    {
      id: "nt-2",
      student_id: "u-carla",
      content: "Lembra de tomar água durante o treino e não pular o aquecimento de 5 min na esteira.",
      pinned: false,
      created_at: somarDias(H, -20),
    },
    {
      id: "nt-3",
      student_id: "u-joao",
      content:
        "João, sumiu! Qualquer dificuldade de horário me fala que a gente remonta o treino. Enquanto isso, mantém a caminhada de 30 min.",
      pinned: true,
      created_at: somarDias(H, -4),
    },
    {
      id: "nt-4",
      student_id: "u-rafaela",
      content: "Bem-vinda! Sua ficha sai até sexta. Essa semana vamos só de adaptação e avaliação de movimento.",
      pinned: true,
      created_at: somarDias(H, -12),
    },
  ];

  /* ---------------- financeiro ---------------- */

  const pg = (id, student_id, reference_month, amount, due_date, paid_date, payment_method = null) => ({
    id, student_id, reference_month, amount, due_date, paid_date, payment_method,
    notes: null, created_at: reference_month,
  });

  const venc = (mesIso, dia) => `${mesIso.slice(0, 7)}-${String(dia).padStart(2, "0")}`;

  const payments = [
    // Carla — em dia
    pg("pay-c1", "u-carla", mesPassado, 320, venc(mesPassado, 5), somarDias(venc(mesPassado, 5), -1), "Pix"),
    pg("pay-c2", "u-carla", mesAtual, 320, venc(mesAtual, 5), venc(mesAtual, 4), "Pix"),
    // João — vencido (status é derivado, não armazenado)
    pg("pay-j1", "u-joao", mesPassado, 280, venc(mesPassado, 10), venc(mesPassado, 12), "Dinheiro"),
    pg("pay-j2", "u-joao", mesAtual, 280, somarDias(H, -6), null),
    // Rafaela — a vencer
    pg("pay-r1", "u-rafaela", mesAtual, 280, somarDias(H, 8), null),
  ];

  return {
    profiles,
    students,
    student_invites: [],
    exercises,
    workout_plans,
    workout_days,
    workout_day_exercises,
    attendance,
    exercise_logs,
    notes,
    payments,
  };
}
