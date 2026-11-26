import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

// O teste roda contra o build de produção servido por scripts/serve.mjs, com as mesmas cabeceiras
// de segurança (CSP) do "npm start": se a CSP quebrar algo, o teste pega.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npx vite build && node scripts/serve.mjs',
    url: `http://127.0.0.1:${PORT}`,
    env: { AURORA_BOARD_SERVE_PORT: String(PORT), AURORA_BOARD_SERVE_HOST: '127.0.0.1' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
