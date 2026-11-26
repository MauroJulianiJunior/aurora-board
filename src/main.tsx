import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { readCachedTheme, setThemeAttribute } from './ui/applyTheme';
import { ErrorBoundary } from './ui/Chrome';
import './styles/fonts.css';
import './styles/app.css';

// Tema antes da primeira pintura (a tela de carregamento já sai no tema certo).
setThemeAttribute(readCachedTheme() ?? 'light');

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root ausente no index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
