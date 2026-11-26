// Teste de fumaça do ciclo principal, num navegador de verdade e no build de produção:
// desenhar → rotular → conectar com seta → mover (a seta acompanha) → redimensionar → desfazer →
// salvamento automático → recarregar (persistiu no IndexedDB) → exportar PNG/SVG/JSON → importar.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`sem caixa para ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('ciclo principal da lousa, de ponta a ponta', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Carregamento → estado vazio.
  await page.goto('/');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText(/Salvo/);

  // 1. Retângulo pelo atalho R, com rótulo (Enter → digitar → Esc).
  await page.keyboard.press('r');
  await drag(page, { x: 300, y: 300 }, { x: 480, y: 400 });
  await expect(page.locator('[data-type="rectangle"]')).toHaveCount(1);
  await expect(page.getByTestId('empty-state')).toBeHidden();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Pergunta');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-type="rectangle"] text')).toHaveText('Pergunta');

  // 2. Elipse pelo botão da barra.
  await page.getByRole('button', { name: /^Elipse/ }).click();
  await drag(page, { x: 700, y: 300 }, { x: 880, y: 400 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Resposta');
  await page.keyboard.press('Escape');
  const rectId = await page.locator('[data-type="rectangle"]').getAttribute('data-element-id');
  const ellipseId = await page.locator('[data-type="ellipse"]').getAttribute('data-element-id');

  // 3. Seta arrastada de uma forma até a outra: as duas pontas ficam ligadas.
  await page.keyboard.press('a');
  await drag(page, { x: 390, y: 350 }, { x: 790, y: 350 });
  const arrow = page.locator('[data-type="arrow"]');
  await expect(arrow).toHaveAttribute('data-start-binding', rectId!);
  await expect(arrow).toHaveAttribute('data-end-binding', ellipseId!);
  const startY = Number(await arrow.locator('line').getAttribute('y1'));

  // 4. Mover o retângulo: a ponta da seta acompanha.
  await page.keyboard.press('Escape');
  await drag(page, await center(page, '[data-type="rectangle"]'), { x: 390, y: 520 });
  await expect.poll(async () => Number(await arrow.locator('line').getAttribute('y1'))).toBeGreaterThan(startY + 50);

  // 5. Redimensionar a elipse pela alça e desfazer com Ctrl+Z.
  const ellipse = page.locator('[data-type="ellipse"] ellipse');
  const rxBefore = Number(await ellipse.getAttribute('rx'));
  const ellipseCenter = await center(page, '[data-type="ellipse"]');
  await page.mouse.click(ellipseCenter.x, ellipseCenter.y);
  await drag(page, await center(page, '[data-handle="se"]'), { x: 1000, y: 460 });
  await expect.poll(async () => Number(await ellipse.getAttribute('rx'))).toBeGreaterThan(rxBefore + 30);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => Number(await ellipse.getAttribute('rx'))).toBeCloseTo(rxBefore, 0);

  // 6. Salvamento automático no IndexedDB e recarga da página.
  await expect(page.getByTestId('save-status')).toHaveText(/Salvo/);
  await page.reload();
  await expect(page.locator('[data-type="rectangle"] text')).toHaveText('Pergunta');
  await expect(page.locator('[data-type="arrow"]')).toHaveAttribute('data-start-binding', rectId!);
  await expect(page.locator('[data-type="arrow"]')).toHaveAttribute('data-end-binding', ellipseId!);

  // 6b. Tema escuro (fundo cinza): alterna pelo botão, continua depois de recarregar, volta pelo atalho.
  await page.getByTestId('theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-type="rectangle"] rect')).toHaveAttribute('stroke', '#e8ecea');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-type="rectangle"] text')).toHaveText('Pergunta');
  await page.keyboard.press('Alt+Shift+D');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-type="rectangle"] rect')).toHaveAttribute('stroke', '#1f2723');

  // 7. Exportar PNG (arquivo PNG de verdade).
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog.getByRole('img', { name: 'Prévia da exportação' })).toBeVisible();
  const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Baixar PNG' }).click()]);
  expect(png.suggestedFilename()).toBe('meu-primeiro-quadro.png');
  const pngBytes = await readFile((await png.path())!);
  expect([...pngBytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(pngBytes.length).toBeGreaterThan(5_000);
  await expect(page.getByText(/PNG exportado/)).toBeVisible();

  // 8. Exportar SVG (com o texto e a fonte embutida).
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await dialog.getByRole('radio', { name: 'SVG (vetor)' }).check();
  const [svg] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Baixar SVG' }).click()]);
  const svgText = await readFile((await svg.path())!, 'utf8');
  expect(svgText).toContain('<svg');
  expect(svgText).toContain('Pergunta');
  expect(svgText).toContain('@font-face');

  // 9. Exportar o arquivo do quadro (JSON) e importar de volta como um quadro novo.
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Arquivo do quadro (.aurora.json)' }).check();
  const [json] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Baixar JSON' }).click()]);
  expect(json.suggestedFilename()).toBe('meu-primeiro-quadro.aurora.json');
  const jsonPath = (await json.path())!;
  const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
  expect(parsed.type).toBe('aurora-board');
  expect(parsed.boards[0].elements).toHaveLength(3);

  await page.getByTestId('import-input').setInputFiles({
    name: 'aula.aurora.json',
    mimeType: 'application/json',
    buffer: await readFile(jsonPath),
  });
  await expect(page.getByText(/importado \(3 elementos\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Quadros' }).click();
  await expect(page.getByTestId('boards-panel').getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Escape');

  // 10. Arquivo inválido: recusado com mensagem clara, nada é criado.
  await page.getByTestId('import-input').setInputFiles({
    name: 'quebrado.aurora.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"type":"aurora-board","version":1,"boards":[{"name":"x","elements":[{"type":"script"}]}]}'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Elemento 1: tipo desconhecido' })).toBeVisible();

  expect(errors).toEqual([]);
});
