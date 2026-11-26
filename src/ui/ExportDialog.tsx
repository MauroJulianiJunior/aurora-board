import { useEffect, useState } from 'react';
import { downloadBlob, downloadText } from '../export/download';
import { fileNameFor } from '../model/fileFormat';
import type { Theme } from '../model/theme';
import type { BoardElement } from '../model/types';
import { Modal } from './Modal';

type Format = 'png' | 'svg' | 'json';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  boardName: string;
  elements: BoardElement[];
  selectedIds: string[];
  /** Tema atual do app: é o tema padrão da imagem exportada. */
  theme: Theme;
  onExportJson: () => void;
  onDone: (message: string) => void;
}

async function buildScene(targets: BoardElement[], background: boolean, theme: Theme) {
  const [{ renderSceneSvg, fontsUsed }, { buildFontCss }] = await Promise.all([
    import('../export/exportScene'),
    import('../export/fonts'),
  ]);
  const fontCss = await buildFontCss(fontsUsed(targets));
  return renderSceneSvg(targets, { background, fontCss, theme });
}

export function ExportDialog({ open, onClose, boardName, elements, selectedIds, theme, onExportJson, onDone }: ExportDialogProps) {
  const [format, setFormat] = useState<Format>('png');
  const [onlySelection, setOnlySelection] = useState(false);
  const [background, setBackground] = useState(true);
  const [scale, setScale] = useState(2);
  const [imageTheme, setImageTheme] = useState<Theme>(theme);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selectedIds.length > 0;
  const useSelection = onlySelection && hasSelection;
  const targets = useSelection ? elements.filter((el) => selectedIds.includes(el.id)) : elements;
  const empty = targets.length === 0;

  useEffect(() => {
    if (open) {
      setOnlySelection(selectedIds.length > 0);
      setImageTheme(theme);
      setError(null);
    }
    // Ao abrir, a opção "só a seleção" começa marcada se houver seleção.
  }, [open]);

  // Prévia do que vai sair (PNG e SVG usam o mesmo desenho).
  useEffect(() => {
    if (!open || format === 'json' || empty) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    buildScene(targets, background, imageTheme)
      .then((scene) => {
        if (cancelled || !scene) return;
        url = URL.createObjectURL(new Blob([scene.markup], { type: 'image/svg+xml' }));
        setPreview(url);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // targets muda de identidade a cada render; dependemos do que define o conteúdo.
  }, [open, format, background, imageTheme, useSelection, elements, empty]);

  const download = async () => {
    setError(null);
    if (format === 'json') {
      onExportJson();
      onClose();
      return;
    }
    if (empty) return;
    setBusy(true);
    try {
      const scene = await buildScene(targets, background, imageTheme);
      if (!scene) throw new Error('vazio');
      if (format === 'svg') {
        const name = fileNameFor(boardName, '.svg');
        downloadText(scene.markup, name, 'image/svg+xml');
        onDone(`SVG exportado: ${name}`);
      } else {
        const { rasterizeSvg } = await import('../export/exportScene');
        const blob = await rasterizeSvg(scene, scale);
        const name = fileNameFor(boardName, '.png');
        downloadBlob(blob, name);
        onDone(`PNG exportado: ${name}`);
      }
      onClose();
    } catch {
      setError('Não foi possível gerar a imagem. Tente uma escala menor ou exporte em SVG.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Exportar"
      onClose={onClose}
      testId="export-dialog"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void download()}
            disabled={busy || (format !== 'json' && empty)}
          >
            {busy ? 'Gerando…' : `Baixar ${format.toUpperCase()}`}
          </button>
        </>
      }
    >
      <div className="form-row">
        <span className="group-label" id="export-format">
          Formato
        </span>
        <div className="choice-row" role="radiogroup" aria-labelledby="export-format">
          {(
            [
              ['png', 'PNG (imagem)'],
              ['svg', 'SVG (vetor)'],
              ['json', 'Arquivo do quadro (.aurora.json)'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="export-format" checked={format === value} onChange={() => setFormat(value)} />
              <span className="face">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {format === 'json' ? (
        <p className="muted">
          Salva o quadro inteiro num arquivo JSON legível, que pode ser importado de volta aqui ou em outro navegador.
          É o jeito de fazer backup e de passar o quadro para outra pessoa.
        </p>
      ) : (
        <>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="export-preview" aria-hidden={!preview}>
            {empty ? (
              <span className="muted">O quadro está vazio: nada para exportar.</span>
            ) : preview ? (
              <img src={preview} alt="Prévia da exportação" />
            ) : (
              <span className="muted">Gerando prévia…</span>
            )}
          </div>
          <div className="form-row">
            <label className="check">
              <input
                type="checkbox"
                checked={useSelection}
                disabled={!hasSelection}
                onChange={(e) => setOnlySelection(e.target.checked)}
              />
              Só a seleção {hasSelection ? `(${selectedIds.length})` : '(nada selecionado)'}
            </label>
          </div>
          <div className="form-row">
            <span className="group-label" id="export-theme">
              Cores
            </span>
            <div className="choice-row" role="radiogroup" aria-labelledby="export-theme">
              {(
                [
                  ['light', 'Tema claro'],
                  ['dark', 'Tema escuro'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="choice">
                  <input type="radio" name="export-theme" checked={imageTheme === value} onChange={() => setImageTheme(value)} />
                  <span className="face">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-row">
            <label className="check">
              <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} />
              Incluir o fundo da lousa (desmarcado: fundo transparente)
            </label>
          </div>
          {format === 'png' && (
            <div className="form-row">
              <span className="group-label" id="export-scale">
                Resolução
              </span>
              <div className="choice-row" role="radiogroup" aria-labelledby="export-scale">
                {[1, 2, 3].map((s) => (
                  <label key={s} className="choice">
                    <input type="radio" name="export-scale" checked={scale === s} onChange={() => setScale(s)} />
                    <span className="face">{s}×</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
