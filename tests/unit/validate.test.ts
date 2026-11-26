import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, LIMITS } from '../../src/model/constants';
import { createShape } from '../../src/model/elements';
import { boardFileName, parseClipboard, serializeBoards, serializeClipboard } from '../../src/model/fileFormat';
import { connectElements } from '../../src/model/operations';
import { createSampleBoard } from '../../src/model/sample';
import { estimateTextSize } from '../../src/model/text';
import type { LinearElement } from '../../src/model/types';
import { parseBoardFile, validateBoardName } from '../../src/model/validate';

const file = (boards: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'aurora-board', version: 1, boards, ...extra });

const rect = { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, strokeColor: '#1f2723', fillColor: 'transparent', strokeWidth: 4, strokeStyle: 'solid', text: '', fontFamily: 'sans', fontSize: 28 };

describe('parseBoardFile', () => {
  it('ida e volta: exportar e importar preserva o quadro (com ids novos e ligações refeitas)', () => {
    const sample = createSampleBoard(estimateTextSize);
    const result = parseBoardFile(serializeBoards([sample]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [board] = result.boards;
    expect(board?.name).toBe(sample.name);
    expect(board?.elements).toHaveLength(sample.elements.length);
    const originalIds = new Set(sample.elements.map((el) => el.id));
    expect(board?.elements.some((el) => originalIds.has(el.id))).toBe(false);
    const arrows = board!.elements.filter((el): el is LinearElement => el.type === 'arrow');
    const ids = new Set(board!.elements.map((el) => el.id));
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      expect(ids.has(a.startBinding!)).toBe(true);
      expect(ids.has(a.endBinding!)).toBe(true);
    }
  });

  it.each([
    ['não é JSON', '{nada', 'não é um JSON válido'],
    ['outro formato', JSON.stringify({ type: 'excalidraw', version: 2 }), 'não é um quadro do Aurora Board'],
    ['versão futura', JSON.stringify({ type: 'aurora-board', version: 99, boards: [] }), 'versão mais nova'],
    ['sem quadros', file([]), 'nenhum quadro'],
    ['tipo desconhecido', file([{ name: 'x', elements: [{ ...rect, type: 'script' }] }]), 'Elemento 1: tipo desconhecido'],
    ['cor com injeção', file([{ name: 'x', elements: [{ ...rect, strokeColor: 'red" onload="alert(1)' }] }]), 'cor inválida'],
    ['número infinito', file([{ name: 'x', elements: [{ ...rect, x: 1e300 }] }]), 'fora do intervalo'],
    ['texto gigante', file([{ name: 'x', elements: [{ ...rect, text: 'a'.repeat(LIMITS.maxTextLength + 1) }] }]), 'texto maior'],
    ['seta com 3 pontos', file([{ name: 'x', elements: [{ ...rect, type: 'arrow', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }] }]), 'exatamente 2 pontos'],
  ])('recusa arquivo inválido: %s', (_label, content, message) => {
    const result = parseBoardFile(content);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('solta ligações para elementos que não existem e tira caracteres de controle do texto', () => {
    const arrow = { ...rect, id: 'a1', type: 'arrow', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], startBinding: 'r1', endBinding: 'fantasma' };
    const result = parseBoardFile(file([{ name: 'Aula\u0007 1', elements: [{ ...rect, text: 'oi\u0000\r\nmundo' }, arrow] }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [shape, line] = result.boards[0]!.elements;
    expect(shape).toMatchObject({ text: 'oi\nmundo' });
    expect(line).toMatchObject({ endBinding: null });
    expect((line as LinearElement).startBinding).toBe(shape!.id);
    expect(result.boards[0]!.name).toBe('Aula 1');
  });
});

describe('validateBoardName', () => {
  it('apara, recusa vazio e longo demais', () => {
    expect(validateBoardName('  Aula   de   IA ')).toEqual({ ok: true, name: 'Aula de IA' });
    expect(validateBoardName('   ').ok).toBe(false);
    expect(validateBoardName('x'.repeat(LIMITS.maxNameLength + 1)).ok).toBe(false);
  });
});

describe('área de transferência e nomes de arquivo', () => {
  it('copiar e colar devolve elementos com ids novos e a ligação entre eles', () => {
    const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }, DEFAULT_STYLE);
    const b = createShape('ellipse', { x: 300, y: 0, width: 100, height: 100 }, DEFAULT_STYLE);
    const { elements } = connectElements([a, b], a.id, b.id, DEFAULT_STYLE);
    const pasted = parseClipboard(serializeClipboard(elements));
    expect(pasted).toHaveLength(3);
    const arrow = pasted!.find((el): el is LinearElement => el.type === 'arrow')!;
    expect(arrow.startBinding).toBe(pasted![0]!.id);
    expect(pasted![0]!.id).not.toBe(a.id);
  });

  it('texto comum não é tratado como cópia do app', () => {
    expect(parseClipboard('olá, turma')).toBeNull();
    expect(parseClipboard('{"type":"outra-coisa"}')).toBeNull();
  });

  it('nome de arquivo sem acentos nem caracteres perigosos', () => {
    expect(boardFileName('Aula 3: Automação/IA <final>')).toBe('aula-3-automacao-ia-final.aurora.json');
    expect(boardFileName('***')).toBe('quadro.aurora.json');
  });
});
