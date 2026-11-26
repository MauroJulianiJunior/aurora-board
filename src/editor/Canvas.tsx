// A lousa: um <svg> que ocupa a tela. Converte ponteiro, roda do mouse e teclado em operações do
// modelo (src/model/operations.ts) e despacha para o estado do editor.
import { useEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import { createFreedraw, createLinear, createShape, createShapeAt, createText, describeElement } from '../model/elements';
import {
  bindableAtPoint,
  distance,
  elementAtPoint,
  elementsInBox,
  getCommonBounds,
  HANDLE_IDS,
  handlePosition,
  normalizeBox,
  resizeBox,
  snapAngle,
  type HandleId,
} from '../model/geometry';
import { computeBoundPoints, deleteElements, moveElements, scaleElements, setElementText } from '../model/operations';
import type { MeasureText } from '../model/text';
import type { Theme } from '../model/theme';
import {
  isBoxElement,
  isLinear,
  isShape,
  type BoardElement,
  type Box,
  type FreedrawElement,
  type LinearElement,
  type Point,
  type ShapeElement,
  type Viewport,
} from '../model/types';
import { ElementView } from '../render/ElementView';
import type { EditorAction, EditorState } from './editorState';
import { TextEditor } from './TextEditor';
import { screenToWorld, worldToScreen, zoomAt } from './viewport';

type Interaction =
  | { kind: 'pan'; startScreen: Point; startViewport: Viewport }
  | { kind: 'move'; startWorld: Point; before: BoardElement[]; ids: string[]; moved: boolean }
  | { kind: 'marquee'; startWorld: Point; base: string[] }
  | { kind: 'resize'; handle: HandleId; startWorld: Point; before: BoardElement[]; ids: string[]; from: Box; textOnly: boolean }
  | { kind: 'endpoint'; index: 0 | 1; element: LinearElement; before: BoardElement[] }
  | { kind: 'create-shape'; element: ShapeElement; startWorld: Point; before: BoardElement[] }
  | { kind: 'create-linear'; element: LinearElement; startWorld: Point; before: BoardElement[] }
  | { kind: 'freedraw'; element: FreedrawElement; before: BoardElement[] }
  | { kind: 'erase'; ids: Set<string>; before: BoardElement[] };

const HANDLE_SIZE = 10;
const HANDLE_HIT = 10;
const CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

export interface CanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  measure: MeasureText;
  showGrid: boolean;
  theme: Theme;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onAnnounce: (message: string) => void;
  onResize: (size: { width: number; height: number }) => void;
  onCommitText: (id: string, text: string) => void;
}

