// Painel de estilo: aparece com uma seleção ou com uma ferramenta de desenho ativa. Mudar um valor
// vale para a seleção e para os próximos elementos criados.
import { useId } from 'react';
import { FILL_COLORS, FONT_FAMILIES, FONT_SIZES, STROKE_COLORS, STROKE_WIDTHS } from '../model/constants';
import type { ReorderDirection } from '../model/operations';
import { themeColor, type Theme } from '../model/theme';
import { isBindable, isBoxElement, isShape, isText, type BoardElement, type StyleState, type Tool } from '../model/types';
import { Icon } from './Icons';

interface PropertiesPanelProps {
  selected: BoardElement[];
  tool: Tool;
  style: StyleState;
  theme: Theme;
  onStyle: (patch: Partial<StyleState>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (direction: ReorderDirection) => void;
  onConnect: () => void;
}

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond'];
const DRAW_TOOLS: Tool[] = [...SHAPE_TOOLS, 'arrow', 'line', 'freedraw', 'text'];

/** Valor comum entre os elementos selecionados (null = misto). */
function common<T>(items: BoardElement[], pick: (el: BoardElement) => T | undefined): T | null {
  let value: T | undefined;
  for (const el of items) {
    const v = pick(el);
    if (v === undefined) continue;
    if (value === undefined) value = v;
    else if (v !== value) return null;
  }
  return value ?? null;
}

interface ChoiceGroupProps<T extends string | number> {
  legend: string;
  name: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string; face?: string; title?: string }>;
  onChange: (value: T) => void;
  swatch?: boolean;
  /** Amostras mostram a cor como ela aparece no tema atual. */
  theme?: Theme;
}

function ChoiceGroup<T extends string | number>({ legend, name, value, options, onChange, swatch, theme = 'light' }: ChoiceGroupProps<T>) {
  const id = useId();
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="choice-row">
        {options.map((o) => (
          <label key={String(o.value)} className={`choice ${swatch ? 'swatch' : ''}`} title={o.title ?? o.label}>
            <input
              type="radio"
              name={`${name}-${id}`}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              aria-label={o.title ?? o.label}
            />
            {swatch ? (
              <span
                className={`face ${o.value === 'transparent' ? 'transparent' : ''}`}
                style={o.value === 'transparent' ? undefined : { background: themeColor(String(o.value), theme) }}
              />
            ) : (
              <span className="face">{o.face ?? o.label}</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PropertiesPanel({ selected, tool, style, theme, onStyle, onDelete, onDuplicate, onReorder, onConnect }: PropertiesPanelProps) {
  const hasSelection = selected.length > 0;
  if (!hasSelection && !DRAW_TOOLS.includes(tool)) return null;

  const fromStyle = !hasSelection;
  const showFill = fromStyle ? SHAPE_TOOLS.includes(tool) : selected.some(isShape);
  const showStroke = fromStyle ? tool !== 'text' : selected.some((el) => !isText(el));
  const showFont = fromStyle ? SHAPE_TOOLS.includes(tool) || tool === 'text' : selected.some(isBoxElement);
  const canConnect = selected.length === 2 && selected.every(isBindable);

  const strokeColor = fromStyle ? style.strokeColor : common(selected, (el) => el.strokeColor);
  const fillColor = fromStyle ? style.fillColor : common(selected, (el) => (isShape(el) ? el.fillColor : undefined));
  const strokeWidth = fromStyle ? style.strokeWidth : common(selected, (el) => (isText(el) ? undefined : el.strokeWidth));
  const strokeStyle = fromStyle ? style.strokeStyle : common(selected, (el) => (isText(el) ? undefined : el.strokeStyle));
  const fontFamily = fromStyle ? style.fontFamily : common(selected, (el) => (isBoxElement(el) ? el.fontFamily : undefined));
  const fontSize = fromStyle ? style.fontSize : common(selected, (el) => (isBoxElement(el) ? el.fontSize : undefined));

  return (
    <aside className="props" aria-label={hasSelection ? 'Estilo da seleção' : 'Estilo dos próximos elementos'} data-testid="properties">
      <ChoiceGroup
        legend={showStroke ? 'Traço e texto' : 'Cor do texto'}
        name="stroke"
        swatch
        theme={theme}
        value={strokeColor}
        options={STROKE_COLORS}
        onChange={(v) => onStyle({ strokeColor: v })}
      />
      {showFill && (
        <ChoiceGroup legend="Preenchimento" name="fill" swatch theme={theme} value={fillColor} options={FILL_COLORS} onChange={(v) => onStyle({ fillColor: v })} />
      )}
      {showStroke && (
        <>
          <ChoiceGroup
            legend="Espessura"
            name="width"
            value={strokeWidth}
            options={STROKE_WIDTHS.map((w) => ({ ...w, face: w.label }))}
            onChange={(v) => onStyle({ strokeWidth: v })}
          />
          <ChoiceGroup
            legend="Estilo do traço"
            name="dash"
            value={strokeStyle}
            options={[
              { value: 'solid' as const, label: 'Contínuo' },
              { value: 'dashed' as const, label: 'Tracejado' },
            ]}
            onChange={(v) => onStyle({ strokeStyle: v })}
          />
        </>
      )}
      {showFont && (
        <>
          <ChoiceGroup
            legend="Fonte"
            name="font"
            value={fontFamily}
            options={FONT_FAMILIES}
            onChange={(v) => onStyle({ fontFamily: v })}
          />
          <ChoiceGroup
            legend="Tamanho do texto"
            name="size"
            value={fontSize}
            options={FONT_SIZES.map((s) => ({ value: s.value, label: s.label, title: s.name }))}
            onChange={(v) => onStyle({ fontSize: v })}
          />
        </>
      )}
      {hasSelection && (
        <div>
          <div className="group-label" id="props-actions">
            Ações
          </div>
          <div className="actions" role="group" aria-labelledby="props-actions">
            <button type="button" className="icon-btn" aria-label="Enviar para trás (Ctrl+[)" title="Enviar para trás — Ctrl+[" onClick={() => onReorder('backward')}>
              <Icon name="sendBackward" />
            </button>
            <button type="button" className="icon-btn" aria-label="Trazer para frente (Ctrl+])" title="Trazer para frente — Ctrl+]" onClick={() => onReorder('forward')}>
              <Icon name="bringForward" />
            </button>
            <button type="button" className="icon-btn" aria-label="Duplicar (Ctrl+D)" title="Duplicar — Ctrl+D" onClick={onDuplicate}>
              <Icon name="copy" />
            </button>
            <button type="button" className="icon-btn" aria-label="Excluir (Delete)" title="Excluir — Delete" onClick={onDelete}>
              <Icon name="trash" />
            </button>
          </div>
        </div>
      )}
      {canConnect && (
        <button type="button" className="btn btn-sm connect-btn" onClick={onConnect}>
          <Icon name="connect" size={18} />
          Conectar com seta
        </button>
      )}
      {!hasSelection && tool === 'arrow' && (
        <p className="props-hint">Arraste de uma forma até outra: a seta fica ligada e acompanha quando as formas se movem.</p>
      )}
    </aside>
  );
}
