// Quadro de exemplo: um fluxo realista de atendimento com IA, para mostrar formas, setas ligadas,
// texto e caneta. Fica marcado como "Exemplo" na lista de quadros e pode ser apagado sem perda.
import { DEFAULT_STYLE, DEFAULT_VIEWPORT } from './constants';
import { createFreedraw, createId, createLinear, createShape, createText } from './elements';
import { refreshBindings } from './operations';
import type { MeasureText } from './text';
import type { Board, BoardElement, LinearElement, ShapeElement, StyleState } from './types';

export const SAMPLE_BOARD_NAME = 'Exemplo — Atendimento com IA (pode apagar)';

export function createSampleBoard(measure: MeasureText, now = Date.now()): Board {
  const label: StyleState = { ...DEFAULT_STYLE, fontSize: 24 };
  const shape = (
    type: ShapeElement['type'],
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    fillColor: string,
  ) => createShape(type, { x, y, width, height }, { ...label, fillColor }, text);

  const cliente = shape('rectangle', 80, 240, 220, 110, 'Cliente envia\numa mensagem', '#d9e7f2');
  const webhook = shape('rectangle', 380, 240, 220, 110, 'n8n recebe\no webhook', '#ffffff');
  const ia = shape('rectangle', 680, 240, 220, 110, 'IA classifica\no pedido', '#dcede2');
  const decisao = shape('diamond', 970, 205, 260, 180, 'Precisa de\numa pessoa?', '#f8efc4');
  const resposta = shape('ellipse', 1320, 240, 230, 110, 'Resposta\nautomática', '#00e676');
  const atendente = shape('rectangle', 990, 480, 220, 110, 'Atendente\nassume', '#f7e1dd');

  const arrow = (from: ShapeElement, to: ShapeElement): LinearElement => ({
    ...createLinear('arrow', { x: from.x, y: from.y }, { x: to.x, y: to.y }, DEFAULT_STYLE),
    startBinding: from.id,
    endBinding: to.id,
  });

  const title = createText(
    { x: 80, y: 64 },
    'Exemplo: atendimento automático com IA',
    { ...DEFAULT_STYLE, fontFamily: 'display', fontSize: 40 },
    measure,
  );
  const note = createText(
    { x: 80, y: 136 },
    'Quadro de exemplo criado pelo Aurora Board. Pode apagar: abra Quadros e clique em Excluir.',
    { ...DEFAULT_STYLE, fontSize: 20, strokeColor: '#5b6962' },
    measure,
  );
  const nao = createText({ x: 1246, y: 252 }, 'não', { ...DEFAULT_STYLE, fontSize: 22, strokeColor: '#087f45' }, measure);
  const sim = createText({ x: 1116, y: 404 }, 'sim', { ...DEFAULT_STYLE, fontSize: 22, strokeColor: '#c62828' }, measure);

  // Sublinhado à mão sob o título, para mostrar a caneta.
  const underline = createFreedraw(
    Array.from({ length: 40 }, (_, i) => ({ x: 84 + i * 13, y: 122 + Math.sin(i / 2.2) * 3 })),
    { ...DEFAULT_STYLE, strokeColor: '#087f45', strokeWidth: 4 },
  );

  const elements: BoardElement[] = [
    title,
    underline,
    note,
    cliente,
    webhook,
    ia,
    decisao,
    resposta,
    atendente,
    arrow(cliente, webhook),
    arrow(webhook, ia),
    arrow(ia, decisao),
    arrow(decisao, resposta),
    arrow(decisao, atendente),
    nao,
    sim,
  ];

  return {
    id: createId(),
    name: SAMPLE_BOARD_NAME,
    createdAt: now,
    updatedAt: now,
    elements: refreshBindings(elements),
    viewport: { ...DEFAULT_VIEWPORT, x: 0, y: 0, zoom: 0.8 },
    isSample: true,
  };
}
