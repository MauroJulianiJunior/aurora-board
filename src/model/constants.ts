import type { FontFamily, StyleState, Viewport } from './types';

/** Versão do formato de arquivo .aurora.json (e do registro no IndexedDB). */
export const FILE_FORMAT = 'aurora-board';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.aurora.json';

// Limites de validação: protegem o app contra arquivos importados malformados ou gigantes.
export const LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxBoardsPerFile: 500,
  maxElementsPerBoard: 20_000,
  maxTextLength: 5_000,
  maxFreedrawPoints: 5_000,
  maxNameLength: 80,
  coordinate: 1_000_000,
  minFontSize: 8,
  maxFontSize: 400,
  minStrokeWidth: 0.5,
  maxStrokeWidth: 32,
  minZoom: 0.1,
  maxZoom: 5,
} as const;

/**
 * Cores de traço e texto. Todas com contraste ≥ 4,5:1 sobre branco e ≥ 4,2:1 sobre o papel. No tema
 * escuro cada uma é desenhada com a sua versão clara (model/theme.ts).
 */
export const STROKE_COLORS = [
  { value: '#1f2723', label: 'Tinta (escura no tema claro, clara no escuro)' },
  { value: '#087f45', label: 'Verde' },
  { value: '#1d63b8', label: 'Azul' },
  { value: '#c62828', label: 'Vermelho' },
  { value: '#b35600', label: 'Laranja' },
  { value: '#6e45c4', label: 'Roxo' },
  { value: '#5b6962', label: 'Cinza' },
] as const;

/** Preenchimentos: tons suaves do design system + o verde Aurora para destaque. */
export const FILL_COLORS = [
  { value: 'transparent', label: 'Sem preenchimento' },
  { value: '#ffffff', label: 'Cartão (branco no tema claro, cinza no escuro)' },
  { value: '#dcede2', label: 'Verde suave' },
  { value: '#d9e7f2', label: 'Azul suave' },
  { value: '#f8efc4', label: 'Amarelo suave' },
  { value: '#f7e1dd', label: 'Rosa suave' },
  { value: '#e9e5f6', label: 'Lilás suave' },
  { value: '#00e676', label: 'Verde Aurora' },
] as const;

export const STROKE_WIDTHS = [
  { value: 2, label: 'Fina' },
  { value: 4, label: 'Média' },
  { value: 8, label: 'Grossa' },
] as const;

export const FONT_SIZES = [
  { value: 20, label: 'P', name: 'Pequeno' },
  { value: 28, label: 'M', name: 'Médio' },
  { value: 40, label: 'G', name: 'Grande' },
  { value: 64, label: 'XG', name: 'Extra grande' },
] as const;

export const FONT_FAMILIES: ReadonlyArray<{ value: FontFamily; label: string }> = [
  { value: 'sans', label: 'Normal' },
  { value: 'display', label: 'Título' },
  { value: 'mono', label: 'Código' },
];

/** Padrões pensados para projeção em sala: traço médio e letra grande. */
export const DEFAULT_STYLE: StyleState = {
  strokeColor: '#1f2723',
  fillColor: 'transparent',
  strokeWidth: 4,
  strokeStyle: 'solid',
  fontFamily: 'sans',
  fontSize: 28,
};

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

/** Tamanho de uma forma criada com um clique (sem arrastar) ou pelo teclado. */
export const DEFAULT_SHAPE_SIZE = { width: 200, height: 120 } as const;

/** Distância entre a ponta da seta e a borda da forma ligada. */
export const BINDING_GAP = 6;
