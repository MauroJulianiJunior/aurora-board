package main

// O servidor embutido do app de desktop: serve o build da lousa (desktop/app/dist, copiado pelo
// scripts/build-desktop.mjs) só em 127.0.0.1, com as mesmas cabeceiras de segurança do "npm start"
// (desktop/app/headers.json, gerado a partir de scripts/security-headers.mjs; um teste do Vitest
// confere que os dois não se separaram).
//
// A porta é fixa de propósito: os quadros ficam no IndexedDB, que é separado por origem
// (endereço + porta). Mudar a porta = abrir uma lousa vazia.

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strings"
	"time"
)

//go:embed all:app/dist
var embeddedDist embed.FS

//go:embed app/headers.json
var embeddedHeaders []byte

// O Go no Windows lê os tipos do registro, onde .js às vezes vira text/plain (e o navegador recusa o
// módulo por causa do nosniff). Por isso a tabela é fixa.
var contentTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".ico":   "image/x-icon",
	".json":  "application/json; charset=utf-8",
	".woff2": "font/woff2",
	".txt":   "text/plain; charset=utf-8",
}

func parseHeaders(raw []byte) (map[string]string, error) {
	var headers map[string]string
	if err := json.Unmarshal(raw, &headers); err != nil {
		return nil, fmt.Errorf("cabeçalhos de segurança inválidos: %w", err)
	}
	if headers["Content-Security-Policy"] == "" {
		return nil, errors.New("cabeçalhos de segurança sem Content-Security-Policy")
	}
	return headers, nil
}

// distFS devolve o build embutido, com index.html na raiz.
func distFS() (fs.FS, error) {
	return fs.Sub(embeddedDist, "app/dist")
}

// newHandler serve os arquivos de root. Só aceita GET/HEAD com Host igual a allowedHost (corta DNS
// rebinding: uma página de fora apontando um domínio dela para 127.0.0.1 não passa). Caminho que não
// existe recebe o index.html (a lousa é uma página só).
func newHandler(root fs.FS, headers map[string]string, allowedHost string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for k, v := range headers {
			w.Header().Set(k, v)
		}
		if r.Host != allowedHost {
			http.Error(w, "Endereço não permitido.", http.StatusMisdirectedRequest)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Método não permitido.", http.StatusMethodNotAllowed)
			return
		}
		// path.Clean com "/" na frente nunca sobe acima da raiz; o fs.FS ainda recusa ".." por conta própria.
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		data, err := fs.ReadFile(root, name)
		if err != nil {
			name = "index.html"
			data, err = fs.ReadFile(root, name)
			if err != nil {
				http.Error(w, "Este executável foi gerado sem a lousa. Rode \"npm run desktop\".", http.StatusInternalServerError)
				return
			}
		}
		contentType := contentTypes[path.Ext(name)]
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		if r.Method == http.MethodHead {
			return
		}
		_, _ = w.Write(data)
	})
}

// startServer abre a porta e serve em segundo plano. Falha na hora se a porta estiver ocupada.
func startServer(addr string, handler http.Handler) (*http.Server, error) {
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	srv := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	return srv, nil
}
