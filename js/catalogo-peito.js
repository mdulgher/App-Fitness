// Coleção inicial curada de peito. Fotos: free-exercise-db (Unlicense).
// A segunda foto e a atribuição são metadados locais, sem alterar o schema.
const itens = [
  ['Barbell_Bench_Press_-_Medium_Grip', 'Supino reto com barra', 'Barra', 'Supinos', 'Deite no banco com pés apoiados e escápulas estáveis. Segure a barra um pouco além da largura dos ombros.\nDesça de forma controlada em direção ao peito, mantendo punhos alinhados aos antebraços.\nEmpurre a barra de volta sem tirar o quadril do banco. Use suportes de segurança ou auxílio para retirar e recolocar a barra.'],
  ['Barbell_Incline_Bench_Press_-_Medium_Grip', 'Supino inclinado com barra', 'Barra', 'Supinos', 'Ajuste o banco inclinado e apoie costas e pés. Posicione a pegada simetricamente na barra.\nDesça em direção à parte superior do peito, mantendo os antebraços sob a barra.\nEmpurre de volta com controle, sem elevar os ombros ou tirar o quadril do banco.'],
  ['Decline_Barbell_Bench_Press', 'Supino declinado com barra', 'Barra', 'Supinos', 'Prenda as pernas no apoio do banco declinado e estabilize o tronco. Retire a barra com auxílio quando necessário.\nDesça a barra em direção à região inferior do peito, sem quicar.\nEmpurre até a posição inicial, mantendo o corpo apoiado e a trajetória controlada.'],
  ['Dumbbell_Bench_Press', 'Supino reto com halteres', 'Halter', 'Supinos', 'Deite no banco com um halter em cada mão, ao lado do peito. Apoie os pés e estabilize as escápulas.\nEmpurre os halteres para cima sem bater um no outro.\nDesça lentamente, mantendo punhos alinhados e uma amplitude confortável para os ombros.'],
  ['Incline_Dumbbell_Press', 'Supino inclinado com halteres', 'Halter', 'Supinos', 'Apoie-se no banco inclinado e posicione os halteres ao lado da parte superior do peito.\nEmpurre os dois halteres para cima, mantendo o tronco no encosto.\nRetorne com controle e evite abrir excessivamente os cotovelos.'],
  ['Decline_Dumbbell_Bench_Press', 'Supino declinado com halteres', 'Halter', 'Supinos', 'Estabilize as pernas no banco declinado e mantenha os halteres ao lado do peito.\nEmpurre os halteres para cima com os punhos alinhados aos antebraços.\nRetorne com controle. Peça auxílio para posicionar ou retirar os halteres quando necessário.'],
  ['Dumbbell_Bench_Press_with_Neutral_Grip', 'Supino reto com pegada neutra', 'Halter', 'Supinos', 'Deite no banco com os pés apoiados. Segure os halteres com as palmas voltadas uma para a outra.\nEmpurre para cima, mantendo os cotovelos próximos ao tronco.\nDesça lentamente até a amplitude orientada pelo professor.'],
  ['Hammer_Grip_Incline_DB_Bench_Press', 'Supino inclinado com pegada neutra', 'Halter', 'Supinos', 'Apoie o tronco no banco inclinado e segure os halteres com as palmas voltadas uma para a outra.\nEmpurre os halteres para cima, sem elevar os ombros.\nDesça mantendo a pegada neutra, os pés firmes e o movimento simétrico.'],
  ['One_Arm_Dumbbell_Bench_Press', 'Supino unilateral com halter', 'Halter', 'Supinos', 'Deite no banco com um halter ao lado do peito e os pés bem apoiados.\nEmpurre com um braço, mantendo tronco e quadril sem girar.\nDesça com controle e complete a prescrição antes de trocar o lado.'],
  ['Smith_Machine_Bench_Press', 'Supino reto no Smith', 'Máquina', 'Supinos', 'Posicione o banco para que a barra desça na linha do peito. Ajuste os limitadores de segurança.\nDestrave a barra e flexione os cotovelos, mantendo as costas apoiadas.\nEmpurre de volta sem perder o alinhamento dos punhos. Trave a barra ao terminar.'],
  ['Smith_Machine_Incline_Bench_Press', 'Supino inclinado no Smith', 'Máquina', 'Supinos', 'Ajuste o banco inclinado sob a barra e regule os limitadores. Apoie os pés.\nDestrave e desça em direção à parte superior do peito.\nEmpurre com controle, mantenha o tronco apoiado e trave a barra ao encerrar.'],
  ['Smith_Machine_Decline_Press', 'Supino declinado no Smith', 'Máquina', 'Supinos', 'Posicione o banco declinado sob a barra e fixe as pernas. Regule os limitadores.\nDestrave e desça em direção à região inferior do peito.\nEmpurre de volta sem quicar ou tirar o corpo do apoio. Trave ao terminar.'],
  ['Machine_Bench_Press', 'Supino na máquina', 'Máquina', 'Supinos', 'Ajuste o banco para que as alças fiquem na altura do peito. Apoie as costas e os pés.\nEmpurre as alças para a frente mantendo os punhos alinhados.\nRetorne lentamente sem deixar os pesos baterem.'],
  ['Leverage_Incline_Chest_Press', 'Supino inclinado na máquina articulada', 'Máquina', 'Supinos', 'Regule o assento da máquina inclinada e mantenha as costas no encosto.\nEmpurre as alças para a frente e para cima conforme o percurso da máquina.\nVolte com controle, sem elevar os ombros ou arquear o tronco para mover a carga.'],
  ['Leverage_Decline_Chest_Press', 'Supino declinado na máquina articulada', 'Máquina', 'Supinos', 'Ajuste o assento e apoie firmemente costas e pés. Segure as alças na linha indicada pela máquina.\nEmpurre seguindo o percurso das alavancas.\nRetorne devagar e evite tirar o tronco do encosto.'],
  ['Dumbbell_Flyes', 'Crucifixo com halteres', 'Halter', 'Crucifixos', 'Deite no banco com os halteres acima do peito e as palmas voltadas uma para a outra.\nAbra os braços em arco, mantendo uma leve flexão dos cotovelos e amplitude confortável.\nFeche pelo mesmo arco sem bater os halteres nem transformar o movimento em um supino.'],
  ['Incline_Dumbbell_Flyes', 'Crucifixo inclinado com halteres', 'Halter', 'Crucifixos', 'Apoie-se no banco inclinado e mantenha os halteres acima do peito.\nAbra os braços com os cotovelos levemente flexionados, sem forçar o alongamento dos ombros.\nAproxime os halteres pelo mesmo arco, com tronco e escápulas estáveis.'],
  ['Decline_Dumbbell_Flyes', 'Crucifixo declinado com halteres', 'Halter', 'Crucifixos', 'Fixe as pernas no banco declinado e segure os halteres acima do peito.\nAbra os braços em arco, mantendo a flexão dos cotovelos.\nFeche com controle e interrompa a descida antes de perder estabilidade dos ombros.'],
  ['One-Arm_Flat_Bench_Dumbbell_Flye', 'Crucifixo unilateral com halter', 'Halter', 'Crucifixos', 'Deite no banco segurando um halter acima do peito, com o cotovelo levemente flexionado.\nAbra o braço em arco, mantendo abdômen ativo e tronco sem girar.\nVolte pelo mesmo percurso e repita do outro lado conforme a prescrição.'],
  ['Butterfly', 'Peck deck — crucifixo na máquina', 'Máquina', 'Crucifixos', 'Regule o assento e os apoios para manter os braços na altura do peito. Apoie as costas.\nAproxime os braços pela frente sem projetar os ombros.\nAbra lentamente, respeitando a amplitude ajustada na máquina.'],
  ['Flat_Bench_Cable_Flyes', 'Crucifixo reto na polia', 'Polia', 'Crucifixos', 'Posicione um banco entre duas polias baixas e deite segurando as alças.\nAproxime as mãos acima do peito em um arco, com cotovelos levemente flexionados.\nAbra de forma controlada sem perder o apoio no banco.'],
  ['Incline_Cable_Flye', 'Crucifixo inclinado na polia', 'Polia', 'Crucifixos', 'Coloque o banco inclinado entre duas polias baixas e segure uma alça em cada mão.\nFeche os braços em arco acima da parte superior do peito.\nRetorne com os cotovelos levemente flexionados e sem forçar a abertura.'],
  ['Cable_Crossover', 'Crossover na polia alta', 'Polia', 'Crucifixos', 'Ajuste as polias acima dos ombros e dê um passo à frente com base estável.\nTraga as mãos em arco para a frente e para baixo, mantendo leve flexão dos cotovelos.\nRetorne sem balançar o tronco ou deixar os cabos puxarem os ombros.'],
  ['Low_Cable_Crossover', 'Crossover na polia baixa', 'Polia', 'Crucifixos', 'Segure as alças das polias baixas, dê um passo à frente e estabilize o tronco.\nEleve e aproxime as mãos pela frente em um arco, sem encolher os ombros.\nDesça com controle até a posição inicial.'],
  ['Single-Arm_Cable_Crossover', 'Crossover unilateral na polia', 'Polia', 'Crucifixos', 'Segure as alças das polias altas e coloque um pé à frente. Mantenha uma mão à frente do corpo enquanto o outro braço abre.\nTraga o braço aberto em arco para a frente do tronco, mantendo leve flexão do cotovelo.\nRetorne sem girar o corpo e alterne os lados conforme a prescrição.'],
  ['Cable_Chest_Press', 'Supino sentado na polia', 'Polia', 'Supinos', 'Sente no banco da estação de cabos, apoie as costas e segure as alças ao lado do peito.\nEmpurre as alças para a frente mantendo as escápulas estáveis.\nRetorne devagar sem deixar os cabos puxarem os braços além da amplitude orientada.'],
  ['Standing_Cable_Chest_Press', 'Supino em pé na polia', 'Polia', 'Supinos', 'Ajuste as alças na altura do peito e fique de costas para as polias, com um pé à frente.\nEmpurre as mãos para a frente, mantendo abdômen firme e tronco estável.\nRetorne com controle sem girar ou inclinar o corpo para vencer a carga.'],
  ['Incline_Cable_Chest_Press', 'Supino inclinado na polia', 'Polia', 'Supinos', 'Posicione o banco inclinado entre as polias baixas e segure as alças junto ao peito.\nEmpurre para cima seguindo a linha do tronco inclinado.\nRetorne lentamente, mantendo as costas no encosto e os pés apoiados.'],
  ['Pushups', 'Flexão de braços', 'Peso do corpo', 'Flexões', 'Apoie as mãos um pouco além da largura dos ombros e mantenha o corpo alinhado dos calcanhares à cabeça.\nFlexione os cotovelos para aproximar o peito do chão, sem deixar o quadril cair.\nEmpurre o chão e volte à posição inicial mantendo o alinhamento.'],
  ['Incline_Push-Up', 'Flexão com mãos elevadas', 'Peso do corpo', 'Flexões', 'Apoie as mãos em um banco ou superfície firme e mantenha os pés no chão.\nDesça o peito em direção ao apoio mantendo o corpo em linha reta.\nEmpurre para voltar. A altura do apoio deve ser ajustada pelo professor.'],
  ['Decline_Push-Up', 'Flexão com pés elevados', 'Peso do corpo', 'Flexões', 'Coloque os pés em um apoio estável e as mãos no chão. Contraia o abdômen para alinhar o corpo.\nDesça o peito em direção ao chão sem projetar a cabeça ou arquear a lombar.\nEmpurre para retornar mantendo os pés firmes no apoio.'],
  ['Push-Up_Wide', 'Flexão com mãos afastadas', 'Peso do corpo', 'Flexões', 'Posicione as mãos mais afastadas que na flexão habitual, sem forçar os ombros. Mantenha o corpo alinhado.\nFlexione os cotovelos e aproxime o peito do chão com controle.\nEmpurre de volta sem deixar o quadril cair.'],
  ['Suspended_Push-Up', 'Flexão na fita de suspensão', 'Suspensão', 'Flexões', 'Ajuste as fitas e segure as alças, apoiando os pés no chão. Mantenha o corpo rígido.\nFlexione os cotovelos e desça o peito entre as alças sem deixar as fitas se afastarem demais.\nEmpurre de volta com controle e sem perder o alinhamento do tronco.'],
  ['Dips_-_Chest_Version', 'Paralelas com foco no peito', 'Paralelas', 'Paralelas', 'Apoie as mãos nas barras paralelas e sustente o corpo com os braços estendidos.\nIncline levemente o tronco e desça flexionando os cotovelos até a amplitude orientada pelo professor.\nEmpurre as barras para elevar o corpo, sem embalo ou descida forçada dos ombros.'],
  ['Straight-Arm_Dumbbell_Pullover', 'Pullover com halter', 'Halter', 'Pullovers', 'Apoie a parte superior das costas no banco, firme os pés e segure um halter acima do peito com as duas mãos.\nLeve o halter para trás da cabeça com cotovelos levemente flexionados, sem compensar na lombar.\nRetorne até acima do peito com controle e amplitude confortável.'],
  ['Svend_Press', 'Svend press com anilhas', 'Anilha', 'Supinos', 'Em pé, pressione uma ou duas anilhas leves entre as palmas à frente do peito.\nEstenda os braços à frente mantendo a pressão entre as mãos e os ombros baixos.\nRetorne ao peito sem soltar a pressão ou inclinar o tronco.'],
];

