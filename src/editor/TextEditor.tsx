// Caixa de texto sobreposta à lousa, alinhada ao elemento em edição (texto solto ou rótulo de forma).
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LIMITS } from '../model/constants';
import { FONT_STACKS, FONT_WEIGHTS, LINE_HEIGHT, sanitizeText, splitLines, type MeasureText } from '../model/text';
import { labelColor, themeColor, type Theme } from '../model/theme';
import type { ShapeElement, TextElement, Viewport } from '../model/types';
import { worldToScreen } from './viewport';

interface TextEditorProps {
  element: ShapeElement | TextElement;
  viewport: Viewport;
  measure: MeasureText;
  theme: Theme;
  onChange: (text: string) => void;
  onCommit: (text: string) => void;
}

export function TextEditor({ element, viewport, measure, theme, onChange, onCommit }: TextEditorProps) {
  const [value, setValue] = useState(element.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    // Só ao abrir; a posição do cursor é da pessoa daqui em diante. O texto digitado já vai para o
    // quadro a cada tecla (onChange), então desmontar sem confirmar não perde nada.
  }, []);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  };

  const z = viewport.zoom;
  const fontSize = element.fontSize * z;
  const lines = Math.max(1, splitLines(value).length);
  const height = lines * fontSize * LINE_HEIGHT;
  const measured = measure(value || ' ', element.fontFamily, element.fontSize);

  let style: CSSProperties;
  if (element.type === 'text') {
    const p = worldToScreen(element, viewport);
    style = {
      left: p.x,
      top: p.y,
      width: measured.width * z + fontSize,
      textAlign: 'left',
    };
  } else {
    const p = worldToScreen(element, viewport);
    const width = Math.max(element.width * z, measured.width * z + fontSize);
    style = {
      left: p.x + (element.width * z - width) / 2,
      top: p.y + (element.height * z) / 2 - height / 2,
      width,
      textAlign: 'center',
    };
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label={element.type === 'text' ? 'Editar texto' : 'Editar rótulo da forma'}
      value={value}
      spellCheck
      wrap="off"
      rows={lines}
      maxLength={LIMITS.maxTextLength}
      style={{
        ...style,
        height,
        fontSize,
        lineHeight: LINE_HEIGHT,
        fontFamily: FONT_STACKS[element.fontFamily],
        fontWeight: FONT_WEIGHTS[element.fontFamily],
        color:
          element.type === 'text'
            ? themeColor(element.strokeColor, theme)
            : labelColor(element.strokeColor, element.fillColor, theme),
      }}
      onChange={(e) => {
        const next = sanitizeText(e.target.value, LIMITS.maxTextLength);
        setValue(next);
        onChange(next);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
    />
  );
}
