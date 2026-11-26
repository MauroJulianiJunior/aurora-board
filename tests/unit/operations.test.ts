import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../../src/model/constants';
import { createFreedraw, createShape, createText } from '../../src/model/elements';
import {
  applyStyle,
  connectElements,
  deleteElements,
  duplicateElements,
  moveElements,
  reorderElements,
  scaleElements,
  setElementText,
} from '../../src/model/operations';
import { estimateTextSize } from '../../src/model/text';
import type { BoardElement, LinearElement } from '../../src/model/types';

const measure = estimateTextSize;

function twoShapes() {
  const a = createShape('rectangle', { x: 0, y: 0, width: 100, height: 100 }, DEFAULT_STYLE, 'A');
  const b = createShape('rectangle', { x: 300, y: 0, width: 100, height: 100 }, DEFAULT_STYLE, 'B');
  return { a, b };
}

const arrowOf = (els: BoardElement[]) => els.find((el) => el.type === 'arrow') as LinearElement;

describe('setas ligadas', () => {
  it('connectElements liga as duas pontas às bordas', () => {
    const { a, b } = twoShapes();
    const { elements, arrowId } = connectElements([a, b], a.id, b.id, DEFAULT_STYLE);
    const arrow = arrowOf(elements);
    expect(arrow.id).toBe(arrowId);
    expect(arrow.startBinding).toBe(a.id);
    expect(arrow.endBinding).toBe(b.id);
    expect(arrow.points[0].x).toBeCloseTo(106);
    expect(arrow.points[1].x).toBeCloseTo(294);
  });

  it('não liga uma forma a ela mesma', () => {
    const { a } = twoShapes();
    expect(connectElements([a], a.id, a.id, DEFAULT_STYLE).arrowId).toBeNull();
  });

  it('mover a forma arrasta a ponta da seta junto', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const moved = moveElements(connected, [b.id], 0, 200);
    const arrow = arrowOf(moved);
    expect(arrow.endBinding).toBe(b.id);
    // A ponta continua encostada em B, agora mais abaixo.
    expect(arrow.points[1].y).toBeGreaterThan(150);
    expect(arrow.points[0].y).toBeGreaterThan(50);
  });

  it('seta arrastada sozinha se solta; arrastada com as formas continua ligada', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const arrow = arrowOf(connected);
    const alone = arrowOf(moveElements(connected, [arrow.id], 10, 10));
    expect(alone.startBinding).toBeNull();
    expect(alone.endBinding).toBeNull();
    const together = arrowOf(moveElements(connected, [a.id, b.id, arrow.id], 10, 10));
    expect(together.startBinding).toBe(a.id);
    expect(together.endBinding).toBe(b.id);
  });

  it('apagar a forma solta a seta, que fica onde estava', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const before = arrowOf(connected);
    const after = deleteElements(connected, [b.id]);
    const arrow = arrowOf(after);
    expect(after).toHaveLength(2);
    expect(arrow.endBinding).toBeNull();
    expect(arrow.startBinding).toBe(a.id);
    expect(arrow.points).toEqual(before.points);
  });

  it('duplicar formas e seta juntas preserva a ligação entre as cópias', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const ids = connected.map((el) => el.id);
    const { elements, newIds } = duplicateElements(connected, ids);
    expect(elements).toHaveLength(6);
    const copyArrow = elements.find((el) => el.type === 'arrow' && newIds.includes(el.id)) as LinearElement;
    expect(newIds).toContain(copyArrow.startBinding);
    expect(newIds).toContain(copyArrow.endBinding);
  });

  it('duplicar só a seta solta a cópia', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const arrow = arrowOf(connected);
    const { elements, newIds } = duplicateElements(connected, [arrow.id]);
    const copy = elements.find((el) => el.id === newIds[0]) as LinearElement;
    expect(copy.startBinding).toBeNull();
    expect(copy.endBinding).toBeNull();
  });
});

describe('redimensionar', () => {
  it('escala formas e traços livres pela caixa', () => {
    const rect = createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 }, DEFAULT_STYLE);
    const pen = createFreedraw([{ x: 0, y: 0 }, { x: 100, y: 50 }], DEFAULT_STYLE);
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 0, y: 0, width: 200, height: 100 };
    const [r, p] = scaleElements([rect, pen], [rect.id, pen.id], from, to, measure);
    expect(r).toMatchObject({ width: 200, height: 100 });
    expect(p && 'points' in p ? p.points[1] : null).toEqual({ x: 200, y: 100 });
  });

  it('texto cresce pela fonte e é medido de novo', () => {
    const text = createText({ x: 0, y: 0 }, 'Aula 1', DEFAULT_STYLE, measure);
    const from = { x: 0, y: 0, width: text.width, height: text.height };
    const to = { x: 0, y: 0, width: text.width * 2, height: text.height * 2 };
    const [scaled] = scaleElements([text], [text.id], from, to, measure);
    expect(scaled).toMatchObject({ fontSize: DEFAULT_STYLE.fontSize * 2 });
  });
});

describe('texto', () => {
  it('texto solto vazio é removido ao concluir a edição', () => {
    const text = createText({ x: 0, y: 0 }, 'x', DEFAULT_STYLE, measure);
    expect(setElementText([text], text.id, '   ', measure)).toHaveLength(0);
    expect(setElementText([text], text.id, '', measure, { removeEmpty: false })).toHaveLength(1);
  });

  it('rótulo de forma pode ficar vazio sem apagar a forma', () => {
    const rect = createShape('rectangle', { x: 0, y: 0, width: 100, height: 50 }, DEFAULT_STYLE, 'A');
    const [r] = setElementText([rect], rect.id, '', measure);
    expect(r).toMatchObject({ text: '' });
  });

  it('mudar a fonte de um texto mede de novo', () => {
    const text = createText({ x: 0, y: 0 }, 'Olá', DEFAULT_STYLE, measure);
    const [bigger] = applyStyle([text], [text.id], { fontSize: 64 }, measure);
    expect(bigger).toMatchObject({ fontSize: 64 });
    expect((bigger as typeof text).width).toBeGreaterThan(text.width);
  });
});

describe('camadas e estilo', () => {
  it('reorderElements move para frente, trás e extremos', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((t) =>
      createShape('rectangle', { x: 0, y: 0, width: 1, height: 1 }, DEFAULT_STYLE, t),
    ) as [BoardElement, BoardElement, BoardElement];
    const ids = (els: BoardElement[]) => els.map((el) => ('text' in el ? el.text : ''));
    expect(ids(reorderElements([a, b, c], [a.id], 'forward'))).toEqual(['b', 'a', 'c']);
    expect(ids(reorderElements([a, b, c], [c.id], 'backward'))).toEqual(['a', 'c', 'b']);
    expect(ids(reorderElements([a, b, c], [a.id], 'front'))).toEqual(['b', 'c', 'a']);
    expect(ids(reorderElements([a, b, c], [c.id], 'back'))).toEqual(['c', 'a', 'b']);
  });

  it('preenchimento não vale para setas e texto', () => {
    const { a, b } = twoShapes();
    const connected = connectElements([a, b], a.id, b.id, DEFAULT_STYLE).elements;
    const styled = applyStyle(connected, connected.map((el) => el.id), { fillColor: '#00e676' }, measure);
    expect(styled[0]).toMatchObject({ fillColor: '#00e676' });
    expect(arrowOf(styled).fillColor).toBe('transparent');
  });
});
