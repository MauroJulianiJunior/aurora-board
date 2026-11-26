import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveShortcut } from '../../src/editor/shortcuts';
import { fitViewport, zoomAt } from '../../src/editor/viewport';
import { createSampleBoard } from '../../src/model/sample';
import { estimateTextSize } from '../../src/model/text';
import { createMemoryRepository, openIndexedDbRepository } from '../../src/storage/repository';

beforeEach(() => {
  // Banco novo e vazio a cada teste.
  globalThis.indexedDB = new IDBFactory();
});

describe('repositório IndexedDB', () => {
  it('lista do mais recente para o mais antigo, apaga e guarda preferências', async () => {
    const repo = await openIndexedDbRepository();
    const older = { ...createSampleBoard(estimateTextSize, 1000), name: 'Antigo' };
    const newer = { ...createSampleBoard(estimateTextSize, 2000), name: 'Novo' };
    await repo.saveBoard(older);
    await repo.saveBoard(newer);
    expect((await repo.listBoards()).map((b) => b.name)).toEqual(['Novo', 'Antigo']);
    await repo.deleteBoard(newer.id);
    expect(await repo.getBoard(newer.id)).toBeNull();
    expect((await repo.listBoards()).map((b) => b.name)).toEqual(['Antigo']);
    await repo.setSetting('showGrid', false);
    expect(await repo.getSetting('showGrid')).toBe(false);
  });

  it('descarta elementos corrompidos gravados no banco sem perder o resto', async () => {
    const repo = await openIndexedDbRepository();
    const board = createSampleBoard(estimateTextSize);
    const broken = { ...board, elements: [...board.elements, { type: 'virus' } as never] };
    await repo.saveBoard(broken);
    const loaded = await repo.getBoard(board.id);
    expect(loaded?.elements).toHaveLength(board.elements.length);
  });

  it('modo degradado em memória tem o mesmo contrato', async () => {
    const repo = createMemoryRepository();
    const board = createSampleBoard(estimateTextSize);
    await repo.saveBoard(board);
    expect((await repo.getBoard(board.id))?.name).toBe(board.name);
    expect(repo.kind).toBe('memory');
  });
});

describe('atalhos', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
    resolveShortcut({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

  it('ferramentas por letra e número', () => {
    expect(key('r')).toEqual({ type: 'tool', tool: 'rectangle' });
    expect(key('5')).toEqual({ type: 'tool', tool: 'arrow' });
    expect(key('P')).toEqual({ type: 'tool', tool: 'freedraw' });
  });

  it('desfazer, refazer, duplicar e camadas', () => {
    expect(key('z', { ctrlKey: true })).toEqual({ type: 'undo' });
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toEqual({ type: 'redo' });
    expect(key('y', { ctrlKey: true })).toEqual({ type: 'redo' });
    expect(key('d', { ctrlKey: true })).toEqual({ type: 'duplicate' });
    expect(key(']', { ctrlKey: true })).toEqual({ type: 'reorder', direction: 'forward' });
  });

  it('setas movem 1 px, com Shift 10 px; Shift+letra não troca de ferramenta', () => {
    expect(key('ArrowLeft')).toEqual({ type: 'nudge', dx: -1, dy: 0 });
    expect(key('ArrowDown', { shiftKey: true })).toEqual({ type: 'nudge', dx: 0, dy: 10 });
    expect(key('R', { shiftKey: true })).toBeNull();
  });
});

describe('viewport', () => {
  it('zoom mantém o ponto sob o cursor', () => {
    const vp = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 100 });
    expect(vp).toEqual({ x: 50, y: 50, zoom: 2 });
  });

  it('enquadrar centraliza e limita o zoom em 200%', () => {
    const vp = fitViewport({ x: 0, y: 0, width: 10, height: 10 }, 1000, 800);
    expect(vp.zoom).toBe(2);
    expect(vp.x + 1000 / 2 / vp.zoom).toBeCloseTo(5);
  });
});
