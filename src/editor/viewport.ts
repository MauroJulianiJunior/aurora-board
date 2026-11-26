import { LIMITS } from '../model/constants';
import type { Box, Point, Viewport } from '../model/types';

export function clampZoom(zoom: number): number {
  return Math.max(LIMITS.minZoom, Math.min(LIMITS.maxZoom, zoom));
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: p.x / vp.zoom + vp.x, y: p.y / vp.zoom + vp.y };
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) * vp.zoom, y: (p.y - vp.y) * vp.zoom };
}

/** Zoom mantendo fixo o ponto da tela sob o cursor (ou o centro). */
export function zoomAt(vp: Viewport, nextZoom: number, screenPoint: Point): Viewport {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(screenPoint, vp);
  return { zoom, x: world.x - screenPoint.x / zoom, y: world.y - screenPoint.y / zoom };
}

/** Degraus dos botões +/−: 10%, 25%, 50%, 75%, 100%, 125%, 150%, 200%, 300%, 400%, 500%. */
const STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5];

export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((s) => s > zoom + 0.001) ?? LIMITS.maxZoom;
  return [...STEPS].reverse().find((s) => s < zoom - 0.001) ?? LIMITS.minZoom;
}

/** Enquadra a caixa na tela, com margem, sem passar de 200% (um elemento só não vira tela cheia). */
export function fitViewport(bounds: Box, screenWidth: number, screenHeight: number, padding = 80): Viewport {
  const w = Math.max(1, screenWidth - padding * 2);
  const h = Math.max(1, screenHeight - padding * 2);
  const zoom = clampZoom(Math.min(2, w / Math.max(bounds.width, 1), h / Math.max(bounds.height, 1)));
  return {
    zoom,
    x: bounds.x + bounds.width / 2 - screenWidth / 2 / zoom,
    y: bounds.y + bounds.height / 2 - screenHeight / 2 / zoom,
  };
}

export function screenCenterWorld(vp: Viewport, screenWidth: number, screenHeight: number): Point {
  return screenToWorld({ x: screenWidth / 2, y: screenHeight / 2 }, vp);
}
