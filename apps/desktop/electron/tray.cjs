// tray.cjs — System tray integration for Zeus desktop.
//
// Creates a system tray icon with a context menu that lets the user:
//   - Show/hide the main window
//   - Toggle the wake word listener ("Hey Zeus")
//   - Quit the app
//
// When the tray is active, closing the main window hides it to the tray
// instead of quitting the app (on all platforms, not just macOS).
// The app only truly quits via the tray's "Quit" menu item or
// app.quit() from elsewhere.
//
// Exports:
//   createTray(mainWindowRef, opts) → Tray
//     mainWindowRef: { get: () => BrowserWindow | null }
//     opts: { onQuit: () => void, onToggleWakeWord: () => boolean }
//       onToggleWakeWord is called when the user clicks the toggle;
//       it should return the new enabled state (true/false).
//   destroyTray()
//   showWindowFromTray()
//   updateTrayTooltip(text)
//   setWakeWordMenuItemEnabled(enabled)

"use strict";

const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

let tray = null;
let mainWindowRef = null;
let onQuitCallback = null;
let onToggleWakeWordCallback = null;
let wakeWordEnabled = false;

// ---------------------------------------------------------------------------
// Icon resolution
// ---------------------------------------------------------------------------

function resolveTrayIcon() {
  // On macOS, tray icons should be template images (monochrome).
  // On Windows/Linux, use the full-color icon.
  const appRoot = path.resolve(__dirname, "..");
  const candidates = [
    path.join(appRoot, "assets", "icon.ico"),
    path.join(appRoot, "assets", "icon.png"),
    path.join(appRoot, "public", "apple-touch-icon.png"),
    path.join(appRoot, "dist", "apple-touch-icon.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const img = nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          // On macOS, mark as template for automatic dark/light adaptation
          if (process.platform === "darwin") {
            img.setTemplateImage(true);
          }
          return img;
        }
      } catch {
        // fall through to next candidate
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Window management helpers
// ---------------------------------------------------------------------------

function getMainWindow() {
  return mainWindowRef?.get?.() ?? null;
}

function showWindowFromTray() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function hideWindowToTray() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.hide();
}

function toggleWindowVisibility() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused()) {
    hideWindowToTray();
  } else {
    showWindowFromTray();
  }
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function buildContextMenu() {
  const win = getMainWindow();
  const isVisible = win && !win.isDestroyed() && win.isVisible();

  return Menu.buildFromTemplate([
    {
      label: isVisible ? "Hide Zeus" : "Show Zeus",
      click: () => {
        if (isVisible) {
          hideWindowToTray();
        } else {
          showWindowFromTray();
        }
      },
    },
    { type: "separator" },
    {
      label: "Wake Word (\"Hey Zeus\")",
      type: "checkbox",
      checked: wakeWordEnabled,
      click: () => {
        if (onToggleWakeWordCallback) {
          wakeWordEnabled = onToggleWakeWordCallback();
        } else {
          wakeWordEnabled = !wakeWordEnabled;
        }
        // Rebuild menu to update the checkbox state
        if (tray) tray.setContextMenu(buildContextMenu());
      },
    },
    { type: "separator" },
    {
      label: "Quit Zeus",
      click: () => {
        if (onQuitCallback) onQuitCallback();
        // Force quit — the app.on("before-quit") handler cleans up
        const { app } = require("electron");
        app.quit();
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the system tray.
 *
 * @param {Object} ref - { get: () => BrowserWindow | null }
 * @param {Object} opts - { onQuit: Function, onToggleWakeWord: Function }
 * @returns {Tray|null}
 */
function createTray(ref, opts = {}) {
  mainWindowRef = ref;
  onQuitCallback = opts.onQuit || null;
  onToggleWakeWordCallback = opts.onToggleWakeWord || null;

  const icon = resolveTrayIcon();
  if (!icon) {
    console.error("[tray] No valid icon found, skipping tray creation");
    return null;
  }

  tray = new Tray(icon);
  tray.setToolTip("Zeus — click to show/hide");

  tray.on("click", () => {
    toggleWindowVisibility();
  });

  tray.on("right-click", () => {
    tray.popUpContextMenu(buildContextMenu());
  });

  // Set context menu (also accessible via right-click on some platforms)
  tray.setContextMenu(buildContextMenu());

  return tray;
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function updateTrayTooltip(text) {
  if (tray) {
    tray.setToolTip(text);
  }
}

function setWakeWordMenuItemEnabled(enabled) {
  wakeWordEnabled = enabled;
  if (tray) {
    tray.setContextMenu(buildContextMenu());
  }
}

module.exports = {
  createTray,
  destroyTray,
  showWindowFromTray,
  updateTrayTooltip,
  setWakeWordMenuItemEnabled,
};
