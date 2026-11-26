// Persistência local. Os quadros ficam no IndexedDB do navegador (banco "aurora-board"), nesta
// máquina e neste perfil do navegador. Nada sai daqui: não há servidor, conta nem sincronização.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_VIEWPORT } from '../model/constants';
import { validateElement, validateViewport } from '../model/validate';
import type { Board, BoardElement, BoardSummary, Viewport } from '../model/types';

export const DB_NAME = 'aurora-board';
export const DB_VERSION = 1;

interface BoardMeta extends BoardSummary {
  viewport: Viewport;
}

interface BoardContent {
  boardId: string;
  elements: BoardElement[];
}

interface Setting {
  key: string;
  value: unknown;
}

interface AuroraBoardDB extends DBSchema {
  boards: { key: string; value: BoardMeta; indexes: { updatedAt: number } };
  contents: { key: string; value: BoardContent };
  settings: { key: string; value: Setting };
}

export interface BoardRepository {
  readonly kind: 'indexeddb' | 'memory';
  /** Mais recentes primeiro. */
  listBoards(): Promise<BoardSummary[]>;
  getBoard(id: string): Promise<Board | null>;
  saveBoard(board: Board): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown): Promise<void>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly reason: 'unavailable' | 'quota' | 'blocked' | 'unknown',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Mensagem para a pessoa usuária. Não inclui conteúdo do quadro nem detalhes internos. */
export function describeStorageError(err: unknown): string {
  if (err instanceof StorageError) return err.message;
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Sem espaço no navegador para salvar. Exporte um backup e apague quadros antigos.';
  }
  return 'Não foi possível salvar no navegador.';
}

function toSummary(meta: BoardMeta): BoardSummary {
  return {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    elementCount: meta.elementCount,
    isSample: meta.isSample,
  };
}

/** Elementos gravados por versões antigas ou corrompidos são descartados um a um, sem derrubar o quadro. */
function sanitizeStoredElements(value: unknown): BoardElement[] {
  if (!Array.isArray(value)) return [];
  const out: BoardElement[] = [];
  value.forEach((raw, i) => {
    try {
      out.push(validateElement(raw, i));
    } catch {
      /* descartado */
    }
  });
  return out;
}

function toBoard(meta: BoardMeta, content: BoardContent | undefined): Board {
  return {
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    isSample: Boolean(meta.isSample),
    viewport: validateViewport(meta.viewport),
    elements: sanitizeStoredElements(content?.elements),
  };
}

function toMeta(board: Board): BoardMeta {
  return {
    id: board.id,
    name: board.name,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    elementCount: board.elements.length,
    isSample: board.isSample,
    viewport: board.viewport ?? { ...DEFAULT_VIEWPORT },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

class IndexedDbRepository implements BoardRepository {
  readonly kind = 'indexeddb' as const;
  constructor(private readonly db: IDBPDatabase<AuroraBoardDB>) {}

  async listBoards(): Promise<BoardSummary[]> {
    const metas = await this.db.getAll('boards');
    return metas.map(toSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getBoard(id: string): Promise<Board | null> {
    const tx = this.db.transaction(['boards', 'contents'], 'readonly');
    const [meta, content] = await Promise.all([tx.objectStore('boards').get(id), tx.objectStore('contents').get(id)]);
    await tx.done;
    return meta ? toBoard(meta, content) : null;
  }

  async saveBoard(board: Board): Promise<void> {
    const tx = this.db.transaction(['boards', 'contents'], 'readwrite');
    await Promise.all([
      tx.objectStore('boards').put(toMeta(board)),
      tx.objectStore('contents').put({ boardId: board.id, elements: board.elements }),
    ]);
    await tx.done;
  }

  async deleteBoard(id: string): Promise<void> {
    const tx = this.db.transaction(['boards', 'contents'], 'readwrite');
    await Promise.all([tx.objectStore('boards').delete(id), tx.objectStore('contents').delete(id)]);
    await tx.done;
  }

  async getSetting(key: string): Promise<unknown> {
    return (await this.db.get('settings', key))?.value;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.put('settings', { key, value });
  }
}

export async function openIndexedDbRepository(): Promise<BoardRepository> {
  if (typeof indexedDB === 'undefined') {
    throw new StorageError('Este navegador não oferece armazenamento local (IndexedDB).', 'unavailable');
  }
  let database: IDBPDatabase<AuroraBoardDB> | undefined;
  try {
    database = await withTimeout(
      openDB<AuroraBoardDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const boards = db.createObjectStore('boards', { keyPath: 'id' });
          boards.createIndex('updatedAt', 'updatedAt');
          db.createObjectStore('contents', { keyPath: 'boardId' });
          db.createObjectStore('settings', { keyPath: 'key' });
        },
        blocking() {
          // Outra aba abriu uma versão mais nova do banco: soltamos esta conexão.
          database?.close();
        },
      }),
      8000,
      () => new StorageError('O armazenamento local não respondeu. Feche outras abas do Aurora Board.', 'blocked'),
    );
    return new IndexedDbRepository(database);
  } catch (err) {
    if (err instanceof StorageError) throw err;
    throw new StorageError(
      'O navegador bloqueou o armazenamento local (modo privativo ou permissão de sites?).',
      'unavailable',
    );
  }
}

/** Modo degradado: tudo em memória, perdido ao fechar a aba. Usado quando o IndexedDB falha. */
export function createMemoryRepository(): BoardRepository {
  const boards = new Map<string, Board>();
  const settings = new Map<string, unknown>();
  return {
    kind: 'memory',
    async listBoards() {
      return [...boards.values()]
        .map((b) => toSummary(toMeta(b)))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getBoard(id) {
      const b = boards.get(id);
      return b ? structuredClone(b) : null;
    },
    async saveBoard(board) {
      boards.set(board.id, structuredClone(board));
    },
    async deleteBoard(id) {
      boards.delete(id);
    },
    async getSetting(key) {
      return settings.get(key);
    },
    async setSetting(key, value) {
      settings.set(key, value);
    },
  };
}
