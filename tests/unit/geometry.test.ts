import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '../../src/model/constants';
import { createLinear, createShape } from '../../src/model/elements';
import {
  boundaryPoint,
  elementAtPoint,
  elementsInBox,
  getCommonBounds,
  hitTest,
  resizeBox,
  snapAngle,
} from '../../src/model/geometry';

const box = { x: 0, y: 0, width: 200, height: 100 };

describe('hitTest', () => {
  it('forma vazada sem rótulo só pega pela borda', () => {
    const rect = createShape('rectangle', box, DEFAULT_STYLE);
    expect(hitTest(rect, { x: 100, y: 50 }, { tolerance: 4 })).toBe(false);
    expect(hitTest(rect, { x: 1, y: 50 }, { tolerance: 4 })).toBe(true);
  });

  it('forma preenchida, com rótulo ou já selecionada pega por dentro', () => {
    const filled = createShape('rectangle', box, { ...DEFAULT_STYLE, fillColor: '#ffffff' });
    const labelled = createShape('rectangle', box, DEFAULT_STYLE, 'Olá');
    const plain = createShape('rectangle', box, DEFAULT_STYLE);
    const center = { x: 100, y: 50 };
    expect(hitTest(filled, center, { tolerance: 4 })).toBe(true);
    expect(hitTest(labelled, center, { tolerance: 4 })).toBe(true);
    expect(hitTest(plain, center, { tolerance: 4, selected: true })).toBe(true);
  });

  it('elipse e losango respeitam o contorno, não a caixa', () => {
    const ellipse = createShape('ellipse', box, { ...DEFAULT_STYLE, fillColor: '#ffffff' });
    const diamond = createShape('diamond', box, { ...DEFAULT_STYLE, fillColor: '#ffffff' });
    // O canto da caixa fica fora das duas formas.
    expect(hitTest(ellipse, { x: 8, y: 8 }, { tolerance: 1 })).toBe(false);
    expect(hitTest(diamond, { x: 8, y: 8 }, { tolerance: 1 })).toBe(false);
  });

  it('seta pega perto do segmento', () => {
    const arrow = createLinear('arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, DEFAULT_STYLE);
    expect(hitTest(arrow, { x: 50, y: 5 }, { tolerance: 4 })).toBe(true);
    expect(hitTest(arrow, { x: 50, y: 30 }, { tolerance: 4 })).toBe(false);
  });

  it('elementAtPoint devolve o de cima', () => {
    const below = createShape('rectangle', box, { ...DEFAULT_STYLE, fillColor: '#ffffff' });
    const above = createShape('rectangle', { x: 50, y: 25, width: 50, height: 50 }, { ...DEFAULT_STYLE, fillColor: '#ffffff' });
    expect(elementAtPoint([below, above], { x: 75, y: 50 }, 4)?.id).toBe(above.id);
    expect(elementAtPoint([below, above], { x: 10, y: 50 }, 4)?.id).toBe(below.id);
  });
});

describe('seleção por área', () => {
  it('só entram os elementos inteiramente dentro', () => {
    const a = createShape('rectangle', { x: 10, y: 10, width: 50, height: 50 }, DEFAULT_STYLE);
    const b = createShape('rectangle', { x: 100, y: 10, width: 50, height: 50 }, DEFAULT_STYLE);
    const picked = elementsInBox([a, b], { x: 0, y: 0, width: 120, height: 100 });
    expect(picked.map((el) => el.id)).toEqual([a.id]);
    expect(getCommonBounds([a, b])).toEqual({ x: 10, y: 10, width: 140, height: 50 });
  });
});

describe('boundaryPoint', () => {
  it('encosta na borda do retângulo com a folga', () => {
    const rect = createShape('rectangle', box, DEFAULT_STYLE);
    const p = boundaryPoint(rect, { x: 500, y: 50 }, 6);
    expect(p.x).toBeCloseTo(206);
    expect(p.y).toBeCloseTo(50);
  });

  it('encosta na borda da elipse', () => {
    const ellipse = createShape('ellipse', box, DEFAULT_STYLE);
    const p = boundaryPoint(ellipse, { x: 100, y: -500 }, 0);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it('encosta na borda do losango', () => {
    const diamond = createShape('diamond', box, DEFAULT_STYLE);
    // Na diagonal de 45° (em unidades normalizadas), a borda fica no meio da aresta.
    const p = boundaryPoint(diamond, { x: 100 + 100, y: 50 + 50 }, 0);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(75);
  });
});

describe('resizeBox', () => {
  it('alça sudeste aumenta largura e altura', () => {
    expect(resizeBox(box, 'se', 20, 10, false)).toEqual({ x: 0, y: 0, width: 220, height: 110 });
  });

  it('passar do lado oposto vira a caixa em vez de ficar negativa', () => {
    const r = resizeBox(box, 'e', -300, 0, false);
    expect(r.x).toBe(-100);
    expect(r.width).toBe(100);
  });

  it('com proporção travada mantém a razão', () => {
    const r = resizeBox(box, 'se', 200, 0, true);
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.width).toBe(400);
  });
});

it('snapAngle trava em 15°', () => {
  const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 4 });
  expect(p.y).toBeCloseTo(0);
  expect(p.x).toBeCloseTo(Math.hypot(100, 4));
});
