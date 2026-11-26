import type { BoardElement } from './types';

/** Desfazer/refazer por fotografias da lista de elementos (os objetos são imutáveis e compartilhados). */
export interface History {
  past: BoardElement[][];
  future: BoardElement[][];
}

export const HISTORY_LIMIT = 200;

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Registra o estado `before` (o anterior à mudança). Uma mudança nova apaga o "refazer". */
export function recordHistory(history: History, before: BoardElement[]): History {
  const past = [...history.past, before];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export function undo(
  history: History,
  current: BoardElement[],
): { history: History; elements: BoardElement[] } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    elements: previous,
  };
}

export function redo(
  history: History,
  current: BoardElement[],
): { history: History; elements: BoardElement[] } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    elements: next,
  };
}
