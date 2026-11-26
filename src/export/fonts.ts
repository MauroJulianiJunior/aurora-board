// Fontes embutidas no SVG/PNG exportado. Os arquivos .woff2 vêm do próprio build (pacotes
// @fontsource, licença OFL): sem CDN, sem requisição para fora.
import interUrl from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import groteskUrl from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url';
import monoUrl from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import type { FontFamily } from '../model/types';
import { FONT_WEIGHTS } from '../model/text';

const FONT_FILES: Record<FontFamily, { family: string; url: string }> = {
  sans: { family: 'Inter', url: interUrl },
  display: { family: 'Space Grotesk', url: groteskUrl },
  mono: { family: 'IBM Plex Mono', url: monoUrl },
};

const cache = new Map<FontFamily, Promise<string | null>>();

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fontFace(family: FontFamily): Promise<string | null> {
  const file = FONT_FILES[family];
  try {
    const res = await fetch(file.url);
    if (!res.ok) return null;
    const data = toBase64(await res.arrayBuffer());
    return `@font-face{font-family:'${file.family}';font-weight:${FONT_WEIGHTS[family]};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
  } catch {
    return null;
  }
}

/** CSS com @font-face das famílias usadas. Se uma fonte falhar, o arquivo sai com a fonte de sistema. */
export async function buildFontCss(families: Iterable<FontFamily>): Promise<string> {
  const rules = await Promise.all(
    [...families].map((f) => {
      let p = cache.get(f);
      if (!p) {
        p = fontFace(f);
        cache.set(f, p);
      }
      return p;
    }),
  );
  return rules.filter((r): r is string => r !== null).join('');
}
