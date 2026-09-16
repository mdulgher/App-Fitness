// Leo Personal Trainning — utilitários

import { TIMEZONE } from "./config.js";

/* ---------- senha ---------- */

// Espelha a política ligada em 14/09/2026 no painel do Supabase (Authentication
// → Sign In/Providers → Email): mínimo 8, com minúscula, maiúscula e número.
// Symbol NÃO é exigido lá — o dropdown escolhido foi "Lowercase, uppercase
// letters and digits", sem "Symbols". Se o painel mudar, mudar aqui também: são
// duas superfícies (troca de senha do aluno/professor e criar-aluno) e não há
// como o servidor de Auth avisar o front quando a regra muda.
export const SENHA_MINIMA = 8;

export function senhaFraca(senha) {
  const texto = String(senha ?? "");
  if (texto.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (!/[a-z]/.test(texto)) return "A senha precisa ter ao menos uma letra minúscula.";
  if (!/[A-Z]/.test(texto)) return "A senha precisa ter ao menos uma letra maiúscula.";
  if (!/[0-9]/.test(texto)) return "A senha precisa ter ao menos um número.";
  return null;
}

/* ---------- datas ---------- */

// "Hoje" no fuso de São Paulo, como 'AAAA-MM-DD'.
// Usar new Date().toISOString() daria o dia errado: um treino às 21h de segunda
// cai na terça em UTC e a frequência do aluno sai deslocada.
export function hoje() {
  return emFuso(new Date());
}

export function emFuso(data) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const get = (t) => partes.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function diasEntre(isoA, isoB) {
  const ms = Date.parse(`${isoB}T00:00:00Z`) - Date.parse(`${isoA}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

// Segunda-feira da semana de uma data (semana começa na segunda).
export function inicioDaSemana(iso = hoje()) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  const diaSemana = (data.getUTCDay() + 6) % 7; // 0 = segunda
  return somarDias(iso, -diaSemana);
}

export function formatarData(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Soma meses preservando o fim do mês: 31/01 + 1 mês vira 28/02, não 03/03.
// Sem isso, uma ficha começada dia 31 terminaria num dia que não existe.
export function somarMeses(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/* ---------- campo de data em dd/mm/aaaa ----------
   `<input type="date">` mostra a data no formato do sistema operacional, não no
   da página: num Windows em inglês ele exibe 09/12/2026 para 12 de setembro, e
   o professor lê "9 de dezembro". Como não há como forçar o formato desse
   controle, aqui o campo é texto com máscara — sempre dd/mm/aaaa, em qualquer
   máquina. */

export function isoParaDataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function dataBRParaIso(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  // Confere o retorno: "31/02/2026" viraria 03/03 em vez de ser recusado.
  if (
    data.getUTCFullYear() !== Number(a) ||
    data.getUTCMonth() !== Number(mes) - 1 ||
    data.getUTCDate() !== Number(d)
  ) return null;
  return `${a}-${mes}-${d}`;
}

export function ligarMascaraDeData(input) {
  if (!input) return;
  input.addEventListener("input", () => {
    const dig = input.value.replace(/\D/g, "").slice(0, 8);
    const partes = [dig.slice(0, 2), dig.slice(2, 4), dig.slice(4, 8)].filter(Boolean);
    input.value = partes.join("/");
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

export function formatarDataCurta(iso) {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function nomeDoMes(iso) {
  const m = Number(iso.split("-")[1]);
  return MESES[m - 1];
}

export function mesDeReferencia(iso = hoje()) {
  return `${iso.slice(0, 7)}-01`;
}

export function textoTempoRelativo(iso) {
  if (!iso) return "nunca";
  const d = diasEntre(iso, hoje());
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  if (d < 14) return "há 1 semana";
  if (d < 60) return `há ${Math.floor(d / 7)} semanas`;
  return `há ${Math.floor(d / 30)} meses`;
}

// Hora de um instante gravado pelo banco (`completed_at`, `created_at`).
//
// O fuso é fixo em São Paulo pelo mesmo motivo de `hoje()`: sem ele a hora sai
// no fuso do aparelho, e o treino concluído às 19h40 aparece como 22h40 num
// celular que voltou de viagem com o relógio errado.
export function horaDe(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/* ---------- dias da semana ---------- */

// 1 = segunda … 7 = domingo, como no banco. A semana começa na segunda para
// casar com `inicioDaSemana()` e com a forma como se conta treino por semana.
export const DIAS_SEMANA = [
  [1, "Seg", "segunda"], [2, "Ter", "terça"], [3, "Qua", "quarta"],
  [4, "Qui", "quinta"], [5, "Sex", "sexta"], [6, "Sáb", "sábado"], [7, "Dom", "domingo"],
];

export function rotuloDiasSemana(dias) {
  if (!dias?.length) return "sem dia definido";
  return [...dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS_SEMANA.find(([n]) => n === Number(d))?.[1] ?? "?")
    .join(" · ");
}

/* ---------- dinheiro ---------- */

export function moeda(valor) {
  if (valor == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

// Campo de dinheiro no formato brasileiro.
//
// Um `<input type="number">` mostraria "280.5" e aceitaria ponto como decimal —
// ninguém digita mensalidade assim no Brasil. Aqui o campo é texto e a máscara
// trabalha em centavos: cada dígito empurra o valor para a esquerda, como na
// maquininha do cartão, e não existe estado inválido no meio da digitação.

export function moedaParaNumero(texto) {
  const digitos = String(texto ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return Number(digitos) / 100;
}

export function numeroParaMoeda(valor) {
  if (valor == null || valor === "") return "";
  return moeda(Number(valor));
}

export function ligarMascaraDeMoeda(input) {
  if (!input) return;
  const formatar = () => {
    const valor = moedaParaNumero(input.value);
    input.value = valor == null ? "" : moeda(valor);
  };
  input.addEventListener("input", () => {
    // O cursor vai sempre para o fim: como a máscara reescreve a string
    // inteira, tentar preservar a posição faria o cursor pular para o meio do
    // "R$" na primeira tecla.
    formatar();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  input.addEventListener("blur", formatar);
  formatar();
}

/* ---------- vídeo ---------- */

// Aceita os formatos que aparecem na prática: youtube.com/watch?v=,
// youtu.be/, /shorts/ (o mais usado por personal trainer), /embed/ e Vimeo.
export function idDoYoutube(url) {
  if (!url) return null;
  const padroes = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
  ];
  for (const p of padroes) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function idDoVimeo(url) {
  const m = url?.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

// URL para tocar embutido, sem jogar o aluno para fora do app no meio do treino.
export function urlDeEmbed(url) {
  const yt = idDoYoutube(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vm = idDoVimeo(url);
  if (vm) return `https://player.vimeo.com/video/${vm}`;
  return null;
}

// Capa derivada do próprio vídeo: o professor cola um link só e ganha a foto
// de graça, sem upload. Vale nas duas fases do projeto.
export function capaDoVideo(url) {
  const yt = idDoYoutube(url);
  return yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : null;
}

/* ---------- texto ---------- */

export function iniciais(nome) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export function primeiroNome(nome) {
  return nome?.trim().split(/\s+/)[0] ?? "";
}

export function plural(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/* ---------- DOM ---------- */

// Escapa texto antes de ir para innerHTML. Nome de aluno e anotação do
// professor são texto livre; sem isso, um '<' no meio de uma anotação quebra a
// tela — ou pior, injeta HTML.
export function esc(valor) {
  if (valor == null) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function uid() {
  return crypto.randomUUID();
}

/* ---------- pull to refresh (mobile / iOS Safari PWA) ---------- */

// Liga o gesto de puxar para baixo no topo da página.
// Só ativa em dispositivos touch; no desktop não faz nada.
// Compatível com Safari PWA (atalho na tela inicial do iPhone).
// aoRefrescar: função async chamada quando o usuário solta após o limiar.
export function ligarPullToRefresh(aoRefrescar) {
  if (!("ontouchstart" in window)) return () => {}; // desktop: sai sem fazer nada

  const LIMIAR = 65;   // px de arrasto para acionar
  const LIMITE = 90;   // px máximo de deslocamento visual
  let inicioY = 0;
  let deltaAtual = 0;
  let ativo = false;

  // Indicador visual fixo no topo
  const indicador = document.createElement("div");
  indicador.id = "ptr-indicador";
  indicador.innerHTML = `<span class="ptr-icone">↓</span>`;
  indicador.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:9999",
    "display:flex", "align-items:center", "justify-content:center",
    "height:0", "overflow:hidden", "background:#fff",
    "border-bottom:1px solid #e5e5e5",
    "font-size:20px", "color:#aaa", "pointer-events:none",
  ].join(";");
  document.body.appendChild(indicador);

  function scrollTopo() {
    return Math.max(
      document.documentElement.scrollTop,
      document.body.scrollTop,
      window.scrollY ?? 0
    );
  }

  function mostrar(px) {
    deltaAtual = px;
    const h = Math.min(px, LIMITE);
    indicador.style.height = h + "px";
    const giro = Math.min(px / LIMIAR, 1) * 180;
    indicador.querySelector(".ptr-icone").style.transform = `rotate(${giro}deg)`;
  }

  function esconder() {
    indicador.style.transition = "height .2s ease";
    indicador.style.height = "0";
    setTimeout(() => { indicador.style.transition = ""; }, 250);
  }

  const aoIniciar = (e) => {
    if (scrollTopo() > 2) return; // pequena tolerância para iOS
    inicioY = e.touches[0].clientY;
    deltaAtual = 0;
    ativo = true;
  };

  const aoMover = (e) => {
    if (!ativo) return;
    const delta = e.touches[0].clientY - inicioY;
    if (delta <= 0) { ativo = false; return; }
    mostrar(delta);
  };

  const aoTerminar = async () => {
    if (!ativo) return;
    ativo = false;
    const h = deltaAtual;
    esconder();
    if (h >= LIMIAR) {
      indicador.style.transition = "none";
      indicador.style.height = "44px";
      indicador.querySelector(".ptr-icone").textContent = "↻";
      try { await aoRefrescar(); } finally { esconder(); }
    }
  };

  document.addEventListener("touchstart", aoIniciar, { passive: true });
  document.addEventListener("touchmove", aoMover, { passive: true });
  document.addEventListener("touchend", aoTerminar);

  return () => {
    ativo = false;
    document.removeEventListener("touchstart", aoIniciar);
    document.removeEventListener("touchmove", aoMover);
    document.removeEventListener("touchend", aoTerminar);
    indicador.remove();
  };
}

// REL-07 — as duas regras de frequência, num lugar só.
//
// A meta mede DIAS TREINADOS, não sessões. Quem treina de manhã e ainda tem
// aula com o professor à tarde treinou num dia, não em dois: contando sessões,
// o cartão dizia 2 e a lista "semana a semana" dizia 1, para o mesmo aluno na
// mesma semana.
export function diasDistintos(sessoes) {
  return new Set(sessoes.map((s) => s.date)).size;
}

// Recusa de acesso nunca é falta de sinal.
//
// As duas heurísticas de rede do app — a do snapshot e a da fila — tratavam
// QUALQUER erro como falha de rede quando `navigator.onLine` dizia offline, e
// esse sinal é notoriamente frouxo: dá falso negativo em Wi-Fi de academia, em
// VPN e em captive portal. Então uma recusa real do banco caía nesse caminho.
//
// Os dois casos que de fato chegam aqui:
//
//   - **Sessão expirada ou revogada.** O PostgREST responde 401 e a mensagem
//     fala de JWT. A tela então respondia com o snapshot em vez de mandar o
//     usuário entrar de novo, e ele seguia navegando numa cópia velha que não
//     dava mais para atualizar.
//   - **Escrita que o RLS recusa.** Na fila isso virava tentativa eterna: o
//     app dizia "mando sozinho quando a rede voltar" e a série nunca subia.
//
// **O que NÃO passa por aqui** — verificado no banco real em 15/09/2026, e
// anotado porque é fácil concluir o contrário: bloquear o acesso do aluno
// (`access_blocked`) entra nas policies via `acesso_bloqueado()`, mas RLS em
// SELECT **filtra linha, não levanta erro**. O aluno bloqueado recebe zero
// linhas, `comSnapshot` nem chega no `catch`, e o snapshot não tem como
// mascarar nada. Esse caso se resolve no login, não aqui.
//
// A detecção é pela mensagem porque `ok()` em db-supabase.js joga fora o código
// do Postgres ao criar o Error. É uma lista frouxa de propósito: classificar
// um erro de rede como permissão só custa uma tela de erro a mais, enquanto o
// contrário deixa passar por falta de sinal o que era recusa.
const RECUSA_DE_ACESSO =
  /permission denied|row-level security|not authorized|unauthorized|forbidden|jwt|invalid.*token|token.*expired|acesso bloqueado|sessão expirou/i;

export function ehRecusaDeAcesso(err) {
  return RECUSA_DE_ACESSO.test(String(err?.message ?? err ?? ""));
}

// Nova ordem depois de mover um item uma posição para cima ou para baixo.
// Devolve pares {id, ordem}, ou vazio quando o movimento não cabe (já é o
// primeiro, já é o último, id fora da lista).
//
// Reatribui de 0 a n-1 em vez de só trocar os dois índices dos vizinhos. É de
// propósito: fichas antigas têm `order_index` repetido, porque divisões criadas
// em sequência rápida nasciam todas com o mesmo valor, e nesse estado "trocar
// com o vizinho" não tem vizinho definido. Normalizar conserta a ficha na
// primeira vez que o professor reordena, e depois só duas linhas mudam.
export function ordemAoMover(ids, id, direcao) {
  const de = ids.indexOf(id);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= ids.length) return [];

  const nova = [...ids];
  [nova[de], nova[para]] = [nova[para], nova[de]];
  return nova.map((cada, ordem) => ({ id: cada, ordem }));
}

// Monta uma sessão realizada a partir da presença e das cargas gravadas nela.
//
// Vive aqui porque as duas implementações de dados chamam esta função: agrupar
// por exercício e ordenar as séries é regra de domínio, e o histórico precisa
// ter uma forma só, não uma por banco.
//
// O nome do exercício sai de `carga.exercicio`, resolvido por
// `exercise_logs.exercise_id` — nunca da ficha atual. É exatamente para isso
// que aquela coluna é redundante de propósito (armadilha 5): o professor troca
// a ficha e o que o aluno levantou no mês passado continua legível.
//
// O agrupamento é pelo item da ficha (`workout_day_exercise_id`), não pelo
// exercício: o mesmo exercício pode estar duas vezes na mesma divisão e são
// duas entradas distintas do treino. Quando o professor apaga o item a coluna
// vira NULL (`on delete set null`) e o agrupamento cai no exercício, que é o
// que sobra — melhor juntar duas entradas antigas do que perder as duas.
export function montarSessaoRealizada(sessao, divisao, cargas) {
  // Série sem peso, sem repetição e sem tempo é linha que o aluno abriu e não
  // preencheu — `registrarSerie` grava nulos quando ele limpa o campo. No
  // histórico ela não é informação, é ruído: some daqui, e não da tabela.
  const ordenadas = cargas
    .filter((c) => c.weight_kg != null || c.reps_done != null || c.duration_seconds != null)
    .sort(
      (a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
        (a.set_number ?? 0) - (b.set_number ?? 0)
    );

  const grupos = new Map();
  for (const carga of ordenadas) {
    const chave = carga.workout_day_exercise_id ?? `exercicio:${carga.exercise_id}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        itemId: carga.workout_day_exercise_id ?? null,
        exercicioId: carga.exercise_id,
        nome: carga.exercicio?.name ?? "(exercício removido)",
        grupo: carga.exercicio?.muscle_group ?? null,
        series: [],
      });
    }
    grupos.get(chave).series.push(carga);
  }

  return {
    ...sessao,
    divisao,
    exercicios: [...grupos.values()],
    totalDeSeries: ordenadas.length,
  };
}

// AT-12, decisão do dono em 16/09/2026: **a meta é da ficha**, e só dela.
//
// Havia duas colunas. `students.weekly_target` é `not null default 3`, então
// todo aluno nasce com 3 sem ninguém ter combinado nada — e o formulário de
// cadastro nem oferece o campo. Enquanto essa coluna era o fallback, a
// pergunta "qual é a meta?" nunca podia ser respondida com "não tem": o 3
// fantasma aparecia na tela com a mesma cara de um número acertado com o
// aluno, e os ramos de "sem meta" escritos em 13/09 eram inalcançáveis.
//
// Meta é propriedade da prescrição, não da pessoa: ficha nova de 4 dias é uma
// meta nova. Pendurada na ficha, ela ainda herda de graça o histórico que
// `start_date`/`end_date`/`active` já dão — no cadastro, o número anterior era
// sobrescrito e sumia.
//
// A coluna do cadastro continua no banco por enquanto (derrubá-la é migration,
// em release próprio); ninguém mais a lê. As fichas que estavam com meta nula
// foram preenchidas a partir dela por `scripts/backfill-meta-da-ficha.mjs`.
//
// Devolve null quando não há meta — e null aqui é resposta, não falha: quem
// exibe precisa escrever "sem meta", nunca dividir por ele. Era daí que saía o
// "0/null na semana" na lista do professor.
export function metaEfetiva(ficha) {
  return ficha?.weekly_target ?? null;
}

// Foto de perfil: aceita HTTPS (o Storage do Supabase) e imagem embutida
// (`data:`), que é como o modo local guarda a foto sem servidor nenhum.
//
// Separada de `urlDeImagemSegura` de propósito: aquela valida link que o
// professor cola de qualquer lugar da internet e por isso é mais fechada. Aqui
// a origem é sempre o próprio app. Só formato raster — SVG carrega script, que
// não roda dentro de <img>, mas não há motivo para aceitar.
export function urlDeAvatarSeguro(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(texto)) return texto;
  try {
    const u = new URL(texto);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

// Reduz a foto no próprio aparelho antes de subir.
//
// Uma selfie de celular tem 3 a 5 MB; o avatar aparece com 44 px. Subir o
// original gastaria a franquia do aluno e o tempo dele numa academia com sinal
// ruim, para um resultado idêntico. Corta no quadrado central porque a moldura
// do avatar é quadrada: guardar a foto inteira e deixar o `object-fit` cortar
// significaria carregar pixels que nunca aparecem.
export async function reduzirImagem(arquivo, lado = 512, qualidade = 0.85) {
  const bitmap = await createImageBitmap(arquivo);
  try {
    const corte = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(lado, corte);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      bitmap,
      (bitmap.width - corte) / 2, (bitmap.height - corte) / 2, corte, corte,
      0, 0, canvas.width, canvas.height
    );
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    if (!blob) throw new Error("Não foi possível preparar a imagem.");
    return blob;
  } finally {
    bitmap.close();
  }
}

// Endereço absoluto de uma tela do app, para pôr dentro de mensagem que sai
// daqui (a cobrança no WhatsApp). Derivado do `location` em vez de fixado numa
// constante: o app roda em `localhost` no teste e embaixo de `/App-Fitness/` em
// produção, e um endereço fixo mandaria o aluno para o lugar errado num dos dois.
export function linkDoApp(hash = "") {
  return `${location.origin}${location.pathname}${hash}`;
}

/* ---------- pacote de aulas avulsas ---------- */

// Saldo = comprado − consumido, sempre calculado, nunca guardado.
//
// Um contador em coluna divergiria na primeira correção: o professor lança uma
// aula errada, apaga, e o contador fica um a menos para sempre sem ninguém
// saber qual dos dois números é o verdadeiro. Mesma razão do status de
// pagamento ser derivado (armadilha 2).
// Depois de quantos dias uma venda sem pagamento vira assunto. Não bloqueia
// nada: o professor decidiu que pode esperar alguns dias pelo dinheiro, e o
// aluno não fica sem treinar por isso. O número só existe para o pacote não
// ficar em aberto para sempre sem ninguém reparar.
export const DIAS_DE_ESPERA_DO_PACOTE = 7;

export function resumoDoSaldo(pacotes = [], aulasUsadas = [], referencia = hoje()) {
  const compradas = pacotes.reduce((total, p) => total + Number(p.classes_total ?? 0), 0);
  // Aula sem conclusão não foi dada, então não consome saldo. Hoje toda aula
  // presencial já nasce concluída; a checagem é para não passar a consumir
  // sozinha se algum dia isso mudar.
  const consumidas = aulasUsadas.filter((a) => a.completed_at !== null);
  const usadas = consumidas.length;

  // O crédito vale a partir da venda, pago ou não — decisão do negócio. O que o
  // sistema não pode é deixar de saber a diferença: antes, pacote vendido e
  // pacote quitado eram a mesma coisa e ninguém conseguia distinguir crédito
  // autorizado de cobrança esquecida.
  const emAberto = pacotes.filter((p) => !p.pago);
  const desde = emAberto.map((p) => p.purchased_on).filter(Boolean).sort()[0] ?? null;
  const diasEsperando = desde ? diasEntre(desde, referencia) : null;

  return {
    compradas,
    usadas,
    saldo: compradas - usadas,
    aulasNaoPagas: emAberto.reduce((t, p) => t + Number(p.classes_total ?? 0), 0),
    esperandoPagamentoDesde: desde,
    diasEsperandoPagamento: diasEsperando,
    pagamentoAtrasado: diasEsperando !== null && diasEsperando > DIAS_DE_ESPERA_DO_PACOTE,
    ultimaCompra: pacotes[0]?.purchased_on ?? null,
    ultimaAula: consumidas[0]?.date ?? null,
  };
}