export const CATALOGO_PEITO = itens.map(([sourceId, name, equipment, categoria, how_to]) => ({
  sourceId, name, equipment, categoria, how_to, muscle_group: 'Peito',
  photo_url: `assets/exercises/${sourceId}/0.jpg`,
  segundaFoto: `assets/exercises/${sourceId}/1.jpg`,
  fonte: `https://github.com/yuhonas/free-exercise-db/tree/main/exercises/${sourceId}`,
}));

export function referenciaDaFoto(photo) {
  return CATALOGO_PEITO.find(e => e.photo_url === photo) ?? null;
}

export function normalizarNome(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Migração apenas dos dados fictícios. Não faz leituras ou escritas no banco.
export function atualizarColecaoDemo(dados) {
  if (dados.catalogoPeitoVersao === 1) return false;
  for (const item of CATALOGO_PEITO) {
    const atual = dados.exercises.find(e => normalizarNome(e.name) === normalizarNome(item.name) || e.photo_url === item.photo_url);
    if (atual) {
      if (!atual.archived && !atual.photo_url) atual.photo_url = item.photo_url;
      if (atual.video_url?.includes('dQw4w9WgXcQ')) atual.video_url = null;
    } else {
      dados.exercises.push({ id: `demo-peito-${item.sourceId}`, name: item.name, muscle_group: item.muscle_group, equipment: item.equipment, how_to: item.how_to, photo_url: item.photo_url, video_url: null, archived: false });
    }
  }
  dados.catalogoPeitoVersao = 1;
  return true;
}

// Reutiliza o mesmo registro quando já existe: preserva fichas, vídeos e notas.
export async function importarPeito(api) {
  const existentes = await api.listarExercicios({ incluirArquivados: true });
  const resultado = { criados: 0, ilustrados: 0, mantidos: 0 };
  for (const item of CATALOGO_PEITO) {
    const atual = existentes.find(e => normalizarNome(e.name) === normalizarNome(item.name) || e.photo_url === item.photo_url);
    if (atual) {
      if (!atual.photo_url && !atual.archived) {
        await api.atualizarExercicio(atual.id, { photo_url: item.photo_url });
        resultado.ilustrados++;
      } else resultado.mantidos++;
      continue;
    }
    const novo = await api.criarExercicio({ name: item.name, muscle_group: item.muscle_group, equipment: item.equipment, how_to: item.how_to, photo_url: item.photo_url, video_url: null, archived: false });
    existentes.push(novo);
    resultado.criados++;
  }
  return resultado;
}
