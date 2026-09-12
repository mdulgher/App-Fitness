// Leo Personal Trainning — utilitários

import { TIMEZONE } from "./config.js";

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
