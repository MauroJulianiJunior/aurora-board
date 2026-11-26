import { BINDING_GAP } from './constants';
import {
  isBindable,
  isBoxElement,
  isLinear,
  type BindableElement,
  type BoardElement,
  type Box,
  type Point,
} from './types';

export function normalizeBox(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function pointsBounds(points: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getBounds(el: BoardElement): Box {
  if (isBoxElement(el)) return { x: el.x, y: el.y, width: el.width, height: el.height };
  return pointsBounds(el.points);
}

export function getCommonBounds(elements: readonly BoardElement[]): Box | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getBounds(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function expandBox(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

export function pointInBox(p: Point, box: Box): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

export function boxContainsBox(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function distanceToPolyline(p: Point, points: readonly Point[]): number {
  if (points.length === 1) return distance(p, points[0]!);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!));
  }
  return best;
}

/** Vértices do losango (topo, direita, base, esquerda). */
export function diamondPoints(box: Box): Point[] {
  const c = boxCenter(box);
  return [
    { x: c.x, y: box.y },
    { x: box.x + box.width, y: c.y },
    { x: c.x, y: box.y + box.height },
    { x: box.x, y: c.y },
  ];
}

/** Distância normalizada do centro: < 1 dentro da forma, 1 na borda, > 1 fora. */
function shapeMetric(el: BindableElement, p: Point): number {
  const hw = Math.max(el.width / 2, 0.0001);
  const hh = Math.max(el.height / 2, 0.0001);
  const dx = (p.x - (el.x + hw)) / hw;
  const dy = (p.y - (el.y + hh)) / hh;
  if (el.type === 'ellipse') return Math.sqrt(dx * dx + dy * dy);
  if (el.type === 'diamond') return Math.abs(dx) + Math.abs(dy);
  return Math.max(Math.abs(dx), Math.abs(dy));
}

function distanceToShapeOutline(el: BindableElement, p: Point): number {
  if (el.type === 'diamond') {
    const v = diamondPoints(el);
    return distanceToPolyline(p, [...v, v[0]!]);
  }
  if (el.type === 'ellipse') {
    // Aproximação: diferença entre o ponto e a borda ao longo do raio, em unidades de mundo.
    const c = boxCenter(el);
    const m = shapeMetric(el, p);
    if (m === 0) return Math.min(el.width, el.height) / 2;
    const d = distance(c, p);
    return Math.abs(d - d / m);
  }
  const corners: Point[] = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ];
  return distanceToPolyline(p, [...corners, corners[0]!]);
}

export interface HitOptions {
  /** Tolerância em unidades de mundo (o chamador divide os pixels de tela pelo zoom). */
  tolerance: number;
  /** Elemento já selecionado: aceita clique em qualquer ponto de dentro, para arrastar. */
  selected?: boolean;
}

/**
 * Formas preenchidas, com rótulo, ou já selecionadas aceitam clique por dentro; formas vazadas
 * só pela borda (assim dá para clicar no que está "dentro" de uma moldura vazada).
 */
export function hitTest(el: BoardElement, p: Point, { tolerance, selected = false }: HitOptions): boolean {
  if (isLinear(el) || el.type === 'freedraw') {
    return distanceToPolyline(p, el.points) <= tolerance + el.strokeWidth / 2;
  }
  if (el.type === 'text') return pointInBox(p, expandBox(el, tolerance));
  const insideCounts = selected || el.fillColor !== 'transparent' || el.text.trim().length > 0;
  if (insideCounts && shapeMetric(el, p) <= 1) return true;
  return distanceToShapeOutline(el, p) <= tolerance + el.strokeWidth / 2;
}

/** O elemento mais acima (último da lista) sob o ponto. */
export function elementAtPoint(
  elements: readonly BoardElement[],
  p: Point,
  tolerance: number,
  selectedIds: ReadonlySet<string> = new Set(),
): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (hitTest(el, p, { tolerance, selected: selectedIds.has(el.id) })) return el;
  }
  return null;
}

