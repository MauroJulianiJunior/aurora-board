import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas } from './editor/Canvas';
import { boardSnapshot, editorReducer, initialEditorState } from './editor/editorState';
import { isTypingTarget, resolveShortcut, type Command } from './editor/shortcuts';
import { fitViewport, nextZoomStep, screenCenterWorld, zoomAt } from './editor/viewport';
import { downloadText, readFileText } from './export/download';
import { DEFAULT_VIEWPORT, LIMITS } from './model/constants';
import { createId, createLinear, createShapeAt, createText, describeElement } from './model/elements';
import { boardFileName, parseClipboard, serializeBoards, serializeClipboard } from './model/fileFormat';
import { getCommonBounds } from './model/geometry';
import {
  applyStyle,
  cloneElements,
  connectElements,
  deleteElements,
  duplicateElements,
  moveElements,
  pasteElements,
  reorderElements,
  setElementText,
  type ReorderDirection,
} from './model/operations';
import { createSampleBoard } from './model/sample';
import { createCanvasMeasure, sanitizeText } from './model/text';
import { isTheme, type Theme } from './model/theme';
import { isBoxElement, type Board, type BoardSummary, type ShapeType, type StyleState, type Tool } from './model/types';
import { parseBoardFile } from './model/validate';
import {
  createMemoryRepository,
  describeStorageError,
  openIndexedDbRepository,
  type BoardRepository,
} from './storage/repository';
import { applyTheme, readCachedTheme } from './ui/applyTheme';
import { BoardsPanel } from './ui/BoardsPanel';
import {
  BoardTitle,
  EmptyState,
  FatalScreen,
  LoadingScreen,
  SaveIndicator,
  Toasts,
  ViewControls,
  ZoomControls,
  type SaveStatus,
  type Toast,
} from './ui/Chrome';
import { ExportDialog } from './ui/ExportDialog';
import { HelpDialog } from './ui/HelpDialog';
import { Icon } from './ui/Icons';
import { Modal } from './ui/Modal';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Toolbar } from './ui/Toolbar';

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'fatal'; message: string };
type DialogState = null | 'boards' | 'export' | 'help' | { kind: 'delete'; board: BoardSummary };

const SHAPE_TOOLS: Tool[] = ['rectangle', 'ellipse', 'diamond'];

function newBoard(name: string): Board {
  const now = Date.now();
  return { id: createId(), name, createdAt: now, updatedAt: now, elements: [], viewport: { ...DEFAULT_VIEWPORT }, isSample: false };
}

