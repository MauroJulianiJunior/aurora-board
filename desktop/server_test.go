package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

const testHost = "127.0.0.1:47180"

func testHandler(t *testing.T) http.Handler {
	t.Helper()
	files := fstest.MapFS{
		"index.html":           {Data: []byte("<!doctype html><title>Aurora Board</title>")},
		"assets/index-abc.js":  {Data: []byte("console.log(1)")},
		"assets/font.woff2":    {Data: []byte("wOF2")},
		"favicon.svg":          {Data: []byte("<svg/>")},
	}
	headers, err := parseHeaders([]byte(`{"Content-Security-Policy":"default-src 'self'","X-Content-Type-Options":"nosniff"}`))
	if err != nil {
		t.Fatal(err)
	}
	return newHandler(files, headers, testHost)
}

func get(t *testing.T, h http.Handler, method, target, host string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	req.Host = host
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func TestServeArquivosComTipoECabecalhos(t *testing.T) {
	h := testHandler(t)
	cases := map[string]string{
		"/":                    "text/html; charset=utf-8",
		"/assets/index-abc.js": "text/javascript; charset=utf-8",
		"/assets/font.woff2":   "font/woff2",
		"/favicon.svg":         "image/svg+xml",
	}
	for target, want := range cases {
		res := get(t, h, http.MethodGet, target, testHost)
		if res.StatusCode != http.StatusOK {
			t.Fatalf("%s: status %d", target, res.StatusCode)
		}
		if got := res.Header.Get("Content-Type"); got != want {
			t.Errorf("%s: Content-Type %q, quero %q", target, got, want)
		}
		if res.Header.Get("Content-Security-Policy") == "" || res.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s: sem as cabeçalhos de segurança", target)
		}
	}
	if cc := get(t, h, http.MethodGet, "/assets/index-abc.js", testHost).Header.Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("assets deveriam ter cache longo, veio %q", cc)
	}
}

func TestCaminhoDesconhecidoRecebeIndex(t *testing.T) {
	res := get(t, testHandler(t), http.MethodGet, "/qualquer/coisa", testHost)
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != "<!doctype html><title>Aurora Board</title>" {
		t.Fatalf("esperava o index.html, veio %d %q", res.StatusCode, body)
	}
}

func TestNaoSaiDaPastaDoBuild(t *testing.T) {
	h := testHandler(t)
	for _, target := range []string{"/../go.mod", "/%2e%2e/go.mod", "/assets/..%2f..%2fgo.mod", "/..%5cgo.mod"} {
		res := get(t, h, http.MethodGet, target, testHost)
		body, _ := io.ReadAll(res.Body)
		if res.StatusCode == http.StatusOK && string(body) != "<!doctype html><title>Aurora Board</title>" {
			t.Errorf("%s: serviu algo fora do build: %q", target, body)
		}
	}
}

func TestRecusaOutroHostEOutroMetodo(t *testing.T) {
	h := testHandler(t)
	if res := get(t, h, http.MethodGet, "/", "evil.example:47180"); res.StatusCode != http.StatusMisdirectedRequest {
		t.Errorf("host de fora: status %d, quero 421", res.StatusCode)
	}
	if res := get(t, h, http.MethodGet, "/", "localhost:47180"); res.StatusCode != http.StatusMisdirectedRequest {
		t.Errorf("localhost (outra origem do IndexedDB): status %d, quero 421", res.StatusCode)
	}
	res := get(t, h, http.MethodPost, "/", testHost)
	if res.StatusCode != http.StatusMethodNotAllowed || res.Header.Get("Allow") != "GET, HEAD" {
		t.Errorf("POST: status %d, Allow %q", res.StatusCode, res.Header.Get("Allow"))
	}
}

func TestCabecalhosEmbutidosSaoValidos(t *testing.T) {
	headers, err := parseHeaders(embeddedHeaders)
	if err != nil {
		t.Fatal(err)
	}
	if headers["X-Content-Type-Options"] != "nosniff" {
		t.Errorf("headers.json sem nosniff")
	}
	if _, err := parseHeaders([]byte(`{}`)); err == nil {
		t.Errorf("deveria recusar cabeçalhos sem CSP")
	}
}

func TestBuildEmbutidoTemIndexQuandoGerado(t *testing.T) {
	root, err := distFS()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := root.Open("index.html"); err != nil {
		t.Skip("build da lousa não copiado para desktop/app/dist (rode npm run desktop); o resto do servidor foi testado")
	}
}
