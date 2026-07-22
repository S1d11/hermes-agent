// general-settings.ts — Persistent general preferences for Hermes desktop.
//
// Stores user preferences that live in the General settings tab:
//   - autoLaunchOnStartup: whether Hermes starts when the OS boots
//   - closeToTray: whether closing the window hides to tray (true) or quits (false)
//   - wakeWordEnabled: whether the "Hey Hermes" voice wake word listener is active
//   - minimizeToTrayOnMinimize: whether minimizing also hides to tray
//   - startMinimized: whether auto-launch starts Hermes minimized to tray
//   - checkForUpdatesAutomatically: whether to auto-check for app updates
//   - relaunchLastSession: whether a relaunch reopens the last-open chat (true)
//     or lands on a fresh new chat (false, the default)
//
// Preferences are persisted to localStorage and synced with the main process
// via IPC (the main process handles the actual auto-launch registration and
// close-to-tray behavior).

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

export interface GeneralPrefs {
  autoLaunchOnStartup: boolean
  closeToTray: boolean
  wakeWordEnabled: boolean
  minimizeToTray: boolean
  startMinimized: boolean
  checkForUpdatesAutomatically: boolean
  relaunchLastSession: boolean
}

const STORAGE_KEY = 'hermes:general-settings'

const DEFAULT_PREFS: GeneralPrefs = {
  autoLaunchOnStartup: false,
  closeToTray: true,
  wakeWordEnabled: false,
  minimizeToTray: false,
  startMinimized: false,
  checkForUpdatesAutomatically: true,
  // Default off: a relaunch opens a fresh new chat instead of reopening the
  // last one. Users who prefer to pick up where they left off can opt in.
  relaunchLastSession: false,
}

function readPrefs(): GeneralPrefs {
  const raw = storedString(STORAGE_KEY)

  if (!raw) {return DEFAULT_PREFS}

  try {
    const parsed = JSON.parse(raw) as Partial<GeneralPrefs>

    return {
      autoLaunchOnStartup: parsed.autoLaunchOnStartup ?? DEFAULT_PREFS.autoLaunchOnStartup,
      closeToTray: parsed.closeToTray ?? DEFAULT_PREFS.closeToTray,
      wakeWordEnabled: parsed.wakeWordEnabled ?? DEFAULT_PREFS.wakeWordEnabled,
      minimizeToTray: parsed.minimizeToTray ?? DEFAULT_PREFS.minimizeToTray,
      startMinimized: parsed.startMinimized ?? DEFAULT_PREFS.startMinimized,
      checkForUpdatesAutomatically: parsed.checkForUpdatesAutomatically ?? DEFAULT_PREFS.checkForUpdatesAutomatically,
      relaunchLastSession: parsed.relaunchLastSession ?? DEFAULT_PREFS.relaunchLastSession,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export const $generalPrefs = atom<GeneralPrefs>(readPrefs())

/** Reactive flag: is the wake word listener currently active? */
export const $wakeWordListening = atom<boolean>(false)

function writePrefs(next: GeneralPrefs) {
  $generalPrefs.set(next)
  persistString(STORAGE_KEY, JSON.stringify(next))
}

// Sync a single preference to the main process via IPC.
async function syncToMain(key: string, value: boolean) {
  const desktop = window.hermesDesktop as any

  if (!desktop?.hermes?.setGeneralPref) {return}

  try {
    await desktop.hermes.setGeneralPref(key, value)
  } catch {
    // IPC not available (dev mode, etc.) — preferences still persist locally
  }
}

export function setAutoLaunchOnStartup(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), autoLaunchOnStartup: enabled })
  void syncToMain('autoLaunchOnStartup', enabled)
}

export function setCloseToTray(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), closeToTray: enabled })
  void syncToMain('closeToTray', enabled)
}

export function setWakeWordEnabled(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), wakeWordEnabled: enabled })
  $wakeWordListening.set(enabled)
  // Also toggle the actual wake word listener via IPC
  const desktop = window.hermesDesktop as any

  if (desktop?.hermes?.toggleWakeWord) {
    void desktop.hermes.toggleWakeWord()
  }
}

/** Start the wake word listener on app boot if the user has it enabled.
 *  Only starts — never stops. Safe to call on every boot. */
export async function autoStartWakeWord() {
  const prefs = $generalPrefs.get()

  if (!prefs.wakeWordEnabled) {return}
  const desktop = window.hermesDesktop as any

  if (!desktop?.hermes?.getWakeWordStatus || !desktop?.hermes?.toggleWakeWord) {return}

  try {
    const status = await desktop.hermes.getWakeWordStatus()

    if (!status.listening) {
      await desktop.hermes.toggleWakeWord()
    }

    $wakeWordListening.set(true)
  } catch {
    // Best-effort — don't block boot
  }
}

export function setMinimizeToTray(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), minimizeToTray: enabled })
  void syncToMain('minimizeToTray', enabled)
}

export function setStartMinimized(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), startMinimized: enabled })
  void syncToMain('startMinimized', enabled)
}

export function setCheckForUpdatesAutomatically(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), checkForUpdatesAutomatically: enabled })
  void syncToMain('checkForUpdatesAutomatically', enabled)
}

// Renderer-only preference (no main-process mirror): controls whether the
// desktop controller restores the last-open chat on relaunch.
export function setRelaunchLastSession(enabled: boolean) {
  writePrefs({ ...$generalPrefs.get(), relaunchLastSession: enabled })
}

// Sync all prefs to the main process on app launch (called from the controller)
export async function syncAllPrefsToMain() {
  const prefs = $generalPrefs.get()
  await Promise.all([
    syncToMain('autoLaunchOnStartup', prefs.autoLaunchOnStartup),
    syncToMain('closeToTray', prefs.closeToTray),
    syncToMain('minimizeToTray', prefs.minimizeToTray),
    syncToMain('startMinimized', prefs.startMinimized),
    syncToMain('checkForUpdatesAutomatically', prefs.checkForUpdatesAutomatically),
  ])
}
