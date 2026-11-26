//go:build !windows

package main

import (
	"fmt"
	"os"
)

// O app de desktop é só para Windows (janela WebView2). Em outros sistemas, use "npm start".
func main() {
	fmt.Fprintln(os.Stderr, "O app de desktop do Aurora Board é só para Windows. Use \"npm start\" e abra o navegador.")
	os.Exit(1)
}
