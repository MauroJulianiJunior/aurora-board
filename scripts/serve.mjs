// Servidor estático de produção local para a pasta dist/ (npm start).
// Escuta só em 127.0.0.1: a lousa é pessoal e não fica exposta na rede.
// Não registra requisições nem conteúdo: o console só mostra o endereço e erros de inicialização.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from './security-headers.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const host = process.env.AURORA_BOARD_SERVE_HOST || '127.0.0.1';
const port = Number(process.env.AURORA_BOARD_SERVE_PORT) || 4180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  const candidate = normalize(join(root, decoded));
  // Bloqueia path traversal: o arquivo precisa estar dentro de dist/.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
  } catch {
    /* cai no index.html abaixo */
  }
  return join(root, 'index.html');
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    res.end();
    return;
  }
  const file = await resolveFile(req.url ?? '/');
  if (!file) {
    res.writeHead(400, SECURITY_HEADERS);
    res.end('Requisição inválida');
    return;
  }
  try {
    const body = await readFile(file);
    const isAsset = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, SECURITY_HEADERS);
    res.end('Não encontrado. Rode "npm run build" antes de "npm run serve".');
  }
});

server.on('error', (err) => {
  console.error(`Não foi possível iniciar o servidor em ${host}:${port}: ${err.code ?? err.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Aurora Board rodando em http://${host}:${port}  (Ctrl+C para parar)`);
});
