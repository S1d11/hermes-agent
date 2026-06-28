---
name: computer-use-windows
description: |
  Windows-specific desktop automation via PowerShell and Win32 APIs.
  Window management (move, resize, minimize, maximize, focus, close),
  process-to-window mapping, taskbar/system tray interaction, Windows
  keyboard shortcuts, and virtual desktop management. Complements the
  cross-platform computer-use skill with Windows-native operations that
  don't require the cua-driver. Load this skill when the user asks to
  manage windows, switch apps, or automate the Windows desktop.
version: 1.0.0
platforms: [windows]
metadata:
  hermes:
    tags: [computer-use, windows, desktop, automation, gui, powershell, win32]
    category: desktop
    related_skills: [computer-use]
---

# Computer Use — Windows (PowerShell / Win32)

This skill provides Windows-native desktop automation through PowerShell
and Win32 APIs, complementing the cross-platform `computer-use` skill.
Use this when you need Windows-specific operations that don't require
the cua-driver infrastructure — everything here runs through the terminal
tool via PowerShell.

## Prerequisites

- **Terminal backend:** Set `TERMINAL_ENV=powershell` for native PowerShell
  access (recommended), or use the default `local` backend (Git Bash can
  call `powershell.exe -Command "..."`).
- **Admin access:** Some operations (manipulating other processes' windows,
  interacting with elevated apps) require running Hermes as Administrator.
- **windows-admin MCP server:** For combined GUI + system management
  (registry, services, processes), install the `windows-admin` MCP server:
  ```
  hermes mcp add windows-admin --command "python optional-mcps/windows-admin/server.py"
  ```

## Window Management

### List all visible windows

```powershell
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
  Select-Object Id, ProcessName, MainWindowTitle |
  Format-Table -AutoSize
```

### Focus / activate a window by process name

```powershell
$p = Get-Process -Name "notepad" -ErrorAction SilentlyContinue
if ($p) {
    # Win32 API: SetForegroundWindow
    Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    public class Win {
        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }
"@
    [Win]::ShowWindow($p.MainWindowHandle, 9)  # SW_RESTORE = 9
    [Win]::SetForegroundWindow($p.MainWindowHandle)
}
```

### Minimize / maximize / restore a window

```powershell
# SW_MINIMIZE = 6, SW_MAXIMIZE = 3, SW_RESTORE = 9
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process -Name "chrome"
[Win]::ShowWindow($p.MainWindowHandle, 6)  # Minimize
[Win]::ShowWindow($p.MainWindowHandle, 3)  # Maximize
[Win]::ShowWindow($p.MainWindowHandle, 9)  # Restore
```

### Move and resize a window

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
}
"@
$p = Get-Process -Name "notepad"
[Win]::MoveWindow($p.MainWindowHandle, 100, 100, 800, 600, $true)
```

### Close a window gracefully

```powershell
$p = Get-Process -Name "notepad" -ErrorAction SilentlyContinue
if ($p) { $p.CloseMainWindow() | Out-Null }
```

### Get window position and size

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT {
        public int Left, Top, Right, Bottom;
    }
}
"@
$p = Get-Process -Name "chrome"
$rect = New-Object Win+RECT
[Win]::GetWindowRect($p.MainWindowHandle, [ref]$rect)
"X=$($rect.Left) Y=$($rect.Top) W=$($rect.Right - $rect.Left) H=$($rect.Bottom - $rect.Top)"
```

## Keyboard Shortcuts

Send Windows keyboard shortcuts via `SendKeys`:

```powershell
Add-Type -AssemblyName System.Windows.Forms
# Win+D (show desktop)
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}")  # Start menu
# Ctrl+C
[System.Windows.Forms.SendKeys]::SendWait("^c")
# Alt+Tab
[System.Windows.Forms.SendKeys]::SendWait("%{TAB}")
# Win+Tab (Task View)
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}{TAB}")
```

Common Windows shortcut codes:
| Key | Code |
|-----|------|
| Ctrl | ^ |
| Alt | % |
| Shift | + |
| Win | ^{ESC} (opens Start, then combine) |
| Tab | {TAB} |
| Enter | {ENTER} |
| Escape | {ESC} |
| F1-F12 | {F1}-{F12} |
| Arrow keys | {UP} {DOWN} {LEFT} {RIGHT} |
| Home/End | {HOME} {END} |
| Page Up/Down | {PGUP} {PGDN} |

## Virtual Desktops

### Switch virtual desktops

```powershell
Add-Type -AssemblyName System.Windows.Forms
# Win+Ctrl+Left / Right to switch desktops
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}{LEFT}")   # previous desktop
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}{RIGHT}")  # next desktop
```

### Create a new virtual desktop

```powershell
# Win+Ctrl+D creates a new desktop
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}^d")
```

## Screenshots

### Capture the full screen

```powershell
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save("$env:TEMP\screenshot.png")
$graphics.Dispose()
$bmp.Dispose()
Write-Output "$env:TEMP\screenshot.png"
```

### Capture a specific window

```powershell
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
Add-Type -AssemblyName System.Drawing
$p = Get-Process -Name "chrome"
$rect = New-Object Win+RECT
[Win]::GetWindowRect($p.MainWindowHandle, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$bmp.Save("$env:TEMP\window_screenshot.png")
$graphics.Dispose()
$bmp.Dispose()
Write-Output "$env:TEMP\window_screenshot.png"
```

## App Launching

### Start an app and wait for it

```powershell
Start-Process "notepad.exe" -Wait
```

### Start an app with arguments

```powershell
Start-Process "chrome.exe" -ArgumentList "https://example.com", "--new-window"
```

### Start an elevated app (requires admin Hermes)

```powershell
Start-Process "regedit.exe" -Verb RunAs
```

## System Tray / Notification Area

### List notification area icons

```powershell
Get-ChildItem "HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\TrayNotify" |
  Select-Object -ExpandProperty Property
```

## Clipboard

### Get clipboard text

```powershell
Get-Clipboard
```

### Set clipboard text

```powershell
Set-Clipboard -Value "text to copy"
```

### Get clipboard image

```powershell
$img = Get-Clipboard -Format Image
if ($img) { $img.Save("$env:TEMP\clip.png") }
```

## Integration with windows-admin MCP

For system-level operations (registry, services, processes, scheduled tasks),
use the `windows-admin` MCP server tools alongside this skill:

1. **GUI + system:** Use this skill for window/desktop automation, and
   `windows-admin` MCP tools for registry/service/process management.
2. **Process → window:** Use `process_list` from the MCP server to find a
   PID, then use the Win32 window management above to manipulate its window.
3. **Service → GUI:** Use `service_get` to check a service status, then
   use desktop automation to interact with its GUI if it has one.

## Tips

- **Use the PowerShell backend:** Set `TERMINAL_ENV=powershell` so you
  don't need to wrap every command in `powershell.exe -Command "..."`.
- **Add-Type caching:** PowerShell reloads `Add-Type` definitions every
  session. For repeated use, define a profile script or use the snapshot.
- **UI Automation:** For more reliable element targeting than SendKeys,
  use the `UIAutomation` PowerShell module or the `computer_use` tool
  with SOM mode (which uses Windows UIA under the hood).
- **Multiple monitors:** `[System.Windows.Forms.Screen]::AllScreens` lists
  all monitors with their bounds and working area.
- **Don't steal focus:** If the user is working, prefer `ShowWindow`
  with `SW_MINIMIZE`/`SW_MAXIMIZE` over `SetForegroundWindow` — the
  latter steals keyboard focus.
