// App de desktop: os cabeçalhos de segurança embutidos no .exe e os ícones gerados.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIco, buildSyso, SIZES } from '../../scripts/icons.mjs';
import { SECURITY_HEADERS } from '../../scripts/security-headers.mjs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url));

describe('app de desktop', () => {
  it('o executável usa os mesmos cabeçalhos de segurança do npm start', () => {
    // Se falhar: rode "npm run desktop" (ele regrava desktop/app/headers.json).
    expect(JSON.parse(read('desktop/app/headers.json').toString('utf8'))).toEqual(SECURITY_HEADERS);
  });

  it('o .ico do repositório tem todas as camadas, da menor à de 256 px', () => {
    const ico = read('build/icone/aurora-board.ico');
    expect(ico.readUInt16LE(2)).toBe(1); // ícone
    const count = ico.readUInt16LE(4);
    expect(count).toBe(SIZES.length);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
    expect(sizes).toEqual(SIZES);
    // A camada de 256 px é PNG.
    const last = 6 + (count - 1) * 16;
    const offset = ico.readUInt32LE(last + 12);
    expect([...ico.subarray(offset, offset + 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('o .syso é um objeto COFF x64 com a seção .rsrc e uma relocação por recurso', () => {
    const syso = read('desktop/rsrc_windows_amd64.syso');
    expect(syso.readUInt16LE(0)).toBe(0x8664);
    expect(syso.readUInt16LE(2)).toBe(1);
    expect(syso.subarray(20, 25).toString('latin1')).toBe('.rsrc');
    expect(syso.readUInt16LE(20 + 32)).toBe(SIZES.length + 1); // camadas + o grupo
  });

  it('buildIco e buildSyso aceitam qualquer número de camadas com offsets coerentes', () => {
    const layers = [
      { size: 16, data: new Uint8Array(40) },
      { size: 256, data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
    ];
    const ico = buildIco(layers);
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32);
    expect(ico.readUInt32LE(6 + 16 + 12)).toBe(6 + 32 + 40);
    expect(ico.length).toBe(6 + 32 + 40 + 7);
    const syso = buildSyso(layers);
    expect(syso.readUInt16LE(20 + 32)).toBe(3);
  });
});
