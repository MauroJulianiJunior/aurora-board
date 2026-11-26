//go:build windows

// Command AuroraBoard é o Aurora Board como app de desktop do Windows: abre a lousa numa janela
// própria (WebView2, o motor do Edge que já vem no Windows 11), sem barra de navegador, com o build
// embutido no próprio .exe. Nada é baixado nem enviado: o servidor escuta só em 127.0.0.1.
//
// Onde ficam as coisas (o mesmo desenho do Aurora Whisper, ADR-018 daquele projeto):
//   - o programa: %LOCALAPPDATA%\Programs\Aurora Board\AuroraBoard.exe (o instalador põe lá);
//   - os dados:   %LOCALAPPDATA%\AuroraBoard\ (o perfil do WebView2, com o IndexedDB dos quadros).
//
// -dados <pasta> troca a pasta de dados (testes, ou uma lousa separada).
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unicode"

	webview2 "github.com/jchv/go-webview2"
)

// version vem do package.json, pelo -ldflags do scripts/build-desktop.mjs.
var version = "dev"

const (
	appTitle      = "Aurora Board"
	port          = 47180
	mutexName     = "Local\\AuroraBoard.Instancia"
	iconResource  = 1 // RT_GROUP_ICON id 1 do desktop/rsrc_windows_amd64.syso (scripts/icons.mjs)
	windowClass   = "webview"
	dataDirName   = "AuroraBoard"
	minWidth      = 900
	minHeight     = 600
)

// Roda antes dos scripts da página: expõe a ponte do app (tela cheia) e leva o título da aba para a
// janela, que mostra o nome do quadro na barra de tarefas.
const initScript = `(() => {
  window.auroraDesktop = {
    version: %q,
    dataFolder: '%%LOCALAPPDATA%%\\AuroraBoard',
    toggleFullscreen: () => window.auroraToggleFullscreen(),
  };
  const sync = () => { if (window.auroraSetTitle) window.auroraSetTitle(document.title); };
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.querySelector('title');
    if (t) new MutationObserver(sync).observe(t, { childList: true, characterData: true, subtree: true });
    sync();
  });
})();`

func main() {
	runtime.LockOSThread()
	dataFlag := flag.String("dados", "", "pasta de dados (padrão: %LOCALAPPDATA%\\AuroraBoard)")
	flag.Parse()

	if !acquireSingleInstance(mutexName) {
		focusExisting(windowClass, appTitle)
		return
	}
	setDPIAware()

	dataDir, err := resolveDataDir(*dataFlag)
	if err != nil {
		showError(appTitle, "Não foi possível criar a pasta de dados:\n"+err.Error())
		return
	}
	headers, err := parseHeaders(embeddedHeaders)
	if err != nil {
		showError(appTitle, err.Error())
		return
	}
	root, err := distFS()
	if err != nil {
		showError(appTitle, err.Error())
		return
	}
	host := fmt.Sprintf("127.0.0.1:%d", port)
	srv, err := startServer(host, newHandler(root, headers, host))
	if err != nil {
		showError(appTitle, fmt.Sprintf(
			"A porta %d já está em uso por outro programa, e o Aurora Board precisa dela para achar os seus quadros.\n\n"+
				"Feche o programa que está usando essa porta e abra o Aurora Board de novo.", port))
		return
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:  filepath.Join(dataDir, "WebView2"),
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  appTitle,
			Width:  1366,
			Height: 860,
			IconId: iconResource,
			Center: true,
		},
	})
	if w == nil {
		showError(appTitle, "Não foi possível abrir a janela da lousa.\n\n"+
			"O Aurora Board usa o Microsoft Edge WebView2 Runtime, que vem com o Windows 11. "+
			"Se ele foi removido, instale de novo pelo site da Microsoft (procure por \"WebView2 Runtime\").")
		return
	}
	defer w.Destroy()

	hwnd := uintptr(w.Window())
	screen := &fullscreen{hwnd: hwnd}
	// As funções ligadas rodam na thread da interface (o WebView2 entrega as mensagens nela).
	_ = w.Bind("auroraToggleFullscreen", func() bool { return screen.toggle() })
	_ = w.Bind("auroraSetTitle", func(title string) { w.SetTitle(windowTitle(title)) })
	w.Init(fmt.Sprintf(initScript, version))
	w.SetSize(minWidth, minHeight, webview2.HintMin)
	maximize(hwnd)
	w.Navigate("http://" + host + "/")
	w.Run()
}

func resolveDataDir(flagValue string) (string, error) {
	dir := flagValue
	if dir == "" {
		base, err := os.UserCacheDir() // %LOCALAPPDATA% no Windows
		if err != nil {
			return "", err
		}
		dir = filepath.Join(base, dataDirName)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	return abs, os.MkdirAll(abs, 0o700)
}

// windowTitle limpa o título que vem da página (nome do quadro) antes de ir para a barra de tarefas.
func windowTitle(title string) string {
	clean := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, title)
	clean = strings.TrimSpace(clean)
	if clean == "" {
		return appTitle
	}
	if r := []rune(clean); len(r) > 160 {
		clean = string(r[:160]) + "…"
	}
	return clean
}
