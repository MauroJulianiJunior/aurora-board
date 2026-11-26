// Estado do editor de um quadro aberto. Reducer puro: o fluxo principal (criar, ligar, mover,
// desfazer) é testado sem navegador.
import { DEFAULT_STYLE, DEFAULT_VIEWPORT } from '../model/constants';
import { emptyHistory, recordHistory, redo, undo, type History } from '../model/history';
import type { Board, BoardElement, StyleState, Tool, Viewport } from '../model/types';

export interface TextEditing {
  id: string;
  /** Elementos antes da edição começar: é o ponto de volta do "desfazer". */
  before: BoardElement[];
}

export interface EditorState {
  board: Omit<Board, 'elements' | 'viewport'> | null;
  elements: BoardElement[];
  selectedIds: string[];
  tool: Tool;
  viewport: Viewport;
  style: StyleState;
  history: History;
  editing: TextEditing | null;
  /** Sobe a cada mudança que precisa ir para o IndexedDB (o salvamento automático observa isto). */
  revision: number;
}

export type EditorAction =
  | { type: 'load'; board: Board }
  | { type: 'setElements'; elements: BoardElement[]; record?: BoardElement[]; select?: string[] }
  | { type: 'record'; before: BoardElement[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'tool'; tool: Tool }
  | { type: 'viewport'; viewport: Viewport }
  | { type: 'style'; patch: Partial<StyleState> }
  | { type: 'startEditing'; editing: TextEditing }
  | { type: 'stopEditing' }
  | { type: 'rename'; name: string };

export const initialEditorState: EditorState = {
  board: null,
  elements: [],
  selectedIds: [],
  tool: 'select',
  viewport: { ...DEFAULT_VIEWPORT },
  style: { ...DEFAULT_STYLE },
  history: emptyHistory(),
  editing: null,
  revision: 0,
};

/** Duas listas com exatamente os mesmos objetos, na mesma ordem (nada mudou). */
export function sameElements(a: readonly BoardElement[], b: readonly BoardElement[]): boolean {
  return a.length === b.length && a.every((el, i) => el === b[i]);
}

function keepExisting(ids: string[], elements: BoardElement[]): string[] {
  if (ids.length === 0) return ids;
  const present = new Set(elements.map((el) => el.id));
  const kept = ids.filter((id) => present.has(id));
  return kept.length === ids.length ? ids : kept;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': {
      const { elements, viewport, ...board } = action.board;
      return {
        ...initialEditorState,
        style: state.style,
        board,
        elements,
        viewport,
        revision: 0,
      };
    }
    case 'setElements': {
      const history =
        action.record && !sameElements(action.record, action.elements)
          ? recordHistory(state.history, action.record)
          : state.history;
      return {
        ...state,
        elements: action.elements,
        history,
        selectedIds: keepExisting(action.select ?? state.selectedIds, action.elements),
        revision: state.revision + 1,
      };
    }
    case 'record':
      if (sameElements(action.before, state.elements)) return state;
      return { ...state, history: recordHistory(state.history, action.before) };
    case 'undo':
    case 'redo': {
      const result = action.type === 'undo' ? undo(state.history, state.elements) : redo(state.history, state.elements);
      if (!result) return state;
      return {
        ...state,
        elements: result.elements,
        history: result.history,
        selectedIds: keepExisting(state.selectedIds, result.elements),
        editing: null,
        revision: state.revision + 1,
      };
    }
    case 'select':
      return { ...state, selectedIds: keepExisting(action.ids, state.elements) };
    case 'tool':
      return {
        ...state,
        tool: action.tool,
        selectedIds: action.tool === 'select' ? state.selectedIds : [],
      };
    case 'viewport':
      return { ...state, viewport: action.viewport, revision: state.revision + 1 };
    case 'style':
      return { ...state, style: { ...state.style, ...action.patch } };
    case 'startEditing':
      return { ...state, editing: action.editing, selectedIds: [action.editing.id], tool: 'select' };
    case 'stopEditing':
      return { ...state, editing: null };
    case 'rename':
      if (!state.board) return state;
      return { ...state, board: { ...state.board, name: action.name }, revision: state.revision + 1 };
  }
}

/** O quadro como deve ser gravado agora. */
export function boardSnapshot(state: EditorState, now = Date.now()): Board | null {
  if (!state.board) return null;
  return { ...state.board, elements: state.elements, viewport: state.viewport, updatedAt: now };
}
