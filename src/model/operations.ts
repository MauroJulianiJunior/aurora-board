// Operações puras sobre a lista de elementos. Nunca mutam: devolvem uma lista nova, reaproveitando
// os objetos que não mudaram (o React pula a renderização deles).
import { LIMITS } from './constants';
import { createId, createLinear } from './elements';
import { boundaryPoint, boxCenter } from './geometry';
import type { MeasureText } from './text';
import {
  isBindable,
  isBoxElement,
  isLinear,
  isText,
  type BindableElement,
  type BoardElement,
  type Box,
  type LinearElement,
  type Point,
  type StyleState,
} from './types';

function clampCoord(v: number): number {
  return Math.max(-LIMITS.coordinate, Math.min(LIMITS.coordinate, v));
}

function clampFont(v: number): number {
  return Math.max(LIMITS.minFontSize, Math.min(LIMITS.maxFontSize, Math.round(v * 10) / 10));
}

export function translateElement<T extends BoardElement>(el: T, dx: number, dy: number): T {
  if (isBoxElement(el)) return { ...el, x: clampCoord(el.x + dx), y: clampCoord(el.y + dy) };
  if (isLinear(el)) {
    return {
      ...el,
      points: el.points.map((p) => ({ x: clampCoord(p.x + dx), y: clampCoord(p.y + dy) })) as [Point, Point],
    };
  }
  return { ...el, points: el.points.map((p) => ({ x: clampCoord(p.x + dx), y: clampCoord(p.y + dy) })) };
}

/** Posição das pontas de uma seta ligada: cada ponta encosta na borda da forma, mirando a outra ponta. */
export function computeBoundPoints(
  arrow: LinearElement,
  byId: ReadonlyMap<string, BoardElement>,
): LinearElement {
  const startTarget = arrow.startBinding ? byId.get(arrow.startBinding) : undefined;
  const endTarget = arrow.endBinding ? byId.get(arrow.endBinding) : undefined;
  const startEl: BindableElement | undefined = startTarget && isBindable(startTarget) ? startTarget : undefined;
  const endEl: BindableElement | undefined = endTarget && isBindable(endTarget) ? endTarget : undefined;

  const startBinding = startEl ? startEl.id : null;
  const endBinding = endEl ? endEl.id : null;
  if (!startEl && !endEl) {
    return arrow.startBinding === null && arrow.endBinding === null
      ? arrow
      : { ...arrow, startBinding: null, endBinding: null };
  }

  const [rawStart, rawEnd] = arrow.points;
  const startToward = endEl ? boxCenter(endEl) : rawEnd;
  const endToward = startEl ? boxCenter(startEl) : rawStart;
  const start = startEl ? boundaryPoint(startEl, startToward) : rawStart;
  const end = endEl ? boundaryPoint(endEl, endToward) : rawEnd;
  return { ...arrow, points: [start, end], startBinding, endBinding };
}

/**
 * Recalcula as pontas das setas ligadas. Com `changedIds`, só as setas ligadas a esses elementos
 * (ou que estão entre eles); sem, todas.
 */
export function refreshBindings(
  elements: readonly BoardElement[],
  changedIds?: ReadonlySet<string>,
): BoardElement[] {
  const byId = new Map(elements.map((el) => [el.id, el] as const));
  return elements.map((el) => {
    if (!isLinear(el) || (el.startBinding === null && el.endBinding === null)) return el;
    if (
      changedIds &&
      !changedIds.has(el.id) &&
      !(el.startBinding && changedIds.has(el.startBinding)) &&
      !(el.endBinding && changedIds.has(el.endBinding))
    ) {
      return el;
    }
    return computeBoundPoints(el, byId);
  });
}

/**
 * Move os elementos. Uma seta arrastada sozinha se solta das formas; arrastada junto com elas,
 * continua ligada. Setas ligadas a formas movidas acompanham.
 */
export function moveElements(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  dx: number,
  dy: number,
): BoardElement[] {
  const idSet = new Set(ids);
  if (idSet.size === 0 || (dx === 0 && dy === 0)) return [...elements];
  const moved = elements.map((el) => {
    if (!idSet.has(el.id)) return el;
    const t = translateElement(el, dx, dy);
    if (isLinear(t)) {
      return {
        ...t,
        startBinding: t.startBinding && idSet.has(t.startBinding) ? t.startBinding : null,
        endBinding: t.endBinding && idSet.has(t.endBinding) ? t.endBinding : null,
      };
    }
    return t;
  });
  return refreshBindings(moved, idSet);
}

