import { FILE_EXTENSION, FILE_FORMAT, FILE_VERSION, LIMITS } from './constants';
import { validateElements, ValidationError } from './validate';
import type { Board, BoardElement } from './types';

/** Arquivo .aurora.json: um quadro exportado ou um backup com todos. JSON legível, sem nada binário. */
export function serializeBoards(boards: readonly Board[], exportedAt = new Date()): string {
  return JSON.stringify(
    {
      type: FILE_FORMAT,
      version: FILE_VERSION,
      app: 'Aurora Board',
      exportedAt: exportedAt.toISOString(),
      boards: boards.map((b) => ({
        name: b.name,
        createdAt: new Date(b.createdAt).toISOString(),
        updatedAt: new Date(b.updatedAt).toISOString(),
        viewport: b.viewport,
        elements: b.elements,
      })),
    },
    null,
    2,
  );
}

/** Nome de arquivo seguro a partir do nome do quadro. */
export function fileNameFor(name: string, extension: string): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'quadro';
  return `${base}${extension}`;
}

export const boardFileName = (name: string) => fileNameFor(name, FILE_EXTENSION);

const CLIPBOARD_TYPE = 'aurora-board/clipboard';

export function serializeClipboard(elements: readonly BoardElement[]): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, version: FILE_VERSION, elements });
}

/**
 * Lê o que foi colado. Devolve elementos validados (ids novos), ou null se o texto não for uma
 * cópia do Aurora Board (aí o app cola como texto solto).
 */
export function parseClipboard(text: string): BoardElement[] | null {
  if (text.length > LIMITS.maxFileBytes || !text.trimStart().startsWith('{')) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return null;
    const record = data as Record<string, unknown>;
    if (record.type !== CLIPBOARD_TYPE) return null;
    return validateElements(record.elements, 'Área de transferência');
  } catch (err) {
    if (err instanceof ValidationError || err instanceof SyntaxError) return null;
    throw err;
  }
}
