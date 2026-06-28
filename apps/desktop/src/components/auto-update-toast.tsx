// auto-update-toast.tsx — Binary auto-update notification for Zeus desktop.
//
// Shows a toast notification when a new app version is available from
// GitHub releases. Lets the user download and install the update without
// leaving the app. Uses electron-updater under the hood (via IPC).
//
// This is separate from the git-based update system (updates-overlay.tsx)
// which handles source installs. This component handles packaged app
// updates (NSIS installer auto-update).

import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw, X, CheckCircle2, AlertCircle, Loader2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type AutoUpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface AutoUpdateInfo {
  state: AutoUpdateState
  version?: string
  releaseNotes?: string
  downloadPercent?: number
  errorMessage?: string
  currentVersion?: string
}

const $autoUpdate = atom<AutoUpdateInfo>({ state: 'idle' })

function setAutoUpdateInfo(info: Partial<AutoUpdateInfo>) {
  $autoUpdate.set({ ...$autoUpdate.get(), ...info })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutoUpdateToast() {
  const update = useStore($autoUpdate)
  const [dismissed, setDismissed] = useState(false)

  // Listen to auto-updater events from the main process
  useEffect(() => {
    const desktop = window.hermesDesktop as any
    if (!desktop?.zeus) return

    // Subscribe to update events
    const unsubEvents = desktop.zeus.onUpdateEvent((event: any) => {
      switch (event.type) {
        case 'checking-for-update':
          setAutoUpdateInfo({ state: 'checking' })
          setDismissed(false)
          break
        case 'update-available':
          setAutoUpdateInfo({ state: 'available', version: event.data?.version, releaseNotes: event.data?.releaseNotes })
          setDismissed(false)
          break
        case 'update-not-available':
          setAutoUpdateInfo({ state: 'not-available' })
          break
        case 'download-progress':
          setAutoUpdateInfo({ state: 'downloading', downloadPercent: event.data?.percent })
          break
        case 'update-downloaded':
          setAutoUpdateInfo({ state: 'downloaded', version: event.data?.version })
          setDismissed(false)
          break
        case 'error':
          setAutoUpdateInfo({ state: 'error', errorMessage: event.data?.message })
          break
      }
    })

    // Listen for notification clicks (from OS notification)
    const unsubNotif = desktop.zeus.onUpdateNotificationClicked((payload: any) => {
      if (payload?.action === 'download') {
        handleDownload()
      }
    })

    // Check current status on mount
    desktop.zeus.getUpdateStatus().then((status: any) => {
      if (status?.updateAvailable) {
        setAutoUpdateInfo({ state: 'available', version: status.updateAvailable.version })
      } else if (status?.updateDownloaded) {
        setAutoUpdateInfo({ state: 'downloaded', version: status.updateDownloaded.version })
      } else if (status?.currentVersion) {
        setAutoUpdateInfo({ currentVersion: status.currentVersion })
      }
    })

    return () => {
      unsubEvents?.()
      unsubNotif?.()
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const desktop = window.hermesDesktop as any
    if (!desktop?.zeus) return
    setAutoUpdateInfo({ state: 'downloading', downloadPercent: 0 })
    await desktop.zeus.downloadUpdate()
  }, [])

  const handleInstall = useCallback(async () => {
    const desktop = window.hermesDesktop as any
    if (!desktop?.zeus) return
    await desktop.zeus.installUpdate()
    // The app will quit and restart — this code won't execute
  }, [])

  const handleCheckNow = useCallback(async () => {
    const desktop = window.hermesDesktop as any
    if (!desktop?.zeus) return
    setDismissed(false)
    await desktop.zeus.checkForUpdates()
  }, [])

  // Don't render if dismissed, idle, checking, or not-available
  if (dismissed || update.state === 'idle' || update.state === 'checking' || update.state === 'not-available') {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-96 rounded-lg border p-4 shadow-lg',
        'bg-background text-foreground border-border',
        'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Close button */}
      {update.state !== 'downloading' && (
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}

      {/* Update available */}
      {update.state === 'available' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Download size={20} className="text-blue-500" />
            <span className="font-semibold">Update Available</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Zeus v{update.version} is ready to download. You're currently running v{update.currentVersion}.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleDownload}>
              <Download size={14} className="mr-1" />
              Download Update
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Later
            </Button>
          </div>
        </div>
      )}

      {/* Downloading */}
      {update.state === 'downloading' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Loader2 size={20} className="animate-spin text-blue-500" />
            <span className="font-semibold">Downloading Update...</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${update.downloadPercent ?? 0}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{update.downloadPercent ?? 0}% complete</p>
        </div>
      )}

      {/* Downloaded — ready to install */}
      {update.state === 'downloaded' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            <span className="font-semibold">Update Ready</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Zeus v{update.version} has been downloaded. Restart to install the update.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall}>
              <RefreshCw size={14} className="mr-1" />
              Restart & Install
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Later
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {update.state === 'error' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" />
            <span className="font-semibold">Update Check Failed</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {update.errorMessage || 'An error occurred while checking for updates.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleCheckNow}>
              Try Again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
