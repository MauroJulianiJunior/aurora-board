/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { SECURITY_HEADERS } from './scripts/security-headers.mjs';

export default defineConfig(({ mode }) => {
  // Só variáveis com prefixo AURORA_BOARD_ são lidas; nenhuma é segredo (ver .env.example).
  const env = loadEnv(mode, process.cwd(), 'AURORA_BOARD_');
  const port = Number(env.AURORA_BOARD_PORT) || 5173;
  const previewPort = Number(env.AURORA_BOARD_PREVIEW_PORT) || 4173;

  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port, strictPort: false },
    // O preview já se comporta como produção: mesmas cabeceiras de segurança do scripts/serve.mjs.
    preview: { host: '127.0.0.1', port: previewPort, strictPort: true, headers: SECURITY_HEADERS },
    build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