function mapPoint(p: Point, from: Box, to: Box): Point {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return { x: clampCoord(to.x + (p.x - from.x) * sx), y: clampCoord(to.y + (p.y - from.y) * sy) };
}

/** Redimensiona os elementos levando a caixa `from` para `to` (uma alça arrastada). */
export function scaleElements(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  from: Box,
  to: Box,
  measure: MeasureText,
): BoardElement[] {
  const idSet = new Set(ids);
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  const scaled = elements.map((el): BoardElement => {
    if (!idSet.has(el.id)) return el;
    if (isText(el)) {
      const fontSize = clampFont(el.fontSize * Math.min(sx, sy));
      const topLeft = mapPoint(el, from, to);
      const size = measure(el.text, el.fontFamily, fontSize);
      return { ...el, ...topLeft, fontSize, width: size.width, height: size.height };
    }
    if (isBoxElement(el)) {
      const topLeft = mapPoint(el, from, to);
      return {
        ...el,
        ...topLeft,
        width: Math.max(1, el.width * sx),
        height: Math.max(1, el.height * sy),
      };
    }
    if (isLinear(el)) {
      return { ...el, points: [mapPoint(el.points[0], from, to), mapPoint(el.points[1], from, to)] };
    }
    return { ...el, points: el.points.map((p) => mapPoint(p, from, to)) };
  });
  return refreshBindings(scaled, idSet);
}

/** Remove os elementos e solta as setas que estavam ligadas a eles (as setas ficam onde estão). */
export function deleteElements(elements: readonly BoardElement[], ids: Iterable<string>): BoardElement[] {
  const idSet = new Set(ids);
  if (idSet.size === 0) return [...elements];
  return elements
    .filter((el) => !idSet.has(el.id))
    .map((el) => {
      if (!isLinear(el)) return el;
      const start = el.startBinding && idSet.has(el.startBinding) ? null : el.startBinding;
      const end = el.endBinding && idSet.has(el.endBinding) ? null : el.endBinding;
      return start === el.startBinding && end === el.endBinding
        ? el
        : { ...el, startBinding: start, endBinding: end };
    });
}

/**
 * Cópias com ids novos, deslocadas. Ligações entre elementos copiados juntos são preservadas;
 * ligações com elementos que ficaram de fora são soltas.
 */
export function cloneElements(
  source: readonly BoardElement[],
  offset: Point,
): { clones: BoardElement[]; idMap: Map<string, string> } {
  const idMap = new Map(source.map((el) => [el.id, createId()] as const));
  const clones = source.map((el): BoardElement => {
    const moved = translateElement(el, offset.x, offset.y);
    const id = idMap.get(el.id)!;
    if (isLinear(moved)) {
      return {
        ...moved,
        id,
        startBinding: moved.startBinding ? (idMap.get(moved.startBinding) ?? null) : null,
        endBinding: moved.endBinding ? (idMap.get(moved.endBinding) ?? null) : null,
      };
    }
    return { ...moved, id };
  });
  return { clones: refreshBindings(clones), idMap };
}

export function duplicateElements(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  offset: Point = { x: 24, y: 24 },
): { elements: BoardElement[]; newIds: string[] } {
  const idSet = new Set(ids);
  const source = elements.filter((el) => idSet.has(el.id));
  const { clones } = cloneElements(source, offset);
  return { elements: [...elements, ...clones], newIds: clones.map((el) => el.id) };
}

