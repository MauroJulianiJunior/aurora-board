import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '../../src/editor/shortcuts';
import { renderSceneSvg } from '../../src/export/exportScene';
import { DEFAULT_STYLE, FILL_COLORS, STROKE_COLORS } from '../../src/model/constants';
import { createShape } from '../../src/model/elements';
import { contrastRatio, invertLightness, labelColor, THEME_BACKGROUND, themeColor } from '../../src/model/theme';

const darkBg = THEME_BACKGROUND.dark;

describe('tema escuro', () => {
  it('o fundo é cinza, não preto', () => {
    expect(darkBg).not.toBe('#000000');
    // Nem perto do preto: o fundo escuro tem luminância bem acima do preto puro.
    expect(contrastRatio(darkBg, '#000000')).toBeGreaterThan(1.4);
  });

  it('toda cor de traço da paleta fica legível sobre o fundo cinza (≥ 4,5:1)', () => {
    for (const { value } of STROKE_COLORS) {
      expect(contrastRatio(themeColor(value, 'dark'), darkBg), value).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('a tinta clara fica legível sobre todo preenchimento escuro, e o rótulo se ajusta no verde Aurora', () => {
    for (const { value } of FILL_COLORS) {
      if (value === 'transparent') continue;
      const fill = themeColor(value, 'dark');
      const text = labelColor(STROKE_COLORS[0].value, value, 'dark');
      expect(contrastRatio(text, fill), value).toBeGreaterThanOrEqual(4.5);
    }
    expect(labelColor('#1f2723', '#00e676', 'dark')).toBe('#101512');
  });

  it('no tema claro nada muda', () => {
    expect(themeColor('#c62828', 'light')).toBe('#c62828');
    expect(labelColor('#c62828', '#00e676', 'light')).toBe('#c62828');
  });

  it('cor fora da paleta (arquivo importado) tem a luminosidade invertida', () => {
    expect(invertLightness('#000000')).toBe('#ffffff');
    expect(invertLightness('#ffffff')).toBe('#000000');
    const navy = '#102040';
    expect(contrastRatio(themeColor(navy, 'dark'), darkBg)).toBeGreaterThan(contrastRatio(navy, darkBg));
    expect(themeColor('transparent', 'dark')).toBe('transparent');
  });

  it('exporta com o fundo e as cores do tema escolhido, sem mudar o quadro salvo', () => {
    const rect = createShape('rectangle', { x: 0, y: 0, width: 100, height: 60 }, DEFAULT_STYLE, 'Oi');
    const dark = renderSceneSvg([rect], { background: true, theme: 'dark' })!.markup;
    const light = renderSceneSvg([rect], { background: true })!.markup;
    expect(dark).toContain(darkBg);
    expect(dark).toContain('#e8ecea');
    expect(light).toContain(THEME_BACKGROUND.light);
    expect(light).toContain('#1f2723');
    expect(rect.strokeColor).toBe('#1f2723');
  });

  it('Alt+Shift+D alterna o tema', () => {
    expect(resolveShortcut({ key: 'D', code: 'KeyD', ctrlKey: false, metaKey: false, shiftKey: true, altKey: true })).toEqual({
      type: 'toggleTheme',
    });
  });
});