/** Forma ou texto sob o ponto, para ligar uma ponta de seta (aceita um pouco além da borda). */
export function bindableAtPoint(
  elements: readonly BoardElement[],
  p: Point,
  tolerance: number,
  excludeIds: ReadonlySet<string> = new Set(),
): BindableElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (!isBindable(el) || excludeIds.has(el.id)) continue;
    if (pointInBox(p, expandBox(el, tolerance))) return el;
  }
  return null;
}

/** Elementos inteiramente dentro do retângulo de seleção. */
export function elementsInBox(elements: readonly BoardElement[], box: Box): BoardElement[] {
  return elements.filter((el) => boxContainsBox(box, getBounds(el)));
}

/**
 * Ponto da borda da forma na direção de `toward`, afastado `gap` para fora.
 * É onde a ponta de uma seta ligada encosta.
 */
export function boundaryPoint(el: BindableElement, toward: Point, gap = BINDING_GAP): Point {
  const c = boxCenter(el);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return c;
  const hw = Math.max(el.width / 2, 0.0001);
  const hh = Math.max(el.height / 2, 0.0001);
  const nx = dx / hw;
  const ny = dy / hh;
  let scale: number;
  if (el.type === 'ellipse') scale = 1 / Math.sqrt(nx * nx + ny * ny);
  else if (el.type === 'diamond') scale = 1 / (Math.abs(nx) + Math.abs(ny));
  else scale = 1 / Math.max(Math.abs(nx), Math.abs(ny));
  const edge = { x: c.x + dx * scale, y: c.y + dy * scale };
  return { x: edge.x + (dx / len) * gap, y: edge.y + (dy / len) * gap };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function handlePosition(box: Box, handle: HandleId): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.x + box.width;
  const b = box.y + box.height;
  switch (handle) {
    case 'nw':
      return { x: box.x, y: box.y };
    case 'n':
      return { x: cx, y: box.y };
    case 'ne':
      return { x: r, y: box.y };
    case 'e':
      return { x: r, y: cy };
    case 'se':
      return { x: r, y: b };
    case 's':
      return { x: cx, y: b };
    case 'sw':
      return { x: box.x, y: b };
    case 'w':
      return { x: box.x, y: cy };
  }
}

const MIN_SIZE = 4;

/**
 * Novo retângulo ao arrastar uma alça por (dx, dy). Com keepRatio, mantém a proporção.
 * Se a alça passar do lado oposto, a caixa vira (o resultado é sempre normalizado).
 */
export function resizeBox(box: Box, handle: HandleId, dx: number, dy: number, keepRatio: boolean): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;

  if (keepRatio && box.width > 0 && box.height > 0) {
    const ratio = box.width / box.height;
    let w = right - left;
    let h = bottom - top;
    const horizontal = handle === 'e' || handle === 'w';
    const vertical = handle === 'n' || handle === 's';
    if (horizontal) h = Math.abs(w) / ratio * Math.sign(h || 1);
    else if (vertical) w = Math.abs(h) * ratio * Math.sign(w || 1);
    else if (Math.abs(w) / ratio > Math.abs(h)) h = (Math.abs(w) / ratio) * Math.sign(h || 1);
    else w = Math.abs(h) * ratio * Math.sign(w || 1);
    // Ancora no lado oposto à alça (ou no centro, nas alças do meio).
    if (handle.includes('w')) left = right - w;
    else if (handle.includes('e')) right = left + w;
    else {
      const cx = box.x + box.width / 2;
      left = cx - w / 2;
      right = cx + w / 2;
    }
    if (handle.includes('n')) top = bottom - h;
    else if (handle.includes('s')) bottom = top + h;
    else {
      const cy = box.y + box.height / 2;
      top = cy - h / 2;
      bottom = cy + h / 2;
    }
  }

  const result = normalizeBox({ x: left, y: top }, { x: right, y: bottom });
  return {
    ...result,
    width: Math.max(MIN_SIZE, result.width),
    height: Math.max(MIN_SIZE, result.height),
  };
}

/** Ângulo travado em múltiplos de 15° (Shift ao desenhar linhas e setas). */
export function snapAngle(origin: Point, p: Point, stepDeg = 15): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy);
  const step = (stepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(angle) * len, y: origin.y + Math.sin(angle) * len };
}
