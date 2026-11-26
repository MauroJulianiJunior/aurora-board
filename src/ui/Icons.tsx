// Ícones de traço (24×24, currentColor). Decorativos: o rótulo acessível fica no botão.
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  select: <path d="M5 3.5 18.5 10l-6 1.8L10 18z" />,
  hand: (
    <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-.5V4a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.6-2.2L4.2 15.6a1.6 1.6 0 0 1 2.4-2.1L8 15" />
  ),
  rectangle: <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  diamond: <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />,
  arrow: (
    <>
      <path d="M4.5 19.5 19 5" />
      <path d="M11 5h8v8" />
    </>
  ),
  line: <path d="M4.5 19.5 19.5 4.5" />,
  freedraw: <path d="M4 17c2.5-3 4-8 6.5-8S12 15 14.5 15s3-5 5.5-7" />,
  text: (
    <>
      <path d="M5 6V4.5h14V6" />
      <path d="M12 4.5v15" />
      <path d="M9 19.5h6" />
    </>
  ),
  eraser: (
    <>
      <path d="m14.5 4.5 5 5-9 9H6l-2.5-2.5a1.5 1.5 0 0 1 0-2.1z" />
      <path d="M9.5 9.5l5 5" />
      <path d="M10.5 18.5h9" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7" />
      <path d="M12 17h.01" />
    </>
  ),
  grid: (
    <>
      <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
    </>
  ),
  focus: (
    <>
      <path d="M3 12s3.2-6 9-6c1.4 0 2.6.3 3.7.8M21 12s-3.2 6-9 6c-1.4 0-2.6-.3-3.7-.8" />
      <path d="M9.9 14.1a3 3 0 0 1 4.2-4.2" />
      <path d="M4 20 20 4" />
    </>
  ),
  fullscreen: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: (
    <>
      <rect x="7.5" y="8.5" width="9" height="7" rx="1.5" />
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 12.5h9l1-12.5" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  bringForward: (
    <>
      <rect x="8.5" y="4.5" width="11" height="11" rx="2" />
      <path d="M4.5 9.5v8a2 2 0 0 0 2 2h8" />
    </>
  ),
  sendBackward: (
    <>
      <rect x="4.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M8.5 4.5h9a2 2 0 0 1 2 2v9" strokeDasharray="2 2.5" />
    </>
  ),
  boards: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z" />
      <path d="m13 7 4 4" />
    </>
  ),
  connect: (
    <>
      <rect x="2.5" y="8" width="6" height="8" rx="1.5" />
      <rect x="15.5" y="8" width="6" height="8" rx="1.5" />
      <path d="M8.5 12h6" />
      <path d="m12.5 9.5 2.5 2.5-2.5 2.5" />
    </>
  ),
  plusBoard: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Marca do Aurora Board: os colchetes de canto do design system em volta de duas formas ligadas.
 * O traço interno segue o tema (verde profundo no claro, off-white no escuro).
 */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" className={className}>
      <g stroke="#00e676" strokeWidth="2.6" strokeLinecap="round" className="pulse">
        <path d="M3.5 10V7a3.5 3.5 0 0 1 3.5-3.5h3" />
        <path d="M22 3.5h3A3.5 3.5 0 0 1 28.5 7v3" />
        <path d="M28.5 22v3a3.5 3.5 0 0 1-3.5 3.5h-3" />
        <path d="M10 28.5H7A3.5 3.5 0 0 1 3.5 25v-3" />
      </g>
      <g style={{ stroke: 'var(--marca-traco, #0f3d2e)' }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8.5" y="9" width="8" height="6.5" rx="1.6" />
        <circle cx="20.5" cy="20.5" r="3.4" />
        <path d="M15 15.5l3 2.6" />
      </g>
    </svg>
  );
}
