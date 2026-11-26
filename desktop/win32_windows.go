//go:build windows

package main

// Chamadas Win32 do app de desktop: instância única, DPI, caixa de mensagem, tela cheia da janela e
// trazer a janela já aberta para a frente. Só user32/kernel32, sem cgo.

import (
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procCreateMutexW                   = kernel32.NewProc("CreateMutexW")
	procMessageBoxW                    = user32.NewProc("MessageBoxW")
	procSetProcessDpiAwarenessContext  = user32.NewProc("SetProcessDpiAwarenessContext")
	procSetProcessDPIAware             = user32.NewProc("SetProcessDPIAware")
	procGetWindowLongPtrW              = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW              = user32.NewProc("SetWindowLongPtrW")
	procGetWindowPlacement             = user32.NewProc("GetWindowPlacement")
	procSetWindowPlacement             = user32.NewProc("SetWindowPlacement")
	procSetWindowPos                   = user32.NewProc("SetWindowPos")
	procMonitorFromWindow              = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfoW                = user32.NewProc("GetMonitorInfoW")
	procShowWindow                     = user32.NewProc("ShowWindow")
	procIsIconic                       = user32.NewProc("IsIconic")
	procSetForegroundWindow            = user32.NewProc("SetForegroundWindow")
	procEnumWindows                    = user32.NewProc("EnumWindows")
	procGetClassNameW                  = user32.NewProc("GetClassNameW")
	procGetWindowTextW                 = user32.NewProc("GetWindowTextW")
)

const (
	errorAlreadyExists = 183

	mbOK          = 0x00000000
	mbIconError   = 0x00000010
	mbSetForeground = 0x00010000

	gwlStyle            = ^uintptr(15) // GWL_STYLE = -16
	wsOverlappedWindow  = 0x00CF0000
	swpNoSize           = 0x0001
	swpNoMove           = 0x0002
	swpNoZOrder         = 0x0004
	swpNoOwnerZOrder    = 0x0200
	swpFrameChanged     = 0x0020
	monitorDefaultNearest = 0x00000002
	swRestore           = 9
	swMaximize          = 3
)

type rect struct{ Left, Top, Right, Bottom int32 }

type point struct{ X, Y int32 }

type windowPlacement struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    point
	PtMaxPosition    point
	RcNormalPosition rect
}

type monitorInfo struct {
	CbSize    uint32
	RcMonitor rect
	RcWork    rect
	DwFlags   uint32
}

var instanceMutex uintptr

// acquireSingleInstance devolve false se outra instância do Aurora Board já está aberta nesta sessão.
func acquireSingleInstance(name string) bool {
	p, _ := windows.UTF16PtrFromString(name)
	h, _, err := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(p)))
	if h == 0 {
		return true // sem mutex não há como saber; segue (a porta ocupada avisa)
	}
	instanceMutex = h // fica aberto até o processo terminar
	return err != syscall.Errno(errorAlreadyExists)
}

// setDPIAware evita a janela borrada em telas com escala (125%, 150%...): por monitor (v2) quando o
// Windows oferece, senão o modo de sistema.
func setDPIAware() {
	if procSetProcessDpiAwarenessContext.Find() == nil {
		const perMonitorAwareV2 = ^uintptr(3) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
		if ok, _, _ := procSetProcessDpiAwarenessContext.Call(perMonitorAwareV2); ok != 0 {
			return
		}
	}
	if procSetProcessDPIAware.Find() == nil {
		_, _, _ = procSetProcessDPIAware.Call()
	}
}

func showError(title, message string) {
	t, _ := windows.UTF16PtrFromString(title)
	m, _ := windows.UTF16PtrFromString(message)
	_, _, _ = procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbOK|mbIconError|mbSetForeground)
}

func maximize(hwnd uintptr) {
	_, _, _ = procShowWindow.Call(hwnd, swMaximize)
}

// fullscreen alterna a janela entre normal e tela cheia sem bordas (para o projetor). O WebView2 não
// muda o tamanho da janela sozinho quando a página pede tela cheia, então o app pede aqui.
type fullscreen struct {
	hwnd      uintptr
	active    bool
	style     uintptr
	placement windowPlacement
}

func (f *fullscreen) toggle() bool {
	if !f.active {
		f.style, _, _ = procGetWindowLongPtrW.Call(f.hwnd, gwlStyle)
		f.placement.Length = uint32(unsafe.Sizeof(f.placement))
		_, _, _ = procGetWindowPlacement.Call(f.hwnd, uintptr(unsafe.Pointer(&f.placement)))
		monitor, _, _ := procMonitorFromWindow.Call(f.hwnd, monitorDefaultNearest)
		info := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
		if ok, _, _ := procGetMonitorInfoW.Call(monitor, uintptr(unsafe.Pointer(&info))); ok == 0 {
			return false
		}
		_, _, _ = procSetWindowLongPtrW.Call(f.hwnd, gwlStyle, f.style&^wsOverlappedWindow)
		r := info.RcMonitor
		_, _, _ = procSetWindowPos.Call(f.hwnd, 0, uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), swpNoOwnerZOrder|swpFrameChanged)
		f.active = true
		return true
	}
	_, _, _ = procSetWindowLongPtrW.Call(f.hwnd, gwlStyle, f.style)
	_, _, _ = procSetWindowPlacement.Call(f.hwnd, uintptr(unsafe.Pointer(&f.placement)))
	_, _, _ = procSetWindowPos.Call(f.hwnd, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoZOrder|swpNoOwnerZOrder|swpFrameChanged)
	f.active = false
	return false
}

// focusExisting traz para a frente a janela do Aurora Board que já está aberta (segundo clique no ícone).
func focusExisting(className, titleSuffix string) {
	var found uintptr
	cb := syscall.NewCallback(func(hwnd, _ uintptr) uintptr {
		cls := make([]uint16, 64)
		n, _, _ := procGetClassNameW.Call(hwnd, uintptr(unsafe.Pointer(&cls[0])), uintptr(len(cls)))
		if n == 0 || windows.UTF16ToString(cls[:n]) != className {
			return 1
		}
		title := make([]uint16, 512)
		m, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&title[0])), uintptr(len(title)))
		if strings.HasSuffix(windows.UTF16ToString(title[:m]), titleSuffix) {
			found = hwnd
			return 0
		}
		return 1
	})
	_, _, _ = procEnumWindows.Call(cb, 0)
	if found == 0 {
		return
	}
	if iconic, _, _ := procIsIconic.Call(found); iconic != 0 {
		_, _, _ = procShowWindow.Call(found, swRestore)
	}
	_, _, _ = procSetForegroundWindow.Call(found)
}
