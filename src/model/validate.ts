// Validação de dados que vêm de fora (arquivo importado, área de transferência, registro antigo do
// IndexedDB). Nada é confiado: tipos, números, cores, tamanhos e ligações são conferidos, e os ids
// são sempre trocados por novos na importação.
import { FILE_FORMAT, FILE_VERSION, LIMITS, DEFAULT_VIEWPORT } from './constants';
import { createId } from './elements';
import { refreshBindings } from './operations';
import { sanitizeText } from './text';
import {
  isBindable,
  type BoardElement,
  type FontFamily,
  type Point,
  type StrokeStyle,
  type Viewport,
} from './types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw']);
const FONT_FAMILIES = new Set<FontFamily>(['sans', 'display', 'mono']);
const STROKE_STYLES = new Set<StrokeStyle>(['solid', 'dashed']);

type Raw = Record<string, unknown>;

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(raw: Raw, key: string, where: string, min: number, max: number): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${where}: "${key}" precisa ser um número.`);
  }
  if (v < min || v > max) {
    throw new ValidationError(`${where}: "${key}" fora do intervalo permitido (${min} a ${max}).`);
  }
  return v;
}

function color(raw: Raw, key: string, where: string, allowTransparent: boolean): string {
  const v = raw[key];
  if (typeof v === 'string' && COLOR_RE.test(v)) return v.toLowerCase();
  if (allowTransparent && v === 'transparent') return 'transparent';
  throw new ValidationError(`${where}: cor inválida em "${key}" (use #rrggbb).`);
}

function text(raw: Raw, key: string, where: string): string {
  const v = raw[key] ?? '';
  if (typeof v !== 'string') throw new ValidationError(`${where}: "${key}" precisa ser texto.`);
  if (v.length > LIMITS.maxTextLength) {
    throw new ValidationError(`${where}: texto maior que ${LIMITS.maxTextLength} caracteres.`);
  }
  return sanitizeText(v, LIMITS.maxTextLength);
}

function point(v: unknown, where: string): Point {
  if (!isObject(v)) throw new ValidationError(`${where}: ponto inválido.`);
  const c = LIMITS.coordinate;
  return { x: num(v, 'x', where, -c, c), y: num(v, 'y', where, -c, c) };
}

function bindingId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : null;
}

/** Valida um elemento. Devolve o elemento limpo (só os campos conhecidos), com o id original. */
export function validateElement(value: unknown, index: number): BoardElement {
  const where = `Elemento ${index + 1}`;
  if (!isObject(value)) throw new ValidationError(`${where}: não é um objeto.`);
  const type = value.type;
  if (typeof type !== 'string' || !ELEMENT_TYPES.has(type)) {
    throw new ValidationError(`${where}: tipo desconhecido.`);
  }
  const rawId = value.id;
  const id = typeof rawId === 'string' && rawId.length > 0 && rawId.length <= 128 ? rawId : createId();
  const strokeStyle = value.strokeStyle ?? 'solid';
  if (typeof strokeStyle !== 'string' || !STROKE_STYLES.has(strokeStyle as StrokeStyle)) {
    throw new ValidationError(`${where}: estilo de traço inválido.`);
  }
  const base = {
    id,
    strokeColor: color(value, 'strokeColor', where, false),
    fillColor: color({ fillColor: value.fillColor ?? 'transparent' }, 'fillColor', where, true),
    strokeWidth: num(value, 'strokeWidth', where, LIMITS.minStrokeWidth, LIMITS.maxStrokeWidth),
    strokeStyle: strokeStyle as StrokeStyle,
  };
  const c = LIMITS.coordinate;

  if (type === 'rectangle' || type === 'ellipse' || type === 'diamond' || type === 'text') {
    const fontFamily = value.fontFamily ?? 'sans';
    if (typeof fontFamily !== 'string' || !FONT_FAMILIES.has(fontFamily as FontFamily)) {
      throw new ValidationError(`${where}: fonte inválida.`);
    }
    const box = {
      x: num(value, 'x', where, -c, c),
      y: num(value, 'y', where, -c, c),
      width: num(value, 'width', where, 0, c),
      height: num(value, 'height', where, 0, c),
    };
    const common = {
      ...base,
      ...box,
      text: text(value, 'text', where),
      fontFamily: fontFamily as FontFamily,
      fontSize: num(value, 'fontSize', where, LIMITS.minFontSize, LIMITS.maxFontSize),
    };
    if (type === 'text') return { ...common, type, fillColor: 'transparent' };
    return { ...common, type };
  }

  if (type === 'arrow' || type === 'line') {
    const pts = value.points;
    if (!Array.isArray(pts) || pts.length !== 2) {
      throw new ValidationError(`${where}: setas e linhas precisam de exatamente 2 pontos.`);
    }
    return {
      ...base,
      type,
      fillColor: 'transparent',
      points: [point(pts[0], where), point(pts[1], where)],
      startBinding: bindingId(value.startBinding),
      endBinding: bindingId(value.endBinding),
    };
  }

  const pts = value.points;
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > LIMITS.maxFreedrawPoints) {
    throw new ValidationError(`${where}: traço livre precisa de 1 a ${LIMITS.maxFreedrawPoints} pontos.`);
  }
  return { ...base, type: 'freedraw', fillColor: 'transparent', points: pts.map((p) => point(p, where)) };
}

