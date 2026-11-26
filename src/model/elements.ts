import { DEFAULT_SHAPE_SIZE } from './constants';
import type { MeasureText } from './text';
import type {
  Box,
  FreedrawElement,
  LinearElement,
  LinearType,
  Point,
  ShapeElement,
  ShapeType,
  StyleState,
  TextElement,
} from './types';

export function createId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Alternativa para ambientes sem randomUUID (não precisa ser criptográfico: é só identificador).
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function baseStyle(style: StyleState) {
  return {
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
  };
}

export function createShape(type: ShapeType, box: Box, style: StyleState, text = ''): ShapeElement {
  return {
    id: createId(),
    type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    text,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    ...baseStyle(style),
  };
}

/** Forma de tamanho padrão centralizada no ponto (clique sem arrastar, ou criação pelo teclado). */
export function createShapeAt(type: ShapeType, center: Point, style: StyleState, text = ''): ShapeElement {
  const { width, height } = DEFAULT_SHAPE_SIZE;
  const size = type === 'diamond' ? { width: width * 1.1, height: height * 1.3 } : { width, height };
  return createShape(
    type,
    { x: center.x - size.width / 2, y: center.y - size.height / 2, ...size },
    style,
    text,
  );
}

export function createText(at: Point, text: string, style: StyleState, measure: MeasureText): TextElement {
  const size = measure(text, style.fontFamily, style.fontSize);
  return {
    id: createId(),
    type: 'text',
    x: at.x,
    y: at.y,
    width: size.width,
    height: size.height,
    text,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    ...baseStyle(style),
    fillColor: 'transparent',
  };
}

export function createLinear(type: LinearType, start: Point, end: Point, style: StyleState): LinearElement {
  return {
    id: createId(),
    type,
    points: [{ ...start }, { ...end }],
    startBinding: null,
    endBinding: null,
    ...baseStyle(style),
    fillColor: 'transparent',
  };
}

export function createFreedraw(points: Point[], style: StyleState): FreedrawElement {
  return {
    id: createId(),
    type: 'freedraw',
    points: points.map((p) => ({ ...p })),
    ...baseStyle(style),
    fillColor: 'transparent',
  };
}

/** Nome legível de um elemento (anúncios do leitor de tela e rótulos). */
export function describeElement(el: { type: string; text?: string }): string {
  const names: Record<string, string> = {
    rectangle: 'Retângulo',
    ellipse: 'Elipse',
    diamond: 'Losango',
    arrow: 'Seta',
    line: 'Linha',
    freedraw: 'Desenho livre',
    text: 'Texto',
  };
  const name = names[el.type] ?? 'Elemento';
  const text = el.text?.trim();
  if (!text) return name;
  const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `${name} “${short.replace(/\s+/g, ' ')}”`;
}
