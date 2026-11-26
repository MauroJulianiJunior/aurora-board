// Exportação: SVG (o mesmo desenho da tela, com as fontes embutidas) e PNG (o SVG rasterizado num
// canvas, em 1x a 3x). Tudo acontece no navegador; nenhum arquivo é enviado a lugar nenhum.
import { renderToStaticMarkup } from 'react-dom/server';
import { getCommonBounds } from '../model/geometry';
import { THEME_BACKGROUND, type Theme } from '../model/theme';
import { isBoxElement, type BoardElement, type Box, type FontFamily } from '../model/types';
import { ElementView } from '../render/ElementView';

export interface SceneSvg {
  markup: string;
  width: number;
  height: number;
}

export interface SceneOptions {
  background: boolean;
  padding?: number;
  /** CSS com @font-face embutido (ver fonts.ts). Vazio = usa as fontes instaladas de quem abrir. */
  fontCss?: string;
  /** Cores e fundo do tema (padrão: claro). */
  theme?: Theme;
}

export function fontsUsed(elements: readonly BoardElement[]): Set<FontFamily> {
  const used = new Set<FontFamily>();
  for (const el of elements) {
    if (isBoxElement(el) && el.text.trim().length > 0) used.add(el.fontFamily);
  }
  return used;
}

/** Área exportada: a caixa de todos os elementos, mais a espessura do traço e uma margem. */
export function exportBounds(elements: readonly BoardElement[], padding: number): Box | null {
  const bounds = getCommonBounds(elements);
  if (!bounds) return null;
  const stroke = elements.reduce((max, el) => Math.max(max, el.strokeWidth), 0);
  const pad = padding + stroke;
  return {
    x: Math.floor(bounds.x - pad),
    y: Math.floor(bounds.y - pad),
    width: Math.ceil(bounds.width + pad * 2),
    height: Math.ceil(bounds.height + pad * 2),
  };
}

export function renderSceneSvg(elements: readonly BoardElement[], options: SceneOptions): SceneSvg | null {
  const box = exportBounds(elements, options.padding ?? 32);
  if (!box) return null;
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={box.width}
      height={box.height}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
    >
      {options.fontCss ? (
        <defs>
          <style>{options.fontCss}</style>
        </defs>
      ) : null}
      {options.background ? (
        <rect x={box.x} y={box.y} width={box.width} height={box.height} fill={THEME_BACKGROUND[options.theme ?? 'light']} />
      ) : null}
      {elements.map((el) => (
        <ElementView key={el.id} element={el} forExport theme={options.theme ?? 'light'} />
      ))}
    </svg>
  );
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${renderToStaticMarkup(svg)}`;
  return { markup, width: box.width, height: box.height };
}

/** Escala que cabe no limite de canvas dos navegadores (lado ≤ 16 000 px, área ≤ 120 Mpx). */
export function safeScale(width: number, height: number, requested: number): number {
  const bySide = 16_000 / Math.max(width, height, 1);
  const byArea = Math.sqrt(120_000_000 / Math.max(width * height, 1));
  return Math.max(0.1, Math.min(requested, bySide, byArea));
}

export async function rasterizeSvg(scene: SceneSvg, scale: number): Promise<Blob> {
  const s = safeScale(scene.width, scene.height, scale);
  const blob = new Blob([scene.markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(scene.width * s));
    canvas.height = Math.max(1, Math.round(scene.height * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao gerar PNG'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
