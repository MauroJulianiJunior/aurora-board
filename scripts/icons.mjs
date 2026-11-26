// Gera os ícones do Aurora Board a partir de design/marca/icone.svg (npm run icons).
//
// Escreve (todos ficam no repositório; o build não depende de rodar este script):
//   build/icone/aurora-board.ico        ícone do instalador e do desinstalador
//   build/icone/aurora-board-256.png    a camada grande, para o README
//   desktop/rsrc_windows_amd64.syso     o mesmo ícone como recurso do AuroraBoard.exe (o `go build` liga sozinho)
//   public/favicon.svg                  a aba do navegador (cópia do SVG)
//
// As camadas são desenhadas pelo Chromium do Playwright (o mesmo do teste ponta a ponta), num canvas do
// tamanho de cada camada: o SVG é rasterizado direto em 16, 24, 32... px, sem reduzir uma imagem grande.
// O .ico e o .syso seguem o gerador do Aurora Whisper (cmd/gerarico, Go): camadas pequenas em bitmap
// (DIB de 32 bits com máscara), a de 256 px em PNG; o .syso é um objeto COFF com a seção .rsrc.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'design/marca/icone.svg');
const OUT_ICO = resolve(root, 'build/icone/aurora-board.ico');
const OUT_PNG = resolve(root, 'build/icone/aurora-board-256.png');
const OUT_SYSO = resolve(root, 'desktop/rsrc_windows_amd64.syso');
const OUT_FAVICON = resolve(root, 'public/favicon.svg');

/** 16/20/24/32/40/48: listas e barra de tarefas a 100%–300% de escala; 64: mosaicos; 256: ícones grandes. */
export const SIZES = [16, 20, 24, 32, 40, 48, 64, 256];

// ─── Escrita little-endian ───────────────────────────────────────────────

class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }
  bytes(buf) {
    const b = Buffer.from(buf);
    this.parts.push(b);
    this.length += b.length;
  }
  u8(v) {
    this.bytes([v & 0xff]);
  }
  u16(v) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v);
    this.bytes(b);
  }
  u32(v) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0);
    this.bytes(b);
  }
  pad(to) {
    while (this.length < to) this.u8(0);
  }
  toBuffer() {
    return Buffer.concat(this.parts);
  }
}

const sideByte = (size) => (size >= 256 ? 0 : size);

/** Bitmap de ícone: BITMAPINFOHEADER com altura dobrada, linhas de baixo para cima (BGRA) e a máscara AND. */
function encodeDib(size, rgba) {
  const w = new Writer();
  const maskRow = Math.ceil(size / 32) * 4;
  w.u32(40);
  w.u32(size);
  w.u32(size * 2);
  w.u16(1);
  w.u16(32);
  w.u32(0);
  w.u32(size * size * 4 + maskRow * size);
  w.u32(0);
  w.u32(0);
  w.u32(0);
  w.u32(0);
  for (let y = size - 1; y >= 0; y--) {
    const row = Buffer.alloc(size * 4);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      row[x * 4] = rgba[i + 2];
      row[x * 4 + 1] = rgba[i + 1];
      row[x * 4 + 2] = rgba[i];
      row[x * 4 + 3] = rgba[i + 3];
    }
    w.bytes(row);
  }
  for (let y = size - 1; y >= 0; y--) {
    const row = Buffer.alloc(maskRow);
    for (let x = 0; x < size; x++) {
      if (rgba[(y * size + x) * 4 + 3] === 0) row[x >> 3] |= 0x80 >> (x % 8);
    }
    w.bytes(row);
  }
  return w.toBuffer();
}

export function buildIco(layers) {
  const w = new Writer();
  w.u16(0);
  w.u16(1);
  w.u16(layers.length);
  let offset = 6 + 16 * layers.length;
  for (const l of layers) {
    w.u8(sideByte(l.size));
    w.u8(sideByte(l.size));
    w.u8(0);
    w.u8(0);
    w.u16(1);
    w.u16(32);
    w.u32(l.data.length);
    w.u32(offset);
    offset += l.data.length;
  }
  for (const l of layers) w.bytes(l.data);
  return w.toBuffer();
}

/**
 * Objeto COFF (amd64) com a seção .rsrc: RT_ICON (uma entrada por camada, ids 1..n) e RT_GROUP_ICON id 1,
 * o ícone do executável (é o id que o launcher passa ao go-webview2 para o ícone da janela). Cada
 * OffsetToData leva uma relocação ADDR32NB contra o símbolo da seção; o ligador do Go soma o RVA.
 */
