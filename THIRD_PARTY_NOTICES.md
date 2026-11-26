# Componentes de terceiros

O Aurora Board inclui, no build da lousa e no app de desktop, os componentes abaixo. Cada um segue a
própria licença; o texto completo de cada uma está no pacote correspondente (`node_modules/<pacote>/LICENSE`
ou no cache de módulos do Go).

## Lousa (navegador)

| Componente | Licença | Uso |
|---|---|---|
| React e React DOM (Meta Platforms, Inc.) | MIT | Interface |
| idb (Jake Archibald) | ISC | Acesso ao IndexedDB |
| Inter (Rasmus Andersson), via @fontsource/inter | SIL Open Font License 1.1 | Fonte da interface e do texto "Normal" |
| Space Grotesk (Florian Karsten), via @fontsource/space-grotesk | SIL Open Font License 1.1 | Fonte dos títulos e do texto "Título" |
| IBM Plex Mono (IBM Corp.), via @fontsource/ibm-plex-mono | SIL Open Font License 1.1 | Fonte do texto "Código" |

## App de desktop (Windows)

| Componente | Licença | Uso |
|---|---|---|
| go-webview2 (John Chadwick) | MIT | Janela com o WebView2 |
| go-winloader (John Chadwick) | MIT | Carregamento do WebView2Loader |
| golang.org/x/sys (The Go Authors) | BSD 3-Clause | Chamadas ao Windows |
| Go standard library (The Go Authors) | BSD 3-Clause | Servidor local embutido |

O Microsoft Edge WebView2 Runtime não é distribuído com o Aurora Board: ele já vem com o Windows 11.
