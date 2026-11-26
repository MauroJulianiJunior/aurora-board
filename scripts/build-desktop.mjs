// Monta o app de desktop do Windows e, com --installer, o instalador.
//
//   npm run desktop     → release/app/AuroraBoard.exe
//   npm run installer   → o mesmo + release/AuroraBoard-Setup-<versão>.exe (e o .sha256 ao lado)
//
// Passos: build da lousa (typecheck + vite) → copia dist/ para desktop/app/dist (o Go embute) →
// grava desktop/app/headers.json a partir de scripts/security-headers.mjs → go vet e go test →
// go build (sem console, com a versão do package.json) → Inno Setup.
//
// Pré-requisitos: Node, Go 1.22+ e, para o instalador, o Inno Setup 6 (procurado no PATH e nas pastas
// padrão). O ícone já está pronto no repositório; para mudar o desenho, edite design/marca/icone.svg e
// rode "npm run icons". Este script só compila e copia: não executa o app nem o instalador.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from './security-headers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const release = join(root, 'release');
const appOut = join(release, 'app');
const wantInstaller = process.argv.includes('--installer');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versão inválida no package.json: ${version}`);

function step(title) {
  console.log(`\n▸ ${title}`);
}

function run(command, args, cwd, env = {}) {
  // Só o npm precisa do shell no Windows (é um .cmd); vai como uma linha só, com argumentos fixos deste
  // script. O resto roda direto, com os argumentos intactos (pelo shell, o -ldflags chegaria partido).
  const viaShell = process.platform === 'win32' && command === 'npm';
  const result = viaShell
    ? spawnSync([command, ...args].join(' '), { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...env } })
    : spawnSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`
Falhou: ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function findIscc() {
  const candidates = [
    process.env.ISCC,
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    join(process.env['ProgramFiles(x86)'] ?? '', 'Inno Setup 6', 'ISCC.exe'),
    join(process.env.ProgramFiles ?? '', 'Inno Setup 6', 'ISCC.exe'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const where = spawnSync('where', ['ISCC.exe'], { encoding: 'utf8', shell: true });
  const first = where.status === 0 ? where.stdout.split(/\r?\n/)[0]?.trim() : '';
  return first || null;
}

if (process.platform !== 'win32') {
  console.error('O app de desktop é só para Windows. Use "npm start" nos outros sistemas.');
  process.exit(1);
}

step(`Build da lousa (versão ${version})`);
run('npm', ['run', 'build'], root);

step('Copiando o build para dentro do executável (desktop/app/dist)');
const embedDir = join(desktop, 'app', 'dist');
mkdirSync(embedDir, { recursive: true });
for (const entry of readdirSync(embedDir)) {
  if (entry !== '.gitkeep') rmSync(join(embedDir, entry), { recursive: true, force: true });
}
cpSync(join(root, 'dist'), embedDir, { recursive: true });
writeFileSync(join(desktop, 'app', 'headers.json'), `${JSON.stringify(SECURITY_HEADERS, null, 2)}\n`);

step('Conferindo o código do app de desktop (go vet, go test)');
run('go', ['vet', './...'], desktop);
run('go', ['test', './...'], desktop);

step('Compilando release/app/AuroraBoard.exe');
rmSync(appOut, { recursive: true, force: true });
mkdirSync(appOut, { recursive: true });
const exe = join(appOut, 'AuroraBoard.exe');
run(
  'go',
  ['build', '-trimpath', '-ldflags', `-H=windowsgui -s -w -X main.version=${version}`, '-o', exe, '.'],
  desktop,
  { GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
);
const exeBytes = readFileSync(exe);
if (exeBytes.includes(Buffer.from(root, 'utf8'))) {
  console.error('O executável contém um caminho desta máquina (o -trimpath deveria ter removido).');
  process.exit(1);
}
console.log(`  ${(exeBytes.length / 1024 / 1024).toFixed(1)} MB`);

if (!wantInstaller) {
  console.log(`\nPronto: ${exe}`);
  process.exit(0);
}

step('Gerando o instalador (Inno Setup)');
const iscc = findIscc();
if (!iscc) {
  console.error('Inno Setup 6 não encontrado. Instale (winget install JRSoftware.InnoSetup) ou aponte a variável ISCC para o ISCC.exe.');
  process.exit(1);
}
run(iscc, [
  '/Q',
  `/DVersaoDoApp=${version}`,
  `/DVersaoNumerica=${version}.0`,
  `/DPastaDoBuild=${appOut}`,
  `/DPastaSaida=${release}`,
  join(root, 'installer', 'aurora-board.iss'),
], root);
const setup = join(release, `AuroraBoard-Setup-${version}.exe`);
const sha = createHash('sha256').update(readFileSync(setup)).digest('hex');
writeFileSync(`${setup}.sha256`, `${sha}  AuroraBoard-Setup-${version}.exe\n`);
console.log(`\nPronto:\n  ${setup}\n  SHA-256 ${sha}`);