export function buildSyso(layers) {
  const n = layers.length;
  const DIR = 16;
  const ENTRY = 8;
  const DATA = 16;
  const offTypeIcon = DIR + 2 * ENTRY;
  const offTypeGroup = offTypeIcon + DIR + n * ENTRY;
  const offLangIcon = (i) => offTypeGroup + DIR + ENTRY + i * (DIR + ENTRY);
  const offLangGroup = offLangIcon(n);
  const offData = (i) => offLangGroup + DIR + ENTRY + i * DATA;
  const offBlobs = offData(n + 1);

  const group = new Writer();
  group.u16(0);
  group.u16(1);
  group.u16(n);
  layers.forEach((l, i) => {
    group.u8(sideByte(l.size));
    group.u8(sideByte(l.size));
    group.u8(0);
    group.u8(0);
    group.u16(1);
    group.u16(32);
    group.u32(l.data.length);
    group.u16(i + 1);
  });
  const blobs = [...layers.map((l) => l.data), group.toBuffer()];
  const align = (v) => (v + 3) & ~3;
  const blobOffsets = [];
  let cursor = offBlobs;
  for (const b of blobs) {
    blobOffsets.push(cursor);
    cursor = align(cursor + b.length);
  }
  const sectionSize = cursor;

  const s = new Writer();
  const directory = (ids) => {
    s.u32(0);
    s.u32(0);
    s.u16(0);
    s.u16(0);
    s.u16(0);
    s.u16(ids);
  };
  const entry = (id, target) => {
    s.u32(id);
    s.u32(target);
  };
  const SUBDIR = 0x80000000;
  const LANG = 0x0409;
  directory(2);
  entry(3, (SUBDIR | offTypeIcon) >>> 0);
  entry(14, (SUBDIR | offTypeGroup) >>> 0);
  directory(n);
  for (let i = 0; i < n; i++) entry(i + 1, (SUBDIR | offLangIcon(i)) >>> 0);
  directory(1);
  entry(1, (SUBDIR | offLangGroup) >>> 0);
  for (let i = 0; i < n; i++) {
    directory(1);
    entry(LANG, offData(i));
  }
  directory(1);
  entry(LANG, offData(n));
  const relocs = [];
  for (let i = 0; i <= n; i++) {
    relocs.push(offData(i));
    s.u32(blobOffsets[i]);
    s.u32(blobs[i].length);
    s.u32(0);
    s.u32(0);
  }
  if (s.length !== offBlobs) throw new Error(`layout dos recursos errado: ${s.length} != ${offBlobs}`);
  blobs.forEach((b, i) => {
    s.pad(blobOffsets[i]);
    s.bytes(b);
  });
  s.pad(sectionSize);
  const section = s.toBuffer();

  const HEADER = 20;
  const SECTION = 40;
  const RELOC = 10;
  const offSectionData = HEADER + SECTION;
  const offRelocs = offSectionData + section.length;
  const offSymbols = offRelocs + RELOC * relocs.length;
  const name = Buffer.from([0x2e, 0x72, 0x73, 0x72, 0x63, 0, 0, 0]); // ".rsrc"

  const f = new Writer();
  f.u16(0x8664); // AMD64
  f.u16(1);
  f.u32(0); // TimeDateStamp: zero, arquivo reproduzível
  f.u32(offSymbols);
  f.u32(1);
  f.u16(0);
  f.u16(0);
  f.bytes(name);
  f.u32(0);
  f.u32(0);
  f.u32(section.length);
  f.u32(offSectionData);
  f.u32(offRelocs);
  f.u32(0);
  f.u16(relocs.length);
  f.u16(0);
  f.u32(0x40000040); // dados inicializados, leitura
  f.bytes(section);
  for (const off of relocs) {
    f.u32(off);
    f.u32(0);
    f.u16(0x0003); // IMAGE_REL_AMD64_ADDR32NB
  }
  f.bytes(name);
  f.u32(0);
  f.u16(1);
  f.u16(0);
  f.u8(3); // IMAGE_SYM_CLASS_STATIC
  f.u8(0);
  f.u32(4); // tabela de nomes longos vazia
  return f.toBuffer();
}

// ─── Renderização das camadas ────────────────────────────────────────────

async function renderLayers(svg) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const raw = await page.evaluate(
      async ({ svg: source, sizes }) => {
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
        await img.decode();
        const out = [];
        for (const size of sizes) {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);
          out.push({
            size,
            rgba: Array.from(ctx.getImageData(0, 0, size, size).data),
            png: canvas.toDataURL('image/png').split(',')[1],
          });
        }
        return out;
      },
      { svg, sizes: SIZES },
    );
    return raw.map((l) => ({ size: l.size, rgba: Uint8Array.from(l.rgba), png: Buffer.from(l.png, 'base64') }));
  } finally {
    await browser.close();
  }
}

async function main() {
  const svg = readFileSync(SOURCE, 'utf8');
  const rendered = await renderLayers(svg);
  const layers = rendered.map((l) => ({ size: l.size, data: l.size >= 256 ? l.png : encodeDib(l.size, l.rgba) }));

  mkdirSync(dirname(OUT_ICO), { recursive: true });
  writeFileSync(OUT_ICO, buildIco(layers));
  writeFileSync(OUT_PNG, rendered.find((l) => l.size === 256).png);
  writeFileSync(OUT_SYSO, buildSyso(layers));
  copyFileSync(SOURCE, OUT_FAVICON);
  console.log(`Ícones gerados (${SIZES.join(', ')} px):`);
  for (const p of [OUT_ICO, OUT_PNG, OUT_SYSO, OUT_FAVICON]) console.log(`  ${p.slice(root.length + 1)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Falha ao gerar os ícones: ${err.message}`);
    process.exit(1);
  });
}