export function Canvas({ state, dispatch, measure, showGrid, theme, svgRef, onAnnounce, onResize, onCommitText }: CanvasProps) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const interaction = useRef<Interaction | null>(null);
  const spaceDown = useRef(false);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [bindTarget, setBindTarget] = useState<string | null>(null);
  const [erasing, setErasing] = useState<ReadonlySet<string>>(new Set());
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const { elements, viewport, selectedIds, tool, editing } = state;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selected = useMemo(() => elements.filter((el) => selectedSet.has(el.id)), [elements, selectedSet]);

  // Tamanho da tela, para enquadrar e para inserir no centro.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) onResize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef, onResize]);

  // Roda: rola a lousa; Ctrl+roda (ou pinça no touchpad): zoom no ponto do cursor.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      const rect = svg.getBoundingClientRect();
      const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        const delta = Math.max(-100, Math.min(100, e.deltaY * unit));
        dispatch({ type: 'viewport', viewport: zoomAt(s.viewport, s.viewport.zoom * Math.exp(-delta * 0.0025), sp) });
        return;
      }
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      dispatch({
        type: 'viewport',
        viewport: { ...s.viewport, x: s.viewport.x + dx / s.viewport.zoom, y: s.viewport.y + dy / s.viewport.zoom },
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, dispatch]);

  // Segurar Espaço = mão temporária (só com o foco na lousa ou em lugar nenhum, para não roubar o
  // Espaço dos botões).
  useEffect(() => {
    const isFree = (t: EventTarget | null) => t === document.body || t === svgRef.current || t === null;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && isFree(e.target) && !stateRef.current.editing) {
        e.preventDefault();
        spaceDown.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        setSpaceHeld(false);
      }
    };
    const blur = () => {
      spaceDown.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [svgRef]);

  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const tolerance = () => 6 / stateRef.current.viewport.zoom;

  /** Alça de redimensionar (ou ponta de seta) sob o ponto da tela. */
  const handleAt = (sp: Point, s: EditorState): { kind: 'box'; handle: HandleId } | { kind: 'point'; index: 0 | 1 } | null => {
    const sel = s.elements.filter((el) => s.selectedIds.includes(el.id));
    if (sel.length === 0 || s.editing) return null;
    const only = sel[0]!;
    if (sel.length === 1 && isLinear(only)) {
      for (const index of [0, 1] as const) {
        if (distance(worldToScreen(only.points[index], s.viewport), sp) <= HANDLE_HIT) return { kind: 'point', index };
      }
      return null;
    }
    const bounds = getCommonBounds(sel);
    if (!bounds) return null;
    const screenBox = selectionScreenBox(bounds, s.viewport);
    for (const handle of visibleHandles(screenBox)) {
      if (distance(handlePosition(screenBox, handle), sp) <= HANDLE_HIT) return { kind: 'box', handle };
    }
    return null;
  };

  const eraseAt = (it: Extract<Interaction, { kind: 'erase' }>, wp: Point) => {
    const hit = elementAtPoint(stateRef.current.elements, wp, 10 / stateRef.current.viewport.zoom);
    if (hit && !it.ids.has(hit.id)) {
      it.ids.add(hit.id);
      setErasing(new Set(it.ids));
    }
  };

  const startTextAt = (wp: Point) => {
    const s = stateRef.current;
    const el = createText({ x: wp.x, y: wp.y - s.style.fontSize * 0.62 }, '', s.style, measure);
    dispatch({ type: 'setElements', elements: [...s.elements, el], select: [el.id] });
    dispatch({ type: 'startEditing', editing: { id: el.id, before: s.elements } });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const svg = svgRef.current;
    if (!svg) return;
    const s = stateRef.current;
    if (s.editing) {
      // Clicar fora conclui a edição (o blur da caixa de texto grava).
      svg.focus({ preventScroll: true });
      return;
    }
    svg.focus({ preventScroll: true });
    svg.setPointerCapture(e.pointerId);
    const sp = screenPoint(e);
    const wp = screenToWorld(sp, s.viewport);

    if (e.button === 1 || s.tool === 'hand' || spaceDown.current) {
      e.preventDefault();
      interaction.current = { kind: 'pan', startScreen: sp, startViewport: s.viewport };
      setPanning(true);
      return;
    }

    switch (s.tool) {
      case 'select': {
        const handle = handleAt(sp, s);
        if (handle?.kind === 'point') {
          const el = s.elements.find((x) => x.id === s.selectedIds[0]);
          if (el && isLinear(el)) interaction.current = { kind: 'endpoint', index: handle.index, element: el, before: s.elements };
          return;
        }
        if (handle?.kind === 'box') {
          const sel = s.elements.filter((x) => s.selectedIds.includes(x.id));
          interaction.current = {
            kind: 'resize',
            handle: handle.handle,
            startWorld: wp,
            before: s.elements,
            ids: sel.map((x) => x.id),
            from: getCommonBounds(sel)!,
            textOnly: sel.every((x) => x.type === 'text'),
          };
          return;
        }
        const hit = elementAtPoint(s.elements, wp, tolerance(), new Set(s.selectedIds));
        if (hit) {
          let ids = s.selectedIds;
          if (e.shiftKey) {
            if (ids.includes(hit.id)) {
              dispatch({ type: 'select', ids: ids.filter((id) => id !== hit.id) });
              return;
            }
            ids = [...ids, hit.id];
          } else if (!ids.includes(hit.id)) {
            ids = [hit.id];
          }
          if (ids !== s.selectedIds) {
            dispatch({ type: 'select', ids });
            onAnnounce(ids.length === 1 ? `${describeElement(hit)} selecionado` : `${ids.length} elementos selecionados`);
          }
          interaction.current = { kind: 'move', startWorld: wp, before: s.elements, ids, moved: false };
        } else {
          if (!e.shiftKey && s.selectedIds.length > 0) dispatch({ type: 'select', ids: [] });
          interaction.current = { kind: 'marquee', startWorld: wp, base: e.shiftKey ? s.selectedIds : [] };
        }
        return;
      }
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        const el = createShape(s.tool, { x: wp.x, y: wp.y, width: 0, height: 0 }, s.style);
        dispatch({ type: 'setElements', elements: [...s.elements, el], select: [el.id] });
        interaction.current = { kind: 'create-shape', element: el, startWorld: wp, before: s.elements };
        return;
      }
      case 'arrow':
      case 'line': {
        const start = s.tool === 'arrow' ? bindableAtPoint(s.elements, wp, tolerance()) : null;
        const el: LinearElement = { ...createLinear(s.tool, wp, wp, s.style), startBinding: start?.id ?? null };
        dispatch({ type: 'setElements', elements: [...s.elements, el], select: [el.id] });
        interaction.current = { kind: 'create-linear', element: el, startWorld: wp, before: s.elements };
        return;
      }
      case 'freedraw': {
        const el = createFreedraw([wp], s.style);
        dispatch({ type: 'setElements', elements: [...s.elements, el], select: [] });
        interaction.current = { kind: 'freedraw', element: el, before: s.elements };
        return;
      }
      case 'text': {
        // Sem isto, o mousedown que vem depois devolve o foco à lousa e a caixa de texto recém-aberta
        // perde o foco (e o texto vazio é descartado).
        e.preventDefault();
        const hit = elementAtPoint(s.elements, wp, tolerance());
        if (hit && isBoxElement(hit)) {
          dispatch({ type: 'startEditing', editing: { id: hit.id, before: s.elements } });
        } else {
          startTextAt(wp);
        }
        return;
      }
      case 'eraser': {
        const it: Interaction = { kind: 'erase', ids: new Set(), before: s.elements };
        interaction.current = it;
        eraseAt(it, wp);
        return;
      }
    }
  };

  const updateHover = (sp: Point, wp: Point) => {
    const s = stateRef.current;
    if (s.tool === 'select') {
      const handle = handleAt(sp, s);
      if (handle?.kind === 'box') setHoverCursor(CURSORS[handle.handle]);
      else if (handle?.kind === 'point') setHoverCursor('crosshair');
      else setHoverCursor(elementAtPoint(s.elements, wp, tolerance(), new Set(s.selectedIds)) ? 'move' : null);
    } else if (s.tool === 'arrow') {
      setBindTarget(bindableAtPoint(s.elements, wp, tolerance())?.id ?? null);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = stateRef.current;
    const sp = screenPoint(e);
    const wp = screenToWorld(sp, s.viewport);
    const it = interaction.current;
    if (!it) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') updateHover(sp, wp);
      return;
    }
    switch (it.kind) {
      case 'pan': {
        const z = it.startViewport.zoom;
        dispatch({
          type: 'viewport',
          viewport: {
            ...it.startViewport,
            x: it.startViewport.x - (sp.x - it.startScreen.x) / z,
            y: it.startViewport.y - (sp.y - it.startScreen.y) / z,
          },
        });
        return;
      }
      case 'move': {
        const dx = wp.x - it.startWorld.x;
        const dy = wp.y - it.startWorld.y;
        if (!it.moved && Math.hypot(dx, dy) * s.viewport.zoom < 3) return;
        it.moved = true;
        dispatch({ type: 'setElements', elements: moveElements(it.before, it.ids, dx, dy) });
        return;
      }
      case 'marquee': {
        const box = normalizeBox(it.startWorld, wp);
        setMarquee(box);
        const inside = elementsInBox(s.elements, box).map((el) => el.id);
        const ids = it.base.length ? [...new Set([...it.base, ...inside])] : inside;
        if (ids.length !== s.selectedIds.length || ids.some((id, i) => id !== s.selectedIds[i])) {
          dispatch({ type: 'select', ids });
        }
        return;
      }
      case 'resize': {
        const to = resizeBox(it.from, it.handle, wp.x - it.startWorld.x, wp.y - it.startWorld.y, e.shiftKey || it.textOnly);
        dispatch({ type: 'setElements', elements: scaleElements(it.before, it.ids, it.from, to, measure) });
        return;
      }
      case 'endpoint': {
        const other = it.element.points[it.index === 0 ? 1 : 0];
        const target = e.shiftKey ? snapAngle(other, wp) : wp;
        const otherBinding = it.index === 0 ? it.element.endBinding : it.element.startBinding;
        const bind =
          it.element.type === 'arrow'
            ? bindableAtPoint(it.before, target, tolerance(), new Set(otherBinding ? [otherBinding] : []))
            : null;
        setBindTarget(bind?.id ?? null);
        const points: [Point, Point] = it.index === 0 ? [target, it.element.points[1]] : [it.element.points[0], target];
        const updated: LinearElement = {
          ...it.element,
          points,
          ...(it.index === 0 ? { startBinding: bind?.id ?? null } : { endBinding: bind?.id ?? null }),
        };
        const byId = new Map(it.before.map((el) => [el.id, el] as const));
        const final = computeBoundPoints(updated, byId);
        dispatch({ type: 'setElements', elements: it.before.map((el) => (el.id === final.id ? final : el)) });
        return;
      }
      case 'create-shape': {
        let end = wp;
        if (e.shiftKey) {
          const side = Math.max(Math.abs(wp.x - it.startWorld.x), Math.abs(wp.y - it.startWorld.y));
          end = {
            x: it.startWorld.x + side * Math.sign(wp.x - it.startWorld.x || 1),
            y: it.startWorld.y + side * Math.sign(wp.y - it.startWorld.y || 1),
          };
        }
        const box = normalizeBox(it.startWorld, end);
        it.element = { ...it.element, ...box };
        dispatch({ type: 'setElements', elements: [...it.before, it.element] });
        return;
      }
      case 'create-linear': {
        const start = it.startWorld;
        const end = e.shiftKey ? snapAngle(start, wp) : wp;
        const exclude = new Set(it.element.startBinding ? [it.element.startBinding] : []);
        const bind = it.element.type === 'arrow' ? bindableAtPoint(it.before, end, tolerance(), exclude) : null;
        setBindTarget(bind?.id ?? null);
        const byId = new Map(it.before.map((el) => [el.id, el] as const));
        it.element = computeBoundPoints({ ...it.element, points: [start, end], endBinding: bind?.id ?? null }, byId);
        dispatch({ type: 'setElements', elements: [...it.before, it.element] });
        return;
      }
      case 'freedraw': {
        const last = it.element.points[it.element.points.length - 1]!;
        if (distance(last, wp) * s.viewport.zoom < 1.5) return;
        if (it.element.points.length >= 5000) return;
        it.element = { ...it.element, points: [...it.element.points, wp] };
        dispatch({ type: 'setElements', elements: [...it.before, it.element] });
        return;
      }
      case 'erase':
        eraseAt(it, wp);
        return;
    }
  };

  const finish = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const it = interaction.current;
    interaction.current = null;
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (!it) return;
    const s = stateRef.current;
    switch (it.kind) {
      case 'pan':
        setPanning(false);
        return;
      case 'move':
        if (it.moved) dispatch({ type: 'record', before: it.before });
        return;
      case 'marquee':
        setMarquee(null);
        if (s.selectedIds.length > 0) {
          onAnnounce(`${s.selectedIds.length} ${s.selectedIds.length === 1 ? 'elemento selecionado' : 'elementos selecionados'}`);
        }
        return;
      case 'resize':
        dispatch({ type: 'record', before: it.before });
        return;
      case 'endpoint':
        setBindTarget(null);
        dispatch({ type: 'record', before: it.before });
        return;
      case 'create-shape': {
        let el = it.element;
        const tiny = el.width * s.viewport.zoom < 8 && el.height * s.viewport.zoom < 8;
        if (cancelled && tiny) {
          dispatch({ type: 'setElements', elements: it.before, select: [] });
          return;
        }
        if (tiny) el = { ...createShapeAt(el.type, it.startWorld, s.style), id: el.id };
        dispatch({ type: 'setElements', elements: [...it.before, el], record: it.before, select: [el.id] });
        dispatch({ type: 'tool', tool: 'select' });
        onAnnounce(`${describeElement(el)} criado. Enter edita o texto.`);
        return;
      }
      case 'create-linear': {
        setBindTarget(null);
        const el = it.element;
        if (cancelled || distance(el.points[0], el.points[1]) * s.viewport.zoom < 8) {
          dispatch({ type: 'setElements', elements: it.before, select: [] });
          return;
        }
        dispatch({ type: 'setElements', elements: [...it.before, el], record: it.before, select: [el.id] });
        dispatch({ type: 'tool', tool: 'select' });
        const linked = [el.startBinding, el.endBinding].filter(Boolean).length;
        onAnnounce(
          linked === 2 ? 'Seta criada ligando as duas formas' : `${describeElement(el)} criada${linked ? ', com uma ponta ligada' : ''}`,
        );
        return;
      }
      case 'freedraw':
        dispatch({ type: 'setElements', elements: [...it.before, it.element], record: it.before, select: [] });
        return;
      case 'erase':
        setErasing(new Set());
        if (it.ids.size > 0) {
          dispatch({ type: 'setElements', elements: deleteElements(s.elements, it.ids), record: it.before });
          onAnnounce(it.ids.size === 1 ? '1 elemento apagado' : `${it.ids.size} elementos apagados`);
        }
        return;
    }
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const s = stateRef.current;
    if (s.tool !== 'select' || s.editing) return;
    const wp = screenToWorld(screenPoint(e), s.viewport);
    const hit = elementAtPoint(s.elements, wp, tolerance(), new Set(s.selectedIds));
    if (hit && isBoxElement(hit)) {
      dispatch({ type: 'startEditing', editing: { id: hit.id, before: s.elements } });
    } else if (!hit) {
      startTextAt(wp);
    }
  };

  // Tab percorre os elementos como se fossem itens focáveis; depois do último, o foco sai da lousa.
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
    const s = stateRef.current;
    const list = s.elements;
    if (list.length === 0) return;
    const current = s.selectedIds.length === 1 ? list.findIndex((el) => el.id === s.selectedIds[0]) : -1;
    const next = e.shiftKey ? (current === -1 ? list.length - 1 : current - 1) : current + 1;
    if (next < 0 || next >= list.length) {
      dispatch({ type: 'select', ids: [] });
      return;
    }
    e.preventDefault();
    const el = list[next]!;
    dispatch({ type: 'select', ids: [el.id] });
    onAnnounce(`${describeElement(el)} selecionado, ${next + 1} de ${list.length}. Setas movem, Enter edita o texto, Delete apaga.`);
    // Traz o elemento para a vista se estiver fora da tela.
    const svg = svgRef.current;
    if (svg) {
      const b = getCommonBounds([el])!;
      const tl = worldToScreen(b, s.viewport);
      const br = worldToScreen({ x: b.x + b.width, y: b.y + b.height }, s.viewport);
      const rect = svg.getBoundingClientRect();
      if (tl.x < 0 || tl.y < 0 || br.x > rect.width || br.y > rect.height) {
        const z = s.viewport.zoom;
        dispatch({
          type: 'viewport',
          viewport: { zoom: z, x: b.x + b.width / 2 - rect.width / 2 / z, y: b.y + b.height / 2 - rect.height / 2 / z },
        });
      }
    }
  };

  const editingElement = editing ? elements.find((el) => el.id === editing.id) : undefined;

  const cursor = panning
    ? 'grabbing'
    : spaceHeld || tool === 'hand'
      ? 'grab'
      : tool === 'select'
        ? (hoverCursor ?? 'default')
        : tool === 'text'
          ? 'text'
          : 'crosshair';

  const z = viewport.zoom;
  const gridSize = 24 * z;
  const gridVisible = showGrid && gridSize >= 8;
  const bindEl = bindTarget ? elements.find((el) => el.id === bindTarget) : undefined;

  return (
    <>
      <svg
        ref={svgRef}
        className="canvas"
        role="application"
        aria-label="Lousa. Use as ferramentas da barra superior ou os atalhos de teclado. Tab percorre os elementos."
        aria-roledescription="lousa"
        tabIndex={0}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onPointerLeave={() => {
          if (!interaction.current) {
            setHoverCursor(null);
            if (stateRef.current.tool === 'arrow') setBindTarget(null);
          }
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        data-zoom={z.toFixed(3)}
      >
        {gridVisible && (
          <>
            <defs>
              <pattern
                id="grid-dots"
                width={gridSize}
                height={gridSize}
                patternUnits="userSpaceOnUse"
                x={-viewport.x * z}
                y={-viewport.y * z}
              >
                <circle cx={gridSize / 2} cy={gridSize / 2} r={Math.min(1.6, Math.max(0.9, z * 1.2))} fill="var(--grade)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-dots)" />
          </>
        )}
        <g transform={`scale(${z}) translate(${-viewport.x} ${-viewport.y})`}>
          {elements.map((el) => (
            <ElementView key={el.id} element={el} hideText={editing?.id === el.id} faded={erasing.has(el.id)} theme={theme} />
          ))}
        </g>
        <g className="overlay" pointerEvents="none">
          {bindEl && isBoxElement(bindEl) && <BindHighlight element={bindEl} viewport={viewport} />}
          {!editing && <SelectionOverlay selected={selected} viewport={viewport} />}
          {marquee && <MarqueeView box={marquee} viewport={viewport} />}
        </g>
      </svg>
      {editingElement && isBoxElement(editingElement) && (
        <TextEditor
          key={editingElement.id}
          element={editingElement}
          viewport={viewport}
          measure={measure}
          theme={theme}
          onChange={(text) =>
            dispatch({
              type: 'setElements',
              elements: setElementText(stateRef.current.elements, editingElement.id, text, measure, { removeEmpty: false }),
            })
          }
          onCommit={(text) => {
            onCommitText(editingElement.id, text);
            svgRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}

function selectionScreenBox(bounds: Box, vp: Viewport): Box {
  const tl = worldToScreen(bounds, vp);
  const pad = 6;
  return {
    x: tl.x - pad,
    y: tl.y - pad,
    width: bounds.width * vp.zoom + pad * 2,
    height: bounds.height * vp.zoom + pad * 2,
  };
}

/** Em caixas pequenas, só os cantos (as alças do meio ficariam umas sobre as outras). */
function visibleHandles(box: Box): readonly HandleId[] {
  if (box.width < 44 || box.height < 44) return ['nw', 'ne', 'se', 'sw'];
  return HANDLE_IDS;
}

function SelectionOverlay({ selected, viewport }: { selected: BoardElement[]; viewport: Viewport }) {
  if (selected.length === 0) return null;
  const only = selected[0]!;
  if (selected.length === 1 && isLinear(only)) {
    return (
      <g>
        {only.points.map((p, i) => {
          const s = worldToScreen(p, viewport);
          const bound = i === 0 ? only.startBinding : only.endBinding;
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={6.5}
              fill={bound ? 'var(--tinta)' : '#ffffff'}
              stroke="var(--selecao)"
              strokeWidth={2}
              data-handle={i === 0 ? 'start' : 'end'}
            />
          );
        })}
      </g>
    );
  }
  const bounds = getCommonBounds(selected);
  if (!bounds) return null;
  const box = selectionScreenBox(bounds, viewport);
  return (
    <g>
      {selected.length > 1 &&
        selected.map((el) => {
          const b = selectionScreenBox(getCommonBounds([el])!, viewport);
          return (
            <rect key={el.id} x={b.x + 3} y={b.y + 3} width={b.width - 6} height={b.height - 6} fill="none" stroke="var(--selecao)" strokeWidth={1} opacity={0.5} />
          );
        })}
      <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="none" stroke="var(--selecao)" strokeWidth={1.5} rx={4} />
      {visibleHandles(box).map((h) => {
        const p = handlePosition(box, h);
        return (
          <rect
            key={h}
            x={p.x - HANDLE_SIZE / 2}
            y={p.y - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={2.5}
            fill="#ffffff"
            stroke="var(--selecao)"
            strokeWidth={1.5}
            data-handle={h}
          />
        );
      })}
    </g>
  );
}

function BindHighlight({ element, viewport }: { element: BoardElement & Box; viewport: Viewport }) {
  const b = selectionScreenBox(element, viewport);
  const isEllipse = isShape(element) && element.type === 'ellipse';
  if (isEllipse) {
    return (
      <ellipse
        cx={b.x + b.width / 2}
        cy={b.y + b.height / 2}
        rx={b.width / 2}
        ry={b.height / 2}
        fill="rgb(0 230 118 / 0.08)"
        stroke="var(--tinta)"
        strokeWidth={3}
      />
    );
  }
  return <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={10} fill="rgb(0 230 118 / 0.08)" stroke="var(--tinta)" strokeWidth={3} />;
}

function MarqueeView({ box, viewport }: { box: Box; viewport: Viewport }) {
  const tl = worldToScreen(box, viewport);
  return (
    <rect
      x={tl.x}
      y={tl.y}
      width={box.width * viewport.zoom}
      height={box.height * viewport.zoom}
      fill="rgb(0 145 80 / 0.07)"
      stroke="var(--selecao)"
      strokeWidth={1}
      strokeDasharray="5 4"
    />
  );
}

