// Prévia local isolada. --demo serve os dados fictícios sem editar config.js.
// Uso: node scripts/preview.cjs --demo (http://127.0.0.1:5180)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const demo = process.argv.includes('--demo');
const port = demo ? 5180 : 5173;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/') pathname = '/index.html';
  // Não servir documentação, arquivos ocultos ou arquivos fora do app.
  // `assets/` inteiro entra: servir menos do que a produção serve faz a prévia
  // mentir — a logo faltava em todo teste local e virava um 404 no console.
  if (!/^\/(index\.html|manifest\.json|Logo e banner\.jpg|(?:css|js)\/[a-zA-Z0-9/_.-]+|assets\/[a-zA-Z0-9/_-]+\.(?:jpg|png|svg))$/.test(pathname) || pathname.includes('..')) {
    res.writeHead(404); return res.end();
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (demo && pathname === '/js/config.js') data = data.toString().replace('export const DATA_SOURCE = "supabase";', 'export const DATA_SOURCE = "local";');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Prévia ${demo ? 'com dados fictícios' : 'do app'}: http://127.0.0.1:${port}`));
