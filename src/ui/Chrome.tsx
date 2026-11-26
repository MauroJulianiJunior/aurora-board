// Peças pequenas da interface: nome do quadro, estado do salvamento, zoom, vista, avisos, estado
// vazio, carregamento e tela de erro.
import { Component, useRef, useState, type ReactNode } from 'react';
import { LIMITS } from '../model/constants';
import { validateBoardName } from '../model/validate';
import { BrandMark, Icon } from './Icons';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'memory';

export function BoardTitle({
  name,
  isSample,
  onRename,
  onOpenBoards,
}: {
  name: string;
  isSample: boolean;
  onRename: (name: string) => void;
  onOpenBoards: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const submit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const result = validateBoardName(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onRename(result.name);
    setEditing(false);
  };

  return (
    <div className="floating top-left">
      <div className="brand">
        <BrandMark size={26} />
        <span className="brand-name">Aurora Board</span>
      </div>
      {editing ? (
        <form
          className="rename-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="rename-input"
            aria-label="Nome do quadro"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'board-name-error' : undefined}
            value={draft}
            maxLength={LIMITS.maxNameLength + 20}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelled.current = true;
                setEditing(false);
                setError(null);
              }
            }}
            onBlur={submit}
          />
          {error && (
            <span className="field-error" id="board-name-error" role="alert">
              {error}
            </span>
          )}
        </form>
      ) : (
        <button
          type="button"
          className="board-name-btn"
          title="Renomear o quadro"
          aria-label={`Quadro “${name}”. Clique para renomear.`}
          onClick={() => {
            setDraft(name);
            cancelled.current = false;
            setError(null);
            setEditing(true);
          }}
        >
          {name}
        </button>
      )}
      {isSample && !editing && <span className="sample-tag">Exemplo</span>}
      <button type="button" className="btn btn-sm" onClick={onOpenBoards} aria-haspopup="dialog">
        <Icon name="boards" size={18} />
        <span className="btn-label">Quadros</span>
      </button>
    </div>
  );
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Salvo',
  pending: 'Alterações…',
  saving: 'Salvando…',
  error: 'Falha ao salvar',
  memory: 'Sem salvamento',
};

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <>
      <span className="save-status" data-status={status} role="status" aria-live="polite" data-testid="save-status">
        <span className="save-dot" aria-hidden="true" />
        {STATUS_TEXT[status]}
      </span>
      {status === 'error' && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </>
  );
}

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  onFit,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
}) {
  return (
    <div className="floating bottom-left" role="group" aria-label="Zoom">
      <button type="button" className="icon-btn" aria-label="Diminuir zoom (Ctrl+-)" title="Diminuir zoom — Ctrl+-" onClick={onZoomOut}>
        <Icon name="minus" />
      </button>
      <button type="button" className="zoom-value" aria-label={`Zoom ${Math.round(zoom * 100)}%. Voltar para 100% (Ctrl+0)`} title="Voltar para 100% — Ctrl+0" onClick={onReset}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className="icon-btn" aria-label="Aumentar zoom (Ctrl+=)" title="Aumentar zoom — Ctrl+=" onClick={onZoomIn}>
        <Icon name="plus" />
      </button>
      <button type="button" className="icon-btn" aria-label="Enquadrar tudo (Shift+1)" title="Enquadrar tudo — Shift+1" onClick={onFit}>
        <Icon name="fit" />
      </button>
    </div>
  );
}

export function ViewControls({
  showGrid,
  fullscreen,
  dark,
  onToggleGrid,
  onToggleTheme,
  onFocusMode,
  onToggleFullscreen,
}: {
  showGrid: boolean;
  fullscreen: boolean;
  dark: boolean;
  onToggleGrid: () => void;
  onToggleTheme: () => void;
  onFocusMode: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="floating bottom-right" role="group" aria-label="Vista">
      <button
        type="button"
        className="icon-btn"
        aria-pressed={dark}
        aria-label="Tema escuro (Alt+Shift+D)"
        title={dark ? 'Voltar ao tema claro — Alt+Shift+D' : 'Tema escuro — Alt+Shift+D'}
        onClick={onToggleTheme}
        data-testid="theme-toggle"
      >
        <Icon name={dark ? 'moon' : 'sun'} />
      </button>
      <button type="button" className="icon-btn" aria-pressed={showGrid} aria-label="Grade de pontos (G)" title="Grade de pontos — G" onClick={onToggleGrid}>
        <Icon name="grid" />
      </button>
      <button type="button" className="icon-btn" aria-label="Modo foco: esconde os painéis (Alt+Z)" title="Modo foco — Alt+Z" onClick={onFocusMode}>
        <Icon name="focus" />
      </button>
      {(document.fullscreenEnabled || window.auroraDesktop) && (
        <button
          type="button"
          className="icon-btn"
          aria-pressed={fullscreen}
          aria-label="Tela cheia"
          title="Tela cheia (projetor)"
          onClick={onToggleFullscreen}
        >
          <Icon name="fullscreen" />
        </button>
      )}
    </div>
  );
}

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">
            <Icon name={t.kind === 'error' ? 'alert' : 'check'} size={18} />
          </span>
          <span>{t.message}</span>
          <button type="button" className="icon-btn" aria-label="Fechar aviso" onClick={() => onDismiss(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ onSample, onImport }: { onSample: () => void; onImport: () => void }) {
  return (
    <section className="empty-state" aria-labelledby="empty-title" data-testid="empty-state">
      <div className="bracket-card">
        <span className="brackets" aria-hidden="true" />
        <h1 id="empty-title">Sua lousa está vazia</h1>
        <p>Escolha uma ferramenta na barra de ferramentas e desenhe. Tudo fica salvo neste navegador, automaticamente.</p>
        <div className="hint-keys">
          <span>
            <kbd>R</kbd> retângulo
          </span>
          <span>
            <kbd>A</kbd> seta
          </span>
          <span>
            <kbd>P</kbd> caneta
          </span>
          <span>
            <kbd>T</kbd> texto
          </span>
          <span>
            <kbd>?</kbd> atalhos
          </span>
        </div>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={onSample}>
            Abrir um quadro de exemplo
          </button>
          <button type="button" className="btn" onClick={onImport}>
            <Icon name="upload" size={18} />
            Importar arquivo
          </button>
        </div>
      </div>
    </section>
  );
}

export function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div>
        <BrandMark size={56} className="loader-mark" />
        <p>Abrindo seus quadros…</p>
      </div>
    </div>
  );
}

export function FatalScreen({ message }: { message: string }) {
  return (
    <div className="fatal-screen" role="alert">
      <div>
        <BrandMark size={56} />
        <h1>Algo deu errado</h1>
        <p>{message}</p>
        <p className="small">Os quadros já salvos continuam guardados neste navegador.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Sem log de conteúdo: o erro pode carregar texto do quadro.
    console.error('Aurora Board: erro inesperado na interface.');
  }

  render() {
    if (this.state.failed) {
      return <FatalScreen message="A interface encontrou um erro inesperado. Recarregue a página para continuar." />;
    }
    return this.props.children;
  }
}