/** Espera as fontes da lousa (a medida do texto depende delas), sem travar se demorarem. */
async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  const fonts = ['500 16px Inter', '700 16px "Space Grotesk"', '500 16px "IBM Plex Mono"', '600 16px Inter'];
  await Promise.race([
    Promise.all(fonts.map((f) => document.fonts.load(f))).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}

export function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const repoRef = useRef<BoardRepository | null>(null);
  const [storageKind, setStorageKind] = useState<'indexeddb' | 'memory'>('indexeddb');
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  // Tema da cópia local (a mais recente); o IndexedDB só decide se ela não existir.
  const cachedTheme = useRef(readCachedTheme());
  const [theme, setTheme] = useState<Theme>(() => cachedTheme.current ?? 'light');
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [focusMode, setFocusMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [announcement, setAnnouncement] = useState('');

  const measure = useMemo(() => createCanvasMeasure(), []);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const screenSize = useRef({ width: window.innerWidth, height: window.innerHeight });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRevision = useRef(0);
  const savedContent = useRef<{ elements: unknown; name: string | undefined }>({ elements: null, name: undefined });
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const toastId = useRef(0);
  const booted = useRef(false);

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 9000 : 4000);
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const focusCanvas = () => requestAnimationFrame(() => svgRef.current?.focus({ preventScroll: true }));

  const refreshBoards = useCallback(async () => {
    const repo = repoRef.current;
    if (!repo) return;
    try {
      setBoards(await repo.listBoards());
    } catch (err) {
      notify('error', describeStorageError(err));
    }
  }, [notify]);

  // ─── Salvamento ────────────────────────────────────────────────────────

  /** Grava o quadro aberto agora (em fila: nunca duas gravações ao mesmo tempo). */
  const saveNow = useCallback(async (): Promise<boolean> => {
    const repo = repoRef.current;
    const s = stateRef.current;
    if (!repo || !s.board) return true;
    if (s.revision === savedRevision.current && saveStatusRef.current !== 'error') return true;
    const snapshot = boardSnapshot(s)!;
    const revision = s.revision;
    const run = async () => {
      if (repo.kind !== 'memory') setSaveStatus('saving');
      try {
        await repo.saveBoard(snapshot);
        if (stateRef.current.board?.id === snapshot.id) {
          savedRevision.current = Math.max(savedRevision.current, revision);
          savedContent.current = { elements: snapshot.elements, name: snapshot.name };
        }
        if (stateRef.current.revision === revision) setSaveStatus(repo.kind === 'memory' ? 'memory' : 'saved');
        return true;
      } catch (err) {
        setSaveStatus('error');
        notify('error', describeStorageError(err));
        return false;
      }
    };
    const p = saveChain.current.then(run, run);
    saveChain.current = p;
    return p;
  }, [notify]);

  // Salvamento automático: meio segundo depois da última alteração.
  useEffect(() => {
    if (phase.kind !== 'ready' || !state.board) return;
    if (state.revision === savedRevision.current) return;
    const contentChanged = state.elements !== savedContent.current.elements || state.board.name !== savedContent.current.name;
    if (contentChanged && repoRef.current?.kind !== 'memory') setSaveStatus('pending');
    const timer = window.setTimeout(() => void saveNow(), 500);
    return () => window.clearTimeout(timer);
  }, [phase.kind, state.revision, state.board, state.elements, saveNow]);

  // Ao esconder a aba ou fechar, grava o que estiver pendente.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void saveNow();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      void saveNow();
      if (saveStatusRef.current === 'error' || repoRef.current?.kind === 'memory') {
        if (stateRef.current.elements.length > 0) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [saveNow]);

  const loadBoard = useCallback((board: Board) => {
    dispatch({ type: 'load', board });
    savedRevision.current = 0;
    savedContent.current = { elements: board.elements, name: board.name };
    setSaveStatus(repoRef.current?.kind === 'memory' ? 'memory' : 'saved');
    void repoRef.current?.setSetting('lastBoardId', board.id).catch(() => undefined);
  }, []);

  /** Enquadra os elementos na tela (usado ao abrir exemplo e importação). */
  const fitted = (board: Board): Board => {
    const bounds = getCommonBounds(board.elements);
    if (!bounds) return board;
    return { ...board, viewport: fitViewport(bounds, screenSize.current.width, screenSize.current.height, 96) };
  };

  // ─── Inicialização ────────────────────────────────────────────────────

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        await loadFonts();
        let repo: BoardRepository;
        try {
          repo = await openIndexedDbRepository();
        } catch (err) {
          repo = createMemoryRepository();
          setStorageWarning(
            `${describeStorageError(err)} Os quadros desta aba não serão guardados: exporte em JSON antes de fechar.`,
          );
        }
        repoRef.current = repo;
        setStorageKind(repo.kind);
        const grid = await repo.getSetting('showGrid');
        if (typeof grid === 'boolean') setShowGrid(grid);
        if (cachedTheme.current === null) {
          const savedTheme = await repo.getSetting('theme');
          if (isTheme(savedTheme)) setTheme(savedTheme);
        }
        const lastId = await repo.getSetting('lastBoardId');
        let board = typeof lastId === 'string' ? await repo.getBoard(lastId) : null;
        if (!board) {
          const list = await repo.listBoards();
          if (list[0]) board = await repo.getBoard(list[0].id);
        }
        if (!board) {
          board = newBoard('Meu primeiro quadro');
          await repo.saveBoard(board);
        }
        loadBoard(board);
        setBoards(await repo.listBoards());
        setPhase({ kind: 'ready' });
      } catch (err) {
        setPhase({ kind: 'fatal', message: describeStorageError(err) });
      }
    })();
  }, [loadBoard]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.title = state.board ? `${state.board.name} — Aurora Board` : 'Aurora Board';
  }, [state.board]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ─── Quadros ──────────────────────────────────────────────────────────

  const openBoard = async (id: string) => {
    const repo = repoRef.current;
    if (!repo) return;
    if (id === stateRef.current.board?.id) {
      setDialog(null);
      return;
    }
    await saveNow();
    const board = await repo.getBoard(id).catch(() => null);
    if (!board) {
      notify('error', 'Não foi possível abrir esse quadro.');
      void refreshBoards();
      return;
    }
    loadBoard(board);
    setDialog(null);
    focusCanvas();
  };

  const createBoard = async () => {
    const repo = repoRef.current;
    if (!repo) return;
    await saveNow();
    const board = newBoard('Quadro sem título');
    try {
      await repo.saveBoard(board);
    } catch (err) {
      notify('error', describeStorageError(err));
      return;
    }
    loadBoard(board);
    setDialog(null);
    void refreshBoards();
    notify('success', 'Quadro novo criado.');
    focusCanvas();
  };

  const createSample = async () => {
    const repo = repoRef.current;
    if (!repo) return;
    await saveNow();
    const board = fitted(createSampleBoard(measure));
    try {
      await repo.saveBoard(board);
    } catch (err) {
      notify('error', describeStorageError(err));
      return;
    }
    loadBoard(board);
    setDialog(null);
    void refreshBoards();
    notify('success', 'Quadro de exemplo criado. Pode apagar quando quiser.');
    focusCanvas();
  };

  const renameBoard = async (id: string, name: string) => {
    const repo = repoRef.current;
    if (!repo) return;
    if (id === stateRef.current.board?.id) {
      dispatch({ type: 'rename', name });
      setBoards((list) => list.map((b) => (b.id === id ? { ...b, name } : b)));
      return;
    }
    try {
      const board = await repo.getBoard(id);
      if (!board) return;
      await repo.saveBoard({ ...board, name, updatedAt: Date.now() });
      void refreshBoards();
    } catch (err) {
      notify('error', describeStorageError(err));
    }
  };

  const getBoardForExport = async (id: string): Promise<Board | null> => {
    await saveNow();
    if (id === stateRef.current.board?.id) return boardSnapshot(stateRef.current);
    return repoRef.current ? repoRef.current.getBoard(id) : null;
  };

  const duplicateBoard = async (id: string) => {
    const repo = repoRef.current;
    const source = await getBoardForExport(id);
    if (!repo || !source) return;
    const now = Date.now();
    const copy: Board = {
      ...source,
      id: createId(),
      name: `Cópia de ${source.name}`.slice(0, LIMITS.maxNameLength),
      elements: cloneElements(source.elements, { x: 0, y: 0 }).clones,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await repo.saveBoard(copy);
      void refreshBoards();
      notify('success', `“${copy.name}” criado.`);
    } catch (err) {
      notify('error', describeStorageError(err));
    }
  };

  const exportBoardJson = async (id: string) => {
    const board = await getBoardForExport(id);
    if (!board) return;
    const name = boardFileName(board.name);
    downloadText(serializeBoards([board]), name, 'application/json');
    notify('success', `Arquivo do quadro exportado: ${name}`);
  };

  const exportAll = async () => {
    const repo = repoRef.current;
    if (!repo) return;
    await saveNow();
    try {
      const list = await repo.listBoards();
      const all = (await Promise.all(list.map((b) => repo.getBoard(b.id)))).filter((b): b is Board => b !== null);
      const date = new Date().toISOString().slice(0, 10);
      downloadText(serializeBoards(all), `aurora-board-backup-${date}.aurora.json`, 'application/json');
      notify('success', `Backup com ${all.length} ${all.length === 1 ? 'quadro' : 'quadros'} exportado.`);
    } catch (err) {
      notify('error', describeStorageError(err));
    }
  };

  const deleteBoard = async (summary: BoardSummary) => {
    const repo = repoRef.current;
    if (!repo) return;
    setDialog('boards');
    const isCurrent = summary.id === stateRef.current.board?.id;
    try {
      if (isCurrent) await saveNow();
      await saveChain.current;
      await repo.deleteBoard(summary.id);
      if (isCurrent) {
        const list = await repo.listBoards();
        const next = list[0] ? await repo.getBoard(list[0].id) : null;
        const board = next ?? newBoard('Quadro sem título');
        if (!next) await repo.saveBoard(board);
        loadBoard(board);
      }
      void refreshBoards();
      notify('success', `Quadro “${summary.name}” excluído.`);
    } catch (err) {
      notify('error', describeStorageError(err));
    }
  };

  const importFiles = async (files: FileList | File[] | null) => {
    const file = files?.[0];
    const repo = repoRef.current;
    if (!file || !repo) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      notify('error', 'Escolha um arquivo .aurora.json exportado pelo Aurora Board.');
      return;
    }
    let text: string;
    try {
      text = await readFileText(file, LIMITS.maxFileBytes);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Não foi possível ler o arquivo.');
      return;
    }
    const result = parseBoardFile(text);
    if (!result.ok) {
      notify('error', `Não foi possível importar: ${result.error}`);
      return;
    }
    await saveNow();
    const now = Date.now();
    const created: Board[] = result.boards.map((b, i) => ({
      id: createId(),
      name: b.name,
      createdAt: now,
      updatedAt: now - i,
      elements: b.elements,
      viewport: b.viewport,
      isSample: false,
    }));
    try {
      for (const b of created) await repo.saveBoard(b);
    } catch (err) {
      notify('error', describeStorageError(err));
      return;
    }
    const first = fitted(created[0]!);
    loadBoard(first);
    setDialog(null);
    void refreshBoards();
    notify(
      'success',
      created.length === 1
        ? `Quadro “${first.name}” importado (${first.elements.length} ${first.elements.length === 1 ? 'elemento' : 'elementos'}).`
        : `${created.length} quadros importados. Veja a lista em Quadros.`,
    );
    focusCanvas();
  };

  // ─── Edição ───────────────────────────────────────────────────────────

  const commitText = (id: string, text: string) => {
    const s = stateRef.current;
    const editing = s.editing;
    if (!editing || editing.id !== id) return;
    const final = setElementText(s.elements, id, sanitizeText(text, LIMITS.maxTextLength), measure, { removeEmpty: true });
    const exists = final.some((el) => el.id === id);
    dispatch({ type: 'setElements', elements: final, record: editing.before, select: exists ? [id] : [] });
    dispatch({ type: 'stopEditing' });
  };

  const setStyle = (patch: Partial<StyleState>) => {
    dispatch({ type: 'style', patch });
    const s = stateRef.current;
    if (s.selectedIds.length > 0) {
      dispatch({ type: 'setElements', elements: applyStyle(s.elements, s.selectedIds, patch, measure), record: s.elements });
    }
  };

  const deleteSelection = () => {
    const s = stateRef.current;
    if (s.selectedIds.length === 0) return;
    const n = s.selectedIds.length;
    dispatch({ type: 'setElements', elements: deleteElements(s.elements, s.selectedIds), record: s.elements, select: [] });
    announce(n === 1 ? 'Elemento excluído. Ctrl+Z desfaz.' : `${n} elementos excluídos. Ctrl+Z desfaz.`);
  };

  const duplicateSelection = () => {
    const s = stateRef.current;
    if (s.selectedIds.length === 0) return;
    const { elements, newIds } = duplicateElements(s.elements, s.selectedIds);
    dispatch({ type: 'setElements', elements, record: s.elements, select: newIds });
    announce('Seleção duplicada');
  };

  const reorder = (direction: ReorderDirection) => {
    const s = stateRef.current;
    if (s.selectedIds.length === 0) return;
    dispatch({ type: 'setElements', elements: reorderElements(s.elements, s.selectedIds, direction), record: s.elements });
  };

  const connectSelection = () => {
    const s = stateRef.current;
    const [a, b] = s.selectedIds;
    if (!a || !b) return;
    const { elements, arrowId } = connectElements(s.elements, a, b, s.style);
    if (!arrowId) return;
    dispatch({ type: 'setElements', elements, record: s.elements, select: [arrowId] });
    announce('Seta criada ligando as duas formas');
  };

  const setViewportZoom = (zoom: number) => {
    const s = stateRef.current;
    const { width, height } = screenSize.current;
    dispatch({ type: 'viewport', viewport: zoomAt(s.viewport, zoom, { x: width / 2, y: height / 2 }) });
  };

  const zoomToFit = () => {
    const s = stateRef.current;
    const sel = s.elements.filter((el) => s.selectedIds.includes(el.id));
    const bounds = getCommonBounds(sel.length ? sel : s.elements);
    if (!bounds) {
      dispatch({ type: 'viewport', viewport: { ...DEFAULT_VIEWPORT } });
      return;
    }
    dispatch({ type: 'viewport', viewport: fitViewport(bounds, screenSize.current.width, screenSize.current.height) });
  };

  const toggleGrid = () => {
    setShowGrid((v) => {
      void repoRef.current?.setSetting('showGrid', !v).catch(() => undefined);
      return !v;
    });
  };

  const toggleTheme = () => {
    const next: Theme = themeRef.current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void repoRef.current?.setSetting('theme', next).catch(() => undefined);
    announce(next === 'dark' ? 'Tema escuro' : 'Tema claro');
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => notify('error', 'O navegador não permitiu a tela cheia.'));
  };

  /** Botão de ferramenta acionado pelo teclado: insere no centro da tela, já selecionado. */
  const insertAtCenter = (tool: Tool) => {
    const s = stateRef.current;
    const center = screenCenterWorld(s.viewport, screenSize.current.width, screenSize.current.height);
    if (SHAPE_TOOLS.includes(tool)) {
      const el = createShapeAt(tool as ShapeType, center, s.style);
      dispatch({ type: 'setElements', elements: [...s.elements, el], record: s.elements, select: [el.id] });
      dispatch({ type: 'tool', tool: 'select' });
      announce(`${describeElement(el)} inserido no centro. Enter edita o texto, setas movem.`);
      focusCanvas();
    } else if (tool === 'arrow' || tool === 'line') {
      const el = createLinear(tool, { x: center.x - 90, y: center.y }, { x: center.x + 90, y: center.y }, s.style);
      dispatch({ type: 'setElements', elements: [...s.elements, el], record: s.elements, select: [el.id] });
      dispatch({ type: 'tool', tool: 'select' });
      announce(`${describeElement(el)} inserida no centro.`);
      focusCanvas();
    } else if (tool === 'text') {
      const el = createText({ x: center.x - 60, y: center.y - s.style.fontSize * 0.6 }, '', s.style, measure);
      dispatch({ type: 'setElements', elements: [...s.elements, el], select: [el.id] });
      dispatch({ type: 'startEditing', editing: { id: el.id, before: s.elements } });
    }
  };

  const runCommand = (cmd: Command) => {
    const s = stateRef.current;
    switch (cmd.type) {
      case 'tool':
        dispatch({ type: 'tool', tool: cmd.tool });
        return;
      case 'undo':
        dispatch({ type: 'undo' });
        return;
      case 'redo':
        dispatch({ type: 'redo' });
        return;
      case 'delete':
        deleteSelection();
        return;
      case 'selectAll':
        dispatch({ type: 'tool', tool: 'select' });
        dispatch({ type: 'select', ids: s.elements.map((el) => el.id) });
        announce(`${s.elements.length} elementos selecionados`);
        return;
      case 'duplicate':
        duplicateSelection();
        return;
      case 'escape':
        if (s.tool !== 'select') dispatch({ type: 'tool', tool: 'select' });
        else if (s.selectedIds.length) dispatch({ type: 'select', ids: [] });
        return;
      case 'zoomIn':
        setViewportZoom(nextZoomStep(s.viewport.zoom, 1));
        return;
      case 'zoomOut':
        setViewportZoom(nextZoomStep(s.viewport.zoom, -1));
        return;
      case 'zoomReset':
        setViewportZoom(1);
        return;
      case 'zoomFit':
        zoomToFit();
        return;
      case 'nudge':
        if (s.selectedIds.length) {
          dispatch({ type: 'setElements', elements: moveElements(s.elements, s.selectedIds, cmd.dx, cmd.dy), record: s.elements });
        }
        return;
      case 'reorder':
        reorder(cmd.direction);
        return;
      case 'toggleGrid':
        toggleGrid();
        return;
      case 'toggleFocusMode':
        setFocusMode((v) => !v);
        return;
      case 'toggleTheme':
        toggleTheme();
        return;
      case 'help':
        setDialog('help');
        return;
      case 'save':
        void saveNow().then((ok) => ok && notify('success', repoRef.current?.kind === 'memory' ? 'Modo temporário: exporte em JSON para guardar.' : 'Salvo neste navegador.'));
        return;
      case 'export':
        setDialog('export');
        return;
      case 'editText': {
        const only = s.selectedIds.length === 1 ? s.elements.find((el) => el.id === s.selectedIds[0]) : undefined;
        if (only && isBoxElement(only)) dispatch({ type: 'startEditing', editing: { id: only.id, before: s.elements } });
        return;
      }
    }
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  // Atalhos globais (fora de campos de texto e com nenhum diálogo aberto).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phase.kind !== 'ready' || dialogRef.current || stateRef.current.editing) return;
      if (isTypingTarget(e.target)) return;
      const cmd = resolveShortcut(e);
      if (!cmd) return;
      const onControl = e.target instanceof HTMLElement && e.target.closest('button, a, input, [role="radio"]') !== null;
      if (onControl && (cmd.type === 'editText' || cmd.type === 'nudge')) return;
      e.preventDefault();
      runCommandRef.current(cmd);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase.kind]);

  // Copiar, recortar e colar (pelos eventos do navegador: não pede permissão de área de transferência).
  useEffect(() => {
    const blocked = (e: ClipboardEvent) =>
      phase.kind !== 'ready' || dialogRef.current !== null || stateRef.current.editing !== null || isTypingTarget(e.target);
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (blocked(e) || !e.clipboardData) return;
      const s = stateRef.current;
      const sel = s.elements.filter((el) => s.selectedIds.includes(el.id));
      if (sel.length === 0) return;
      e.clipboardData.setData('text/plain', serializeClipboard(sel));
      e.preventDefault();
      if (cut) {
        dispatch({ type: 'setElements', elements: deleteElements(s.elements, s.selectedIds), record: s.elements, select: [] });
        announce('Recortado');
      } else {
        announce(sel.length === 1 ? 'Copiado' : `${sel.length} elementos copiados`);
      }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (blocked(e) || !e.clipboardData) return;
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      const s = stateRef.current;
      const center = screenCenterWorld(s.viewport, screenSize.current.width, screenSize.current.height);
      const incoming = parseClipboard(text);
      if (incoming && incoming.length > 0) {
        const bounds = getCommonBounds(incoming)!;
        let offset = { x: center.x - (bounds.x + bounds.width / 2), y: center.y - (bounds.y + bounds.height / 2) };
        if (Math.abs(offset.x) < 12 && Math.abs(offset.y) < 12) offset = { x: 24, y: 24 };
        const { elements, newIds } = pasteElements(s.elements, incoming, offset);
        dispatch({ type: 'setElements', elements, record: s.elements, select: newIds });
        dispatch({ type: 'tool', tool: 'select' });
        dispatch({ type: 'select', ids: newIds });
        announce(newIds.length === 1 ? 'Colado' : `${newIds.length} elementos colados`);
        return;
      }
      const clean = sanitizeText(text, LIMITS.maxTextLength).trim();
      if (!clean) return;
      const el = createText({ x: center.x, y: center.y }, clean, s.style, measure);
      const placed = { ...el, x: center.x - el.width / 2, y: center.y - el.height / 2 };
      dispatch({ type: 'setElements', elements: [...s.elements, placed], record: s.elements, select: [placed.id] });
      announce('Texto colado na lousa');
    };
    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', paste);
    };
  }, [phase.kind, announce, measure]);

  const onResize = useCallback((size: { width: number; height: number }) => {
    screenSize.current = size;
  }, []);

  if (phase.kind === 'loading') return <LoadingScreen />;
  if (phase.kind === 'fatal') return <FatalScreen message={phase.message} />;

  const board = state.board;
  const selected = state.elements.filter((el) => state.selectedIds.includes(el.id));
  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const openImport = () => fileInputRef.current?.click();

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          void importFiles(e.dataTransfer.files);
        }
      }}
    >
      <Canvas
        state={state}
        dispatch={dispatch}
        measure={measure}
        showGrid={showGrid}
        theme={theme}
        svgRef={svgRef}
        onAnnounce={announce}
        onResize={onResize}
        onCommitText={commitText}
      />

      {state.elements.length === 0 && !focusMode && !state.editing && (
        <EmptyState onSample={() => void createSample()} onImport={openImport} />
      )}

      {focusMode ? (
        <div className="floating focus-exit">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFocusMode(false)}>
            <Icon name="focus" size={18} />
            Sair do modo foco <kbd>Alt+Z</kbd>
          </button>
        </div>
      ) : (
        <>
          {board && (
            <BoardTitle
              key={board.id}
              name={board.name}
              isSample={board.isSample}
              onRename={(name) => void renameBoard(board.id, name)}
              onOpenBoards={() => {
                void refreshBoards();
                setDialog('boards');
              }}
            />
          )}
          <Toolbar tool={state.tool} onSelect={(tool) => dispatch({ type: 'tool', tool })} onKeyboardInsert={insertAtCenter} />
          <div className="floating top-right">
            <button type="button" className="icon-btn" aria-label="Desfazer (Ctrl+Z)" title="Desfazer — Ctrl+Z" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
              <Icon name="undo" />
            </button>
            <button type="button" className="icon-btn" aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer — Ctrl+Shift+Z" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
              <Icon name="redo" />
            </button>
            <SaveIndicator status={saveStatus} onRetry={() => void saveNow()} />
            <button
              type="button"
              className="btn btn-sm btn-icon-only-narrow"
              onClick={openImport}
              aria-label="Importar"
              title="Importar um arquivo .aurora.json"
            >
              <Icon name="upload" size={18} />
              <span className="btn-label-optional" aria-hidden="true">
                Importar
              </span>
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog('export')} aria-haspopup="dialog">
              <Icon name="download" size={18} />
              Exportar
            </button>
            <button type="button" className="icon-btn" aria-label="Atalhos e ajuda (?)" title="Atalhos e ajuda — ?" onClick={() => setDialog('help')}>
              <Icon name="help" />
            </button>
          </div>
          <PropertiesPanel
            selected={state.editing ? [] : selected}
            tool={state.tool}
            style={state.style}
            theme={theme}
            onStyle={setStyle}
            onDelete={deleteSelection}
            onDuplicate={duplicateSelection}
            onReorder={reorder}
            onConnect={connectSelection}
          />
          <ZoomControls
            zoom={state.viewport.zoom}
            onZoomIn={() => setViewportZoom(nextZoomStep(state.viewport.zoom, 1))}
            onZoomOut={() => setViewportZoom(nextZoomStep(state.viewport.zoom, -1))}
            onReset={() => setViewportZoom(1)}
            onFit={zoomToFit}
          />
          <ViewControls
            showGrid={showGrid}
            fullscreen={fullscreen}
            dark={theme === 'dark'}
            onToggleGrid={toggleGrid}
            onToggleTheme={toggleTheme}
            onFocusMode={() => setFocusMode(true)}
            onToggleFullscreen={toggleFullscreen}
          />
        </>
      )}

      {storageWarning && (
        <div className="banner" role="alert">
          <Icon name="alert" size={18} />
          <span>{storageWarning}</span>
          <button type="button" className="icon-btn" aria-label="Fechar aviso" onClick={() => setStorageWarning(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-testid="import-input"
        onChange={(e) => {
          const files = e.target.files ? [...e.target.files] : null;
          e.target.value = '';
          void importFiles(files);
        }}
      />

      <BoardsPanel
        open={dialog === 'boards'}
        onClose={() => setDialog(null)}
        boards={boards}
        currentId={board?.id ?? null}
        storageKind={storageKind}
        onOpenBoard={(id) => void openBoard(id)}
        onCreate={() => void createBoard()}
        onCreateSample={() => void createSample()}
        onRename={(id, name) => void renameBoard(id, name)}
        onDuplicate={(id) => void duplicateBoard(id)}
        onExport={(id) => void exportBoardJson(id)}
        onDelete={(b) => setDialog({ kind: 'delete', board: b })}
        onImport={openImport}
        onExportAll={() => void exportAll()}
      />
      <ExportDialog
        open={dialog === 'export'}
        onClose={() => setDialog(null)}
        boardName={board?.name ?? 'quadro'}
        elements={state.elements}
        selectedIds={state.selectedIds}
        theme={theme}
        onExportJson={() => board && void exportBoardJson(board.id)}
        onDone={(message) => notify('success', message)}
      />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
      <Modal
        open={typeof dialog === 'object' && dialog !== null}
        title="Excluir quadro?"
        alert
        onClose={() => setDialog('boards')}
        testId="confirm-delete"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDialog('boards')} autoFocus>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => typeof dialog === 'object' && dialog && void deleteBoard(dialog.board)}
            >
              Excluir quadro
            </button>
          </>
        }
      >
        {typeof dialog === 'object' && dialog && (
          <p>
            O quadro <strong>“{dialog.board.name}”</strong> ({dialog.board.elementCount}{' '}
            {dialog.board.elementCount === 1 ? 'elemento' : 'elementos'}) será apagado deste navegador. Não dá para desfazer.
            Se quiser guardar uma cópia, exporte antes.
          </p>
        )}
      </Modal>
    </div>
  );
}

