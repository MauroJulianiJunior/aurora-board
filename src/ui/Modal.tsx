// Diálogo modal sobre o <dialog> nativo: o navegador cuida do foco preso, do Esc e do fundo inerte.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icons';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'center' | 'drawer';
  /** Papel alertdialog para confirmações destrutivas. */
  alert?: boolean;
  testId?: string;
}

export function Modal({ open, title, onClose, children, footer, variant = 'center', alert = false, testId }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClosed = () => {
      // Devolve o foco a quem abriu o diálogo.
      previousFocus.current?.focus?.({ preventScroll: true });
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClosed);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClosed);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`modal ${variant === 'drawer' ? 'drawer' : ''}`}
      aria-labelledby={titleId}
      role={alert ? 'alertdialog' : undefined}
      data-testid={testId}
      onPointerDown={(e) => {
        // Clique no fundo escurecido (fora do conteúdo) fecha.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-inner">
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
