// Tema da lousa. O quadro guarda sempre as cores "do tema claro" (é o que vai para o IndexedDB e
// para o .aurora.json); o tema escuro só troca a cor na hora de desenhar. Assim o mesmo quadro abre
// bem nos dois temas e o arquivo exportado não depende de preferência.

export type Theme = 'light' | 'dark';

/** Fundo da lousa (e da imagem exportada com fundo). O escuro é cinza, não preto. */
export const THEME_BACKGROUND: Record<Theme, string> = {
  light: '#f5f7f5',
  dark: '#2b312e',
};

/**
 * Cor de cada item da paleta no tema escuro. Traços: contraste ≥ 5,8:1 sobre o fundo cinza.
 * Preenchimentos: tons escuros do mesmo matiz, com a tinta clara em cima ≥ 7:1. O verde Aurora
 * continua verde vivo (o rótulo em cima dele passa a ser escuro, ver labelColor).
 */
const DARK_COLORS: Record<string, string> = {
  // traço e texto
  '#1f2723': '#e8ecea',
  '#087f45': '#3ddc84',
  '#1d63b8': '#7ab4ff',
  '#c62828': '#ff8a80',
  '#b35600': '#ffa24c',
  '#6e45c4': '#b49cff',
  '#5b6962': '#a3b0aa',
  // preenchimento
  '#ffffff': '#424a46',
  '#dcede2': '#1f3a2c',
  '#d9e7f2': '#1e3044',
  '#f8efc4': '#3d3519',
  '#f7e1dd': '#432826',
  '#e9e5f6': '#2f2a45',
  '#00e676': '#00e676',
};

const HEX_RE = /^#[0-9a-f]{6}$/;

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Cores fora da paleta (vindas de um arquivo importado): inverte a luminosidade e mantém o matiz,
 * para que tinta escura fique clara e fundo claro fique escuro.
 */
export function invertLightness(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l2 = 1 - l;
  const c = (1 - Math.abs(2 * l2 - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/** A cor como ela aparece no tema. 'transparent' passa direto. */
export function themeColor(color: string, theme: Theme): string {
  if (theme === 'light' || color === 'transparent') return color;
  const key = color.toLowerCase();
  if (!HEX_RE.test(key)) return color;
  return DARK_COLORS[key] ?? invertLightness(key);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const DARK_INK = '#101512';
const LIGHT_INK = '#f5f7f5';

/**
 * Cor do rótulo de uma forma. No tema claro é a cor escolhida, sem mexer. No escuro, se a tinta
 * clara ficar ilegível sobre o preenchimento (ex.: verde Aurora), troca por preto ou off-white,
 * o que der mais contraste.
 */
export function labelColor(strokeColor: string, fillColor: string, theme: Theme): string {
  const text = themeColor(strokeColor, theme);
  if (theme === 'light' || fillColor === 'transparent') return text;
  const fill = themeColor(fillColor, theme);
  if (!HEX_RE.test(fill) || !HEX_RE.test(text) || contrastRatio(text, fill) >= 4.5) return text;
  return contrastRatio(DARK_INK, fill) >= contrastRatio(LIGHT_INK, fill) ? DARK_INK : LIGHT_INK;
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}