/**
 * Valida uma lista de elementos e troca todos os ids por novos (sem colisão com o que já existe).
 * Ligações para elementos ausentes, ou que não aceitam ligação, são soltas.
 */
export function validateElements(value: unknown, where = 'Quadro'): BoardElement[] {
  if (!Array.isArray(value)) throw new ValidationError(`${where}: "elements" precisa ser uma lista.`);
  if (value.length > LIMITS.maxElementsPerBoard) {
    throw new ValidationError(`${where}: mais de ${LIMITS.maxElementsPerBoard} elementos.`);
  }
  const parsed = value.map((v, i) => validateElement(v, i));
  const idMap = new Map<string, string>();
  for (const el of parsed) idMap.set(el.id, createId());
  const bindable = new Set(parsed.filter(isBindable).map((el) => idMap.get(el.id)!));
  const remapped = parsed.map((el): BoardElement => {
    const id = idMap.get(el.id)!;
    if (el.type === 'arrow' || el.type === 'line') {
      const start = el.startBinding ? idMap.get(el.startBinding) : undefined;
      const end = el.endBinding ? idMap.get(el.endBinding) : undefined;
      return {
        ...el,
        id,
        startBinding: start && bindable.has(start) ? start : null,
        endBinding: end && bindable.has(end) && end !== start ? end : null,
      };
    }
    return { ...el, id };
  });
  return refreshBindings(remapped);
}

export function validateViewport(value: unknown): Viewport {
  if (!isObject(value)) return { ...DEFAULT_VIEWPORT };
  try {
    const c = LIMITS.coordinate;
    return {
      x: num(value, 'x', 'Vista', -c, c),
      y: num(value, 'y', 'Vista', -c, c),
      zoom: num(value, 'zoom', 'Vista', LIMITS.minZoom, LIMITS.maxZoom),
    };
  } catch {
    return { ...DEFAULT_VIEWPORT };
  }
}

/** Nome de quadro: aparado, sem caracteres de controle, 1 a 80 caracteres. */
export function validateBoardName(value: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'O nome precisa ser texto.' };
  const name = sanitizeText(value, 10_000).replace(/\s+/g, ' ').trim();
  if (name.length === 0) return { ok: false, error: 'Dê um nome ao quadro.' };
  if (name.length > LIMITS.maxNameLength) {
    return { ok: false, error: `Use no máximo ${LIMITS.maxNameLength} caracteres.` };
  }
  return { ok: true, name };
}

export interface ImportedBoard {
  name: string;
  elements: BoardElement[];
  viewport: Viewport;
}

export type ParseResult = { ok: true; boards: ImportedBoard[] } | { ok: false; error: string };

/** Lê o conteúdo de um arquivo .aurora.json (um quadro ou um backup com vários). */
export function parseBoardFile(content: string): ParseResult {
  if (content.length > LIMITS.maxFileBytes) {
    return { ok: false, error: 'Arquivo grande demais (limite de 25 MB).' };
  }
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  try {
    if (!isObject(data) || data.type !== FILE_FORMAT) {
      throw new ValidationError('Este arquivo não é um quadro do Aurora Board.');
    }
    if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
      throw new ValidationError('Versão do arquivo ausente ou inválida.');
    }
    if (data.version > FILE_VERSION) {
      throw new ValidationError(
        `O arquivo foi criado por uma versão mais nova do Aurora Board (formato ${data.version}).`,
      );
    }
    const boards = data.boards;
    if (!Array.isArray(boards) || boards.length === 0) {
      throw new ValidationError('O arquivo não contém nenhum quadro.');
    }
    if (boards.length > LIMITS.maxBoardsPerFile) {
      throw new ValidationError(`O arquivo tem mais de ${LIMITS.maxBoardsPerFile} quadros.`);
    }
    const result = boards.map((b, i): ImportedBoard => {
      const where = boards.length > 1 ? `Quadro ${i + 1}` : 'Quadro';
      if (!isObject(b)) throw new ValidationError(`${where}: formato inválido.`);
      const name = validateBoardName(b.name);
      return {
        name: name.ok ? name.name : 'Quadro importado',
        elements: validateElements(b.elements, where),
        viewport: validateViewport(b.viewport),
      };
    });
    return { ok: true, boards: result };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    return { ok: false, error: 'Não foi possível ler o arquivo.' };
  }
}