/** Cola elementos (de outra aba ou quadro) com ids novos. */
export function pasteElements(
  elements: readonly BoardElement[],
  incoming: readonly BoardElement[],
  offset: Point,
): { elements: BoardElement[]; newIds: string[] } {
  const { clones } = cloneElements(incoming, offset);
  return { elements: [...elements, ...clones], newIds: clones.map((el) => el.id) };
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export function reorderElements(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  direction: ReorderDirection,
): BoardElement[] {
  const idSet = new Set(ids);
  const list = [...elements];
  if (direction === 'front') {
    return [...list.filter((el) => !idSet.has(el.id)), ...list.filter((el) => idSet.has(el.id))];
  }
  if (direction === 'back') {
    return [...list.filter((el) => idSet.has(el.id)), ...list.filter((el) => !idSet.has(el.id))];
  }
  if (direction === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) {
      if (idSet.has(list[i]!.id) && !idSet.has(list[i + 1]!.id)) {
        [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
      }
    }
    return list;
  }
  for (let i = 1; i < list.length; i++) {
    if (idSet.has(list[i]!.id) && !idSet.has(list[i - 1]!.id)) {
      [list[i], list[i - 1]] = [list[i - 1]!, list[i]!];
    }
  }
  return list;
}

/** Aplica um estilo à seleção; cada tipo só recebe as propriedades que fazem sentido para ele. */
export function applyStyle(
  elements: readonly BoardElement[],
  ids: Iterable<string>,
  patch: Partial<StyleState>,
  measure: MeasureText,
): BoardElement[] {
  const idSet = new Set(ids);
  return elements.map((el): BoardElement => {
    if (!idSet.has(el.id)) return el;
    let next: BoardElement = el;
    if (patch.strokeColor !== undefined) next = { ...next, strokeColor: patch.strokeColor };
    if (!isText(next)) {
      if (patch.strokeWidth !== undefined) next = { ...next, strokeWidth: patch.strokeWidth };
      if (patch.strokeStyle !== undefined) next = { ...next, strokeStyle: patch.strokeStyle };
    }
    if (isBoxElement(next) && !isText(next) && patch.fillColor !== undefined) {
      next = { ...next, fillColor: patch.fillColor };
    }
    if (isBoxElement(next) && (patch.fontFamily !== undefined || patch.fontSize !== undefined)) {
      next = {
        ...next,
        fontFamily: patch.fontFamily ?? next.fontFamily,
        fontSize: patch.fontSize ?? next.fontSize,
      };
      if (isText(next)) {
        const size = measure(next.text, next.fontFamily, next.fontSize);
        next = { ...next, width: size.width, height: size.height };
      }
    }
    return next;
  });
}

/**
 * Troca o texto de um texto solto ou o rótulo de uma forma. Ao concluir a edição (`removeEmpty`),
 * texto solto que ficou vazio é removido, como num editor de slides.
 */
export function setElementText(
  elements: readonly BoardElement[],
  id: string,
  text: string,
  measure: MeasureText,
  { removeEmpty = true }: { removeEmpty?: boolean } = {},
): BoardElement[] {
  const target = elements.find((el) => el.id === id);
  if (!target || !isBoxElement(target)) return [...elements];
  if (removeEmpty && isText(target) && text.trim() === '') return deleteElements(elements, [id]);
  if (target.text === text) return [...elements];
  const updated = elements.map((el): BoardElement => {
    if (el.id !== id || !isBoxElement(el)) return el;
    if (isText(el)) {
      const size = measure(text, el.fontFamily, el.fontSize);
      return { ...el, text, width: size.width, height: size.height };
    }
    return { ...el, text };
  });
  return refreshBindings(updated, new Set([id]));
}

/** Cria uma seta ligando duas formas (botão "Conectar" com duas formas selecionadas). */
export function connectElements(
  elements: readonly BoardElement[],
  fromId: string,
  toId: string,
  style: StyleState,
): { elements: BoardElement[]; arrowId: string | null } {
  const from = elements.find((el) => el.id === fromId);
  const to = elements.find((el) => el.id === toId);
  if (!from || !to || fromId === toId || !isBindable(from) || !isBindable(to)) {
    return { elements: [...elements], arrowId: null };
  }
  const arrow: LinearElement = {
    ...createLinear('arrow', boxCenter(from), boxCenter(to), style),
    startBinding: from.id,
    endBinding: to.id,
  };
  const byId = new Map(elements.map((el) => [el.id, el] as const));
  return { elements: [...elements, computeBoundPoints(arrow, byId)], arrowId: arrow.id };
}

export function selectedElements(elements: readonly BoardElement[], ids: ReadonlySet<string>): BoardElement[] {
  return elements.filter((el) => ids.has(el.id));
}
