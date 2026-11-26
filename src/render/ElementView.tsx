// Desenho de cada elemento em SVG. É o mesmo componente na tela e na exportação (SVG/PNG), então o
// arquivo exportado sai igual ao que se vê.
import { memo } from 'react';
import { diamondPoints, distance } from '../model/geometry';
import { FONT_STACKS, FONT_WEIGHTS, LINE_HEIGHT, splitLines } from '../model/text';
import { labelColor, themeColor, type Theme } from '../model/theme';
import type { BoardElement, FontFamily, Point, StrokeStyle } from '../model/types';

const r = (v: number) => Math.round(v * 100) / 100;

export function dashArray(style: StrokeStyle, width: number): string | undefined {
  if (style !== 'dashed') return undefined;
  return `${r(Math.max(6, width * 2.5))} ${r(Math.max(5, width * 2))}`;
}

/** Curva suave pelos pontos médios (traço da caneta). */
export function freedrawPath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M${r(first.x)} ${r(first.y)}l0.01 0`;
  if (points.length === 2) {
    const last = points[1]!;
    return `M${r(first.x)} ${r(first.y)}L${r(last.x)} ${r(last.y)}`;
  }
  let d = `M${r(first.x)} ${r(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const n = points[i + 1]!;
    d += `Q${r(p.x)} ${r(p.y)} ${r((p.x + n.x) / 2)} ${r((p.y + n.y) / 2)}`;
  }
  const last = points[points.length - 1]!;
  return `${d}L${r(last.x)} ${r(last.y)}`;
}

/** Haste e cabeça (triângulo cheio) da seta. A haste termina antes da ponta, para a ponta sair fina. */
export function arrowGeometry(a: Point, b: Point, strokeWidth: number): { shaftEnd: Point; head: Point[] | null } {
  const len = distance(a, b);
  if (len < 1) return { shaftEnd: b, head: null };
  const size = Math.min(len * 0.6, 12 + strokeWidth * 3);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const angle = Math.PI / 7;
  const rot = (t: number) => ({ x: ux * Math.cos(t) - uy * Math.sin(t), y: ux * Math.sin(t) + uy * Math.cos(t) });
  const left = rot(angle);
  const right = rot(-angle);
  const back = size * Math.cos(angle) * 0.8;
  return {
    shaftEnd: { x: b.x - ux * back, y: b.y - uy * back },
    head: [
      { x: b.x - left.x * size, y: b.y - left.y * size },
      b,
      { x: b.x - right.x * size, y: b.y - right.y * size },
    ],
  };
}

interface TextBlockProps {
  text: string;
  x: number;
  top: number;
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  anchor: 'start' | 'middle';
}

function TextBlock({ text, x, top, fontSize, fontFamily, color, anchor }: TextBlockProps) {
  const lh = fontSize * LINE_HEIGHT;
  return (
    <text
      x={r(x)}
      fontSize={fontSize}
      fontFamily={FONT_STACKS[fontFamily]}
      fontWeight={FONT_WEIGHTS[fontFamily]}
      fill={color}
      textAnchor={anchor}
      dominantBaseline="central"
      xmlSpace="preserve"
      style={{ whiteSpace: 'pre' }}
    >
      {splitLines(text).map((line, i) => (
        <tspan key={i} x={r(x)} y={r(top + (i + 0.5) * lh)}>
          {line.length > 0 ? line : ' '}
        </tspan>
      ))}
    </text>
  );
}

interface ElementViewProps {
  element: BoardElement;
  /** Esconde o texto enquanto ele está sendo editado na caixa de texto sobreposta. */
  hideText?: boolean;
  /** Apagando com a borracha: desenha translúcido. */
  faded?: boolean;
  /** Na exportação não saem os atributos data-* de uso interno. */
  forExport?: boolean;
  /** No tema escuro as cores da paleta são trocadas na hora de desenhar (ver model/theme.ts). */
  theme?: Theme;
}

function ElementViewImpl({ element: el, hideText = false, faded = false, forExport = false, theme = 'light' }: ElementViewProps) {
  const strokeColor = themeColor(el.strokeColor, theme);
  const fill = (color: string) => (color === 'transparent' ? 'none' : themeColor(color, theme));
  const stroke = {
    stroke: strokeColor,
    strokeWidth: el.strokeWidth,
    strokeDasharray: dashArray(el.strokeStyle, el.strokeWidth),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const data = forExport
    ? {}
    : {
        'data-element-id': el.id,
        'data-type': el.type,
        ...(el.type === 'arrow' || el.type === 'line'
          ? { 'data-start-binding': el.startBinding ?? '', 'data-end-binding': el.endBinding ?? '' }
          : {}),
      };
  const opacity = faded ? 0.3 : undefined;

  switch (el.type) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const radius = Math.min(14, el.width / 4, el.height / 4);
      let outline;
      if (el.type === 'rectangle') {
        outline = (
          <rect x={r(el.x)} y={r(el.y)} width={r(el.width)} height={r(el.height)} rx={r(radius)} fill={fill(el.fillColor)} {...stroke} />
        );
      } else if (el.type === 'ellipse') {
        outline = <ellipse cx={r(cx)} cy={r(cy)} rx={r(el.width / 2)} ry={r(el.height / 2)} fill={fill(el.fillColor)} {...stroke} />;
      } else {
        const pts = diamondPoints(el).map((p) => `${r(p.x)},${r(p.y)}`).join(' ');
        outline = <polygon points={pts} fill={fill(el.fillColor)} {...stroke} />;
      }
      const lines = splitLines(el.text).length;
      return (
        <g {...data} opacity={opacity}>
          {outline}
          {!hideText && el.text.length > 0 && (
            <TextBlock
              text={el.text}
              x={cx}
              top={cy - (lines * el.fontSize * LINE_HEIGHT) / 2}
              fontSize={el.fontSize}
              fontFamily={el.fontFamily}
              color={labelColor(el.strokeColor, el.fillColor, theme)}
              anchor="middle"
            />
          )}
        </g>
      );
    }
    case 'text':
      return (
        <g {...data} opacity={opacity}>
          {!hideText && (
            <TextBlock
              text={el.text}
              x={el.x}
              top={el.y}
              fontSize={el.fontSize}
              fontFamily={el.fontFamily}
              color={strokeColor}
              anchor="start"
            />
          )}
        </g>
      );
    case 'line': {
      const [a, b] = el.points;
      return (
        <g {...data} opacity={opacity}>
          <line x1={r(a.x)} y1={r(a.y)} x2={r(b.x)} y2={r(b.y)} {...stroke} />
        </g>
      );
    }
    case 'arrow': {
      const [a, b] = el.points;
      const { shaftEnd, head } = arrowGeometry(a, b, el.strokeWidth);
      return (
        <g {...data} opacity={opacity}>
          <line x1={r(a.x)} y1={r(a.y)} x2={r(shaftEnd.x)} y2={r(shaftEnd.y)} {...stroke} />
          {head && (
            <polygon
              points={head.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')}
              fill={strokeColor}
              stroke={strokeColor}
              strokeWidth={Math.max(1, el.strokeWidth / 2)}
              strokeLinejoin="round"
            />
          )}
        </g>
      );
    }
    case 'freedraw':
      return (
        <g {...data} opacity={opacity}>
          <path d={freedrawPath(el.points)} fill="none" {...stroke} />
        </g>
      );
  }
}

export const ElementView = memo(ElementViewImpl);
