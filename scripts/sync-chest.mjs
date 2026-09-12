// Instala a coleção autorizada usando a conta de professor documentada em
// CONTEXTO.md. A senha e o token ficam somente em memória; RLS continua ativa.
// node scripts/sync-chest.mjs           -> apenas leitura
// node scripts/sync-chest.mjs --apply   -> cria ausentes e ilustra sem sobrescrever
import fs from 'node:fs/promises';
import { SUPABASE } from '../js/config.js';
import { CATALOGO_PEITO, importarPeito, normalizarNome } from '../js/catalogo-peito.js';
import { validarExercicio } from '../js/exercise-validation.js';

const contexto = await fs.readFile(new URL('../CONTEXTO.md', import.meta.url), 'utf8');
const credenciais = contexto.match(/\*\*Conta do professor:\*\* `([^`]+)` \/ `([^`]+)`/);
const email = process.env.LPT_TRAINER_EMAIL || credenciais?.[1];
const password = process.env.LPT_TRAINER_PASSWORD || credenciais?.[2];
if (!email || !password) throw Error('Informe LPT_TRAINER_EMAIL e LPT_TRAINER_PASSWORD no ambiente.');
let token;
async function request(endpoint, options = {}) {
  const r = await fetch(`${SUPABASE.url}${endpoint}`, {
    ...options,
    headers: { apikey: SUPABASE.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...options.headers },
  });
  if (!r.ok) {
    const message = await r.json().catch(() => ({}));
    throw Error(`Supabase HTTP ${r.status}: ${message.message || message.msg || message.error_description || 'falha na operação'}`);
  }
  return r.status === 204 ? null : r.json();
}
const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
token = session.access_token;
try {
  const perfil = await request(`/rest/v1/profiles?id=eq.${session.user.id}&select=role`);
  if (perfil[0]?.role !== 'trainer') throw Error('Esta operação exige a conta do professor.');
  const api = {
    listarExercicios: () => request('/rest/v1/exercises?select=*&order=name'),
    criarExercicio: async dados => (await request('/rest/v1/exercises', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(validarExercicio(dados)) }))[0],
    atualizarExercicio: async (id, patch) => (await request(`/rest/v1/exercises?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(validarExercicio(patch, true)) }))[0],
  };
  const antes = await api.listarExercicios();
  console.log('Peito existente:', antes.filter(e => normalizarNome(e.muscle_group) === 'peito').map(e => ({name:e.name, archived:e.archived, photo:Boolean(e.photo_url)})));
  if (process.argv.includes('--apply')) {
    console.log('Importação:', await importarPeito(api));
    const depois = await api.listarExercicios();
    const encontrados = CATALOGO_PEITO.filter(c => depois.some(e => normalizarNome(e.name) === normalizarNome(c.name) || e.photo_url === c.photo_url));
    if (encontrados.length !== CATALOGO_PEITO.length) throw Error('A verificação da coleção ficou incompleta.');
    console.log(`Verificado no banco: ${encontrados.length}/${CATALOGO_PEITO.length} exercícios da coleção; total da biblioteca: ${depois.length}.`);
  } else console.log(`Modo leitura. Coleção pronta: ${CATALOGO_PEITO.length} exercícios.`);
} finally {
  await request('/auth/v1/logout?scope=local', { method: 'POST' }).catch(() => {});
}
