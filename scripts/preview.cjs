// Prévia local isolada. --demo serve os dados fictícios sem editar config.js.
// Use --lan somente quando precisar abrir o app em outro aparelho da rede local.
// Uso: node scripts/preview.cjs --demo (http://127.0.0.1:5180)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const demo = process.argv.includes('--demo');
const filaComErro = demo && process.argv.includes('--fila-com-erro');
const lan = process.argv.includes('--lan');
const port = demo ? 5180 : 5173;
const host = lan ? '0.0.0.0' : '127.0.0.1';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/') pathname = '/index.html';
  // Não servir documentação, arquivos ocultos ou arquivos fora do app.
  // `assets/` inteiro entra: servir menos do que a produção serve faz a prévia
  // mentir — a logo faltava em todo teste local e virava um 404 no console.
  if (!/^\/(index\.html|manifest\.json|service-worker\.js|Logo e banner\.jpg|(?:css|js)\/[a-zA-Z0-9/_.-]+|assets\/[a-zA-Z0-9/_-]+\.(?:jpg|png|svg))$/.test(pathname) || pathname.includes('..')) {
    res.writeHead(404); return res.end();
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (demo && pathname === '/js/config.js') data = data.toString().replace('export const DATA_SOURCE = "supabase";', 'export const DATA_SOURCE = "local";');
    // Cenário visual reproduzível do AT-08. Só existe na prévia local e só é
    // ativado pela flag explícita; produção e o modo demo normal não mudam.
    if (filaComErro && pathname === '/js/app.js') {
      const injecao = `
localStorage.setItem("lpt:fila-offline", JSON.stringify({
  "u-carla|wd-removido|2026-09-16": {
    alunoId: "u-carla", diaId: "wd-removido", data: "2026-09-16",
    series: { "item-removido:1": {
      itemId: "item-removido", exercicioId: "ex-agachamento", serie: 1,
      peso: 42, reps: 10, versao: "cenario-at-08"
    } },
    concluir: false,
    erro: "new row violates row-level security policy",
    precisaAtencao: true
  }
}));
`;
      data = data.toString().replace('const NAV_PROFESSOR = [', `${injecao}\nconst NAV_PROFESSOR = [`);
    }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  });
}).listen(port, host, () => {
  const address = lan ? `porta ${port} da rede local` : `http://127.0.0.1:${port}`;
  console.log(`Prévia ${demo ? 'com dados fictícios' : 'do app'}: ${address}`);
});
