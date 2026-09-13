import fs from 'node:fs/promises';
import { SUPABASE } from '../js/config.js';

const credentials = await fs.readFile(new URL('../CREDENCIAIS.local.md', import.meta.url), 'utf8');
const section = credentials.split('## Professor')[1]?.split('## Alunos')[0];
const match = section?.match(/\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
if (!match) throw new Error('Formato de credenciais não reconhecido.');
const login = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: match[1], password: match[2] }),
});
if (!login.ok) throw new Error(`Login: HTTP ${login.status}`);
const session = await login.json();
const headers = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${session.access_token}`, Prefer: 'count=exact' };
for (const [table, query] of [
  ['app_errors', 'select=created_at,origem,mensagem,contexto&order=created_at.desc&limit=100'],
  ['students', 'select=active,monthly_fee,due_day'],
  ['payments', 'select=reference_month,amount,paid_date'],
]) {
  const response = await fetch(`${SUPABASE.url}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) { console.log(JSON.stringify({ table, status: response.status })); continue; }
  const rows = await response.json();
  if (table === 'app_errors') {
    const groups = {};
    for (const r of rows) {
      const key = `${r.origem}: ${r.mensagem}`;
      groups[key] ??= { count: 0, latest: r.created_at, action: r.contexto?.acao ?? null };
      groups[key].count++;
    }
    console.log(JSON.stringify({ table, range: response.headers.get('content-range'), groups }));
  } else if (table === 'students') {
    console.log(JSON.stringify({ table, total: rows.length, active: rows.filter(r => r.active).length, withoutFee: rows.filter(r => r.active && r.monthly_fee == null).length, invalidDue: rows.filter(r => r.due_day < 1 || r.due_day > 28).length }));
  } else {
    const months = {};
    for (const r of rows) months[r.reference_month] = (months[r.reference_month] ?? 0) + 1;
    console.log(JSON.stringify({ table, total: rows.length, months }));
  }
}
