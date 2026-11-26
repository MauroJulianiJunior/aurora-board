// Lista de quadros guardados neste navegador: abrir, criar, renomear, duplicar, exportar e excluir.
import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '../model/constants';
import type { BoardSummary } from '../model/types';
import { validateBoardName } from '../model/validate';
import { Icon } from './Icons';
import { Modal } from './Modal';

interface BoardsPanelProps {
  open: boolean;
  onClose: () => void;
  boards: BoardSummary[];
  currentId: string | null;
  storageKind: 'indexeddb' | 'memory';
  onOpenBoard: (id: string) => void;
  onCreate: () => void;
  onCreateSample: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (board: BoardSummary) => void;
  onImport: () => void;
  onExportAll: () => void;
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function StorageInfo({ kind }: { kind: 'indexeddb' | 'memory' }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    const storage = navigator.storage;
    if (!storage) return;
    storage.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    storage
      .estimate?.()
      .then((e) => {
        if (typeof e.usage === 'number') setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB usados`);
      })
      .catch(() => undefined);
  }, []);

  if (kind === 'memory') {
    return (
      <div className="storage-info" role="note">
        <p>
          <strong>Modo temporário:</strong> o navegador não liberou o armazenamento local, então os quadros só existem nesta
          aba. Exporte em JSON antes de fechar.
        </p>
      </div>
    );
  }

  return (
    <div className="storage-info" role="note">
      <p>
        <strong>Onde ficam os dados:</strong> no IndexedDB deste navegador, nesta máquina. Não há conta, servidor nem
        sincronização. {usage && <span>({usage})</span>}
      </p>
      <p>
        {persisted
          ? 'O navegador marcou este armazenamento como persistente: ele não é apagado para liberar espaço.'
          : 'Se o disco encher, o navegador pode limpar dados de sites. Faça backups com “Exportar todos”.'}
      </p>
      {persisted === false && navigator.storage?.persist && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            navigator.storage
              .persist()
              .then(setPersisted)
              .catch(() => setPersisted(false));
          }}
        >
          Pedir ao navegador para manter os dados
        </button>
      )}
    </div>
  );
}

export function BoardsPanel(props: BoardsPanelProps) {
  const { open, onClose, boards, currentId } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) {
      setRenaming(null);
      setError(null);
    }
  }, [open]);

  const submitRename = (id: string) => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const result = validateBoardName(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    props.onRename(id, result.name);
    setRenaming(null);
    setError(null);
  };

  return (
    <Modal open={open} title="Quadros" onClose={onClose} variant="drawer" testId="boards-panel">
      <div className="board-actions-top">
        <button type="button" className="btn btn-primary" onClick={props.onCreate}>
          <Icon name="plusBoard" size={18} />
          Novo quadro
        </button>
        <button type="button" className="btn" onClick={props.onImport}>
          <Icon name="upload" size={18} />
          Importar arquivo
        </button>
        <button type="button" className="btn" onClick={props.onExportAll} disabled={boards.length === 0}>
          <Icon name="download" size={18} />
          Exportar todos (backup)
        </button>
        <button type="button" className="btn" onClick={props.onCreateSample}>
          Criar quadro de exemplo
        </button>
      </div>

      {boards.length === 0 ? (
        <p className="muted">Nenhum quadro guardado ainda.</p>
      ) : (
        <ul className="board-list" aria-label="Quadros guardados">
          {boards.map((b) => (
            <li key={b.id} className="board-item" aria-current={b.id === currentId ? 'true' : undefined}>
              {renaming === b.id ? (
                <form
                  className="rename-form"
                  style={{ flex: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename(b.id);
                  }}
                >
                  <input
                    className="rename-input"
                    aria-label="Novo nome do quadro"
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? `rename-error-${b.id}` : undefined}
                    value={draft}
                    maxLength={LIMITS.maxNameLength + 20}
                    autoFocus
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelled.current = true;
                        setRenaming(null);
                        setError(null);
                      }
                    }}
                    onBlur={() => submitRename(b.id)}
                  />
                  {error && (
                    <span className="field-error" id={`rename-error-${b.id}`} role="alert">
                      {error}
                    </span>
                  )}
                </form>
              ) : (
                <button type="button" className="board-open" onClick={() => props.onOpenBoard(b.id)}>
                  <span className="title">
                    {b.name} {b.id === currentId && <span className="sr-only">(aberto)</span>}
                  </span>
                  <span className="meta">
                    {b.isSample ? 'Exemplo · ' : ''}
                    {b.elementCount} {b.elementCount === 1 ? 'elemento' : 'elementos'} · {dateFormat.format(b.updatedAt)}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Renomear “${b.name}”`}
                title="Renomear"
                onClick={() => {
                  cancelled.current = false;
                  setRenaming(b.id);
                  setDraft(b.name);
                  setError(null);
                }}
              >
                <Icon name="edit" />
              </button>
              <button type="button" className="icon-btn" aria-label={`Duplicar “${b.name}”`} title="Duplicar" onClick={() => props.onDuplicate(b.id)}>
                <Icon name="copy" />
              </button>
              <button type="button" className="icon-btn" aria-label={`Exportar “${b.name}” em JSON`} title="Exportar em JSON" onClick={() => props.onExport(b.id)}>
                <Icon name="download" />
              </button>
              <button type="button" className="icon-btn" aria-label={`Excluir “${b.name}”`} title="Excluir" onClick={() => props.onDelete(b)}>
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <StorageInfo kind={props.storageKind} />
    </Modal>
  );
}
