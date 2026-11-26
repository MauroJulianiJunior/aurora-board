import type { FontFamily } from './types';

export const LINE_HEIGHT = 1.25;

export const FONT_STACKS: Record<FontFamily, string> = {
  sans: "Inter, 'Segoe UI', Arial, sans-serif",
  display: "'Space Grotesk', 'Segoe UI', Arial, sans-serif",
  mono: "'IBM Plex Mono', Consolas, 'Courier New', monospace",
};

/** Pesos usados na lousa (um por família; são os embutidos no SVG/PNG exportado). */
export const FONT_WEIGHTS: Record<FontFamily, number> = {
  sans: 500,
  display: 700,
  mono: 500,
};

export interface TextSize {
  width: number;
  height: number;
}

export type MeasureText = (text: string, fontFamily: FontFamily, fontSize: number) => TextSize;

export function splitLines(text: string): string[] {
  return text.split('\n');
}

export function textHeight(text: string, fontSize: number): number {
  return splitLines(text).length * fontSize * LINE_HEIGHT;
}

/** Medida aproximada e determinística (testes, ou quando não há canvas disponível). */
export const estimateTextSize: MeasureText = (text, fontFamily, fontSize) => {
  const perChar = fontFamily === 'mono' ? 0.6 : 0.56;
  const longest = splitLines(text).reduce((max, line) => Math.max(max, [...line].length), 0);
  return {
    width: Math.max(fontSize * 0.5, longest * fontSize * perChar),
    height: textHeight(text, fontSize),
  };
};

/** Mede com o canvas do navegador, com as fontes reais (carregadas antes de abrir o quadro). */
export function createCanvasMeasure(): MeasureText {
  if (typeof document === 'undefined') return estimateTextSize;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return estimateTextSize;
  return (text, fontFamily, fontSize) => {
    ctx.font = `${FONT_WEIGHTS[fontFamily]} ${fontSize}px ${FONT_STACKS[fontFamily]}`;
    const widest = splitLines(text).reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    return {
      width: Math.max(fontSize * 0.5, Math.ceil(widest)),
      height: textHeight(text, fontSize),
    };
  };
}

/** Remove caracteres de controle (menos quebra de linha e tab) e normaliza quebras. */
export function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}
