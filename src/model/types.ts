// Modelo de dados da lousa. Tudo é serializável em JSON (é o que vai para o IndexedDB e para o
// arquivo exportado). Coordenadas em "unidades de mundo": 1 unidade = 1 px com zoom 100%.

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond';
export type LinearType = 'arrow' | 'line';
export type ElementType = ShapeType | LinearType | 'text' | 'freedraw';

export type StrokeStyle = 'solid' | 'dashed';
/** sans = Inter, display = Space Grotesk, mono = IBM Plex Mono (as fontes do design system Aurora). */
export type FontFamily = 'sans' | 'display' | 'mono';

interface ElementBase {
  id: string;
  strokeColor: string;
  /** '#rrggbb' ou 'transparent'. */
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
}

/** Retângulo, elipse ou losango, com rótulo opcional centralizado. */
export interface ShapeElement extends ElementBase {
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: FontFamily;
  fontSize: number;
}

/** Texto solto. width/height são medidos a partir do texto e da fonte. */
export interface TextElement extends ElementBase {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: FontFamily;
  fontSize: number;
}

/**
 * Seta ou linha reta entre dois pontos (coordenadas absolutas).
 * Uma ponta pode estar "ligada" a uma forma: quando a forma se move, a ponta acompanha.
 */
export interface LinearElement extends ElementBase {
  type: LinearType;
  points: [Point, Point];
  startBinding: string | null;
  endBinding: string | null;
}

/** Traço livre da caneta (coordenadas absolutas). */
export interface FreedrawElement extends ElementBase {
  type: 'freedraw';
  points: Point[];
}

export type BoardElement = ShapeElement | TextElement | LinearElement | FreedrawElement;
export type BindableElement = ShapeElement | TextElement;
export type BoxElement = ShapeElement | TextElement;

/** Canto superior esquerdo da tela, em coordenadas de mundo, e o zoom (1 = 100%). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elements: BoardElement[];
  viewport: Viewport;
  /** Quadro de exemplo criado pelo app (marcado na lista, pode ser apagado sem perda). */
  isSample: boolean;
}

export interface BoardSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  elementCount: number;
  isSample: boolean;
}

/** Estilo aplicado aos próximos elementos criados (e à seleção, quando alterado no painel). */
export interface StyleState {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  fontFamily: FontFamily;
  fontSize: number;
}

export type Tool =
  | 'select'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'eraser';

export function isShape(el: BoardElement): el is ShapeElement {
  return el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond';
}

export function isLinear(el: BoardElement): el is LinearElement {
  return el.type === 'arrow' || el.type === 'line';
}

export function isText(el: BoardElement): el is TextElement {
  return el.type === 'text';
}

export function isBoxElement(el: BoardElement): el is BoxElement {
  return isShape(el) || isText(el);
}

/** Só formas e textos recebem pontas de seta ligadas. */
export function isBindable(el: BoardElement): el is BindableElement {
  return isBoxElement(el);
}

export function hasText(el: BoardElement): el is ShapeElement | TextElement {
  return isBoxElement(el);
}
