// Ponte exposta pelo app de desktop do Windows (desktop/main_windows.go). No navegador ela não existe.
interface AuroraDesktopBridge {
  version: string;
  /** Pasta dos dados, para mostrar à pessoa (ex.: %LOCALAPPDATA%\AuroraBoard). */
  dataFolder: string;
  /** Alterna a janela entre normal e tela cheia; devolve se ficou em tela cheia. */
  toggleFullscreen(): Promise<boolean>;
}

interface Window {
  auroraDesktop?: AuroraDesktopBridge;
}
