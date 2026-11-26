// Mapa de atalhos de teclado. Função pura (testável): recebe a tecla e devolve um comando.
import type { Tool } from '../model/types';

export type Command =
  | { type: 'tool'; tool: Tool }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'delete' }
  | { type: 'selectAll' }
  | { type: 'duplicate' }
  | { type: 'escape' }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' }
  | { type: 'zoomReset' }
  | { type: 'zoomFit' }
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'reorder'; direction: 'forward' | 'backward' | 'front' | 'back' }
  | { type: 'toggleGrid' }
  | { type: 'toggleFocusMode' }
  | { type: 'toggleTheme' }
  | { type: 'help' }
  | { type: 'save' }
  | { type: 'export' }
  | { type: 'editText' };

export interface KeyInput {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  '1': 'select',
  h: 'hand',
  r: 'rectangle',
  '2': 'rectangle',
  o: 'ellipse',
  '3': 'ellipse',
  d: 'diamond',
  '4': 'diamond',
  a: 'arrow',
  '5': 'arrow',
  l: 'line',
  '6': 'line',
  p: 'freedraw',
  '7': 'freedraw',
  t: 'text',
  '8': 'text',
  e: 'eraser',
  '9': 'eraser',
};

/** Atalhos exibidos na ajuda e nas dicas dos botões. */
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: 'V ou 1',
  hand: 'H (ou segure Espaço)',
  rectangle: 'R ou 2',
  ellipse: 'O ou 3',
  diamond: 'D ou 4',
  arrow: 'A ou 5',
  line: 'L ou 6',
  freedraw: 'P ou 7',
  text: 'T ou 8',
  eraser: 'E ou 9',
};

export function resolveShortcut(e: KeyInput): Command | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod) {
    if (key === 'z' && e.shiftKey) return { type: 'redo' };
    if (key === 'z') return { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (key === 'a') return { type: 'selectAll' };
    if (key === 'd') return { type: 'duplicate' };
    if (key === 's') return { type: 'save' };
    if (key === 'e' && e.shiftKey) return { type: 'export' };
    if (key === '=' || key === '+') return { type: 'zoomIn' };
    if (key === '-' || key === '_') return { type: 'zoomOut' };
    if (key === '0') return { type: 'zoomReset' };
    if (e.code === 'BracketRight' || key === ']' || key === '}') {
      return { type: 'reorder', direction: e.shiftKey ? 'front' : 'forward' };
    }
    if (e.code === 'BracketLeft' || key === '[' || key === '{') {
      return { type: 'reorder', direction: e.shiftKey ? 'back' : 'backward' };
    }
    return null;
  }

  if (e.altKey) {
    if (e.shiftKey && (key === 'd' || e.code === 'KeyD')) return { type: 'toggleTheme' };
    if (key === 'z' || e.code === 'KeyZ') return { type: 'toggleFocusMode' };
    return null;
  }

  if (key === 'Delete' || key === 'Backspace') return { type: 'delete' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === 'Enter') return { type: 'editText' };
  if (key === '?' || (e.shiftKey && e.code === 'Slash')) return { type: 'help' };
  if (key === '!' || (e.shiftKey && key === '1')) return { type: 'zoomFit' };

  const step = e.shiftKey ? 10 : 1;
  if (key === 'ArrowLeft') return { type: 'nudge', dx: -step, dy: 0 };
  if (key === 'ArrowRight') return { type: 'nudge', dx: step, dy: 0 };
  if (key === 'ArrowUp') return { type: 'nudge', dx: 0, dy: -step };
  if (key === 'ArrowDown') return { type: 'nudge', dx: 0, dy: step };

  if (e.shiftKey) return null;
  if (key === 'g') return { type: 'toggleGrid' };
  const tool = TOOL_KEYS[key];
  return tool ? { type: 'tool', tool } : null;
}

/** Foco num campo de texto: os atalhos de uma tecla não podem roubar a digitação. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset'].includes(type);
}
