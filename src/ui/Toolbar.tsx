import { TOOL_SHORTCUTS } from '../editor/shortcuts';
import type { Tool } from '../model/types';
import { Icon, type IconName } from './Icons';

const TOOLS: ReadonlyArray<{ tool: Tool; label: string; icon: IconName; key: string } | 'sep'> = [
  { tool: 'select', label: 'Selecionar', icon: 'select', key: '1' },
  { tool: 'hand', label: 'Mover a lousa', icon: 'hand', key: 'H' },
  'sep',
  { tool: 'rectangle', label: 'Retângulo', icon: 'rectangle', key: '2' },
  { tool: 'ellipse', label: 'Elipse', icon: 'ellipse', key: '3' },
  { tool: 'diamond', label: 'Losango', icon: 'diamond', key: '4' },
  { tool: 'arrow', label: 'Seta (conecta formas)', icon: 'arrow', key: '5' },
  { tool: 'line', label: 'Linha', icon: 'line', key: '6' },
  { tool: 'freedraw', label: 'Caneta', icon: 'freedraw', key: '7' },
  { tool: 'text', label: 'Texto', icon: 'text', key: '8' },
  { tool: 'eraser', label: 'Borracha', icon: 'eraser', key: '9' },
];

interface ToolbarProps {
  tool: Tool;
  onSelect: (tool: Tool) => void;
  /** Botão acionado pelo teclado (Enter/Espaço): insere a forma no centro da tela. */
  onKeyboardInsert: (tool: Tool) => void;
}

export function Toolbar({ tool, onSelect, onKeyboardInsert }: ToolbarProps) {
  return (
    <div className="floating toolbar" role="toolbar" aria-label="Ferramentas">
      {TOOLS.map((t, i) =>
        t === 'sep' ? (
          <span key={`sep-${i}`} className="sep" aria-hidden="true" />
        ) : (
          <button
            key={t.tool}
            type="button"
            className="icon-btn"
            aria-pressed={tool === t.tool}
            aria-label={`${t.label} (${TOOL_SHORTCUTS[t.tool]})`}
            title={`${t.label} — ${TOOL_SHORTCUTS[t.tool]}`}
            data-tool={t.tool}
            onClick={(e) => {
              onSelect(t.tool);
              // detail === 0: clique gerado pelo teclado, não pelo mouse.
              if (e.detail === 0) onKeyboardInsert(t.tool);
            }}
          >
            <Icon name={t.icon} />
            <span className="tool-key" aria-hidden="true">
              {t.key}
            </span>
          </button>
        ),
      )}
    </div>
  );
}
