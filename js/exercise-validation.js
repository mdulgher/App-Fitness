// Validação compartilhada pelas implementações local e Supabase.
export function urlDeImagemSegura(valor) {
  if (!valor) return null;
  const text = String(valor).trim();
  if (/^assets\/exercises\/[A-Za-z0-9_-]+\/[01]\.jpg$/.test(text)) return text;
  try { const u = new URL(text); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}

export function videoSeguro(valor) {
  if (!valor) return null;
  try {
    const u = new URL(String(valor).trim());
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    let id;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') id = u.pathname.slice(1);
    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1];
    }
    if (/^[\w-]{11}$/.test(id ?? '')) return `https://www.youtube.com/watch?v=${id}`;
    if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
      id = u.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];
      if (id) return `https://vimeo.com/${id}`;
    }
  } catch {}
  return null;
}

export function validarExercicio(dados, parcial = false) {
  const resultado = {};
  for (const [campo, limite] of [['name',120],['muscle_group',60],['equipment',80],['how_to',6000]]) {
    if (parcial && !(campo in dados)) continue;
    const valor = String(dados[campo] ?? '').trim();
    if (!parcial && ['name','muscle_group'].includes(campo) && !valor) throw Error('Informe o nome e o grupo muscular.');
    if (parcial && ['name','muscle_group'].includes(campo) && !valor) throw Error('Nome e grupo muscular não podem ficar vazios.');
    if (valor.length > limite) throw Error(`O campo ${campo} aceita até ${limite} caracteres.`);
    resultado[campo] = valor || null;
  }
  for (const [campo, validar] of [['photo_url',urlDeImagemSegura],['video_url',videoSeguro]]) {
    if (parcial && !(campo in dados)) continue;
    const valor = String(dados[campo] ?? '').trim();
    const normalizada = validar(valor);
    if (valor && !normalizada) throw Error(campo === 'photo_url' ? 'Use uma URL HTTPS válida para a imagem.' : 'Use um link válido do YouTube ou Vimeo.');
    resultado[campo] = normalizada;
  }
  if ('archived' in dados) resultado.archived = dados.archived === true;
  return resultado;
}
