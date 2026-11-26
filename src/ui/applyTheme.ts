// Aplica o tema na página. A preferência é gravada em dois lugares: no localStorage (síncrono, lido
// antes da primeira pintura, então a tela já abre no tema certo e nunca fica para trás) e nas
// configurações do IndexedDB (cópia de segurança, usada se o localStorage estiver vazio ou bloqueado).
import { isTheme, THEME_BACKGROUND, type Theme } from '../model/theme';

const CACHE_KEY = 'aurora-board:theme';

/** Tema guardado no localStorage, ou null se não houver (primeira visita, ou armazenamento bloqueado). */
export function readCachedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Só a página (atributo e cor da barra do navegador), sem gravar nada. */
export function setThemeAttribute(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BACKGROUND[theme]);
}

export function applyTheme(theme: Theme): void {
  setThemeAttribute(theme);
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    /* localStorage bloqueado: o tema ainda vem do IndexedDB ao abrir */
  }
}
