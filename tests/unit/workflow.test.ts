// O fluxo principal da lousa, de ponta a ponta no estado do editor (sem navegador):
// criar formas → ligar com seta → mover → editar texto → desfazer/refazer → salvar → reabrir → exportar.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { editorReducer, initialEditorState, boardSnapshot, type EditorState } from '../../src/editor/editorState';
import { renderSceneSvg } from '../../src/export/exportScene';
import { DEFAULT_STYLE, DEFAULT_VIEWPORT } from '../../src/model/constants';
import { createShape } from '../../src/model/elements';
import { serializeBoards } from '../../src/model/fileFormat';
import { connectElements, moveElements, setElementText } from '../../src/model/operations';
import { estimateTextSize } from '../../src/model/text';
import type { Board, LinearElement } from '../../src/model/types';
import { parseBoardFile } from '../../src/model/validate';
import { openIndexedDbRepository } from '../../src/storage/repository';

const measure = estimateTextSize;
const arrowIn = (s: EditorState) => s.elements.find((el) => el.type === 'arrow') as LinearElement;

describe('fluxo principal', () => {
  it('cria, conecta, move, desfaz, salva, reabre e exporta', async () => {
    const board: Board = {
      id: 'quadro-teste',
      name: 'Aula de teste',
      createdAt: 1,
      updatedAt: 1,
      elements: [],
      viewport: { ...DEFAULT_VIEWPORT },
      isSample: false,
    };
    let s = editorReducer(initialEditorState, { type: 'load', board });
    expect(s.elements).toHaveLength(0);

    // 1. Duas formas.
    const a = createShape('rectangle', { x: 0, y: 0, width: 160, height: 90 }, DEFAULT_STYLE, 'Pergunta');
    const b = createShape('ellipse', { x: 400, y: 0, width: 160, height: 90 }, DEFAULT_STYLE, 'Resposta');
    s = editorReducer(s, { type: 'setElements', elements: [a], record: s.elements, select: [a.id] });
    s = editorReducer(s, { type: 'setElements', elements: [a, b], record: s.elements, select: [b.id] });
    expect(s.selectedIds).toEqual([b.id]);

    // 2. Seta ligando as duas.
    const connected = connectElements(s.elements, a.id, b.id, s.style);
    s = editorReducer(s, { type: 'setElements', elements: connected.elements, record: s.elements });
    expect(arrowIn(s)).toMatchObject({ startBinding: a.id, endBinding: b.id });

    // 3. Arrastar a forma de baixo: durante o arraste o estado muda sem histórico; no fim, registra.
    const beforeDrag = s.elements;
    for (const dy of [20, 40, 60]) {
      s = editorReducer(s, { type: 'setElements', elements: moveElements(beforeDrag, [b.id], 0, dy) });
    }
    s = editorReducer(s, { type: 'record', before: beforeDrag });
    const endY = arrowIn(s).points[1].y;
    expect(endY).toBeGreaterThan(arrowIn({ ...s, elements: beforeDrag }).points[1].y);

    // 4. Editar o rótulo.
    s = editorReducer(s, {
      type: 'setElements',
      elements: setElementText(s.elements, a.id, 'Pergunta\nda turma', measure),
      record: s.elements,
    });
    expect(s.elements.find((el) => el.id === a.id)).toMatchObject({ text: 'Pergunta\nda turma' });

    // 5. Desfazer duas vezes volta à posição antes do arraste; refazer reaplica.
    s = editorReducer(s, { type: 'undo' });
    s = editorReducer(s, { type: 'undo' });
    expect(s.elements).toBe(beforeDrag);
    s = editorReducer(s, { type: 'redo' });
    expect(arrowIn(s).points[1].y).toBeCloseTo(endY);
    s = editorReducer(s, { type: 'redo' });
    expect(s.revision).toBeGreaterThan(0);

    // 6. Salvar no IndexedDB e reabrir.
    const repo = await openIndexedDbRepository();
    const snapshot = boardSnapshot(s, 2)!;
    await repo.saveBoard(snapshot);
    const reopened = await repo.getBoard(board.id);
    expect(reopened?.elements).toEqual(s.elements);
    expect((await repo.listBoards())[0]).toMatchObject({ id: board.id, elementCount: 3 });

    // 7. Exportar: JSON reimportável e SVG com os três elementos.
    const parsed = parseBoardFile(serializeBoards([reopened!]));
    expect(parsed.ok && parsed.boards[0]!.elements.length).toBe(3);
    const svg = renderSceneSvg(reopened!.elements, { background: true });
    expect(svg?.markup).toContain('<svg');
    expect(svg?.markup).toContain('Resposta');
    expect(svg?.markup.match(/<g/g)).toHaveLength(3);
    expect(svg?.markup).not.toContain('data-element-id');
  });

  it('desfazer não guarda passos vazios e uma mudança nova apaga o refazer', () => {
    const a = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 }, DEFAULT_STYLE);
    let s = editorReducer(initialEditorState, { type: 'setElements', elements: [a], record: [] });
    s = editorReducer(s, { type: 'record', before: s.elements });
    expect(s.history.past).toHaveLength(1);
    s = editorReducer(s, { type: 'undo' });
    expect(s.history.future).toHaveLength(1);
    s = editorReducer(s, { type: 'setElements', elements: [a], record: s.elements });
    expect(s.history.future).toHaveLength(0);
  });

  it('a seleção perde ids de elementos que deixaram de existir', () => {
    const a = createShape('rectangle', { x: 0, y: 0, width: 10, height: 10 }, DEFAULT_STYLE);
    let s = editorReducer(initialEditorState, { type: 'setElements', elements: [a], record: [], select: [a.id] });
    s = editorReducer(s, { type: 'undo' });
    expect(s.selectedIds).toEqual([]);
  });
});
