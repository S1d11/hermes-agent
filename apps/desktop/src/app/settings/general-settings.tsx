// general-settings.tsx — General settings tab for Hermes desktop.
//
// Houses app-wide preferences:
//   - Auto-launch on startup
//   - Start minimized to tray
//   - Close to tray (vs fully quit)
//   - Minimize to tray (vs taskbar)
//   - Wake word ("Hey Hermes") enable/disable
//   - Automatic update checks

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Loader2, RefreshCw, Settings2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  $generalPrefs,
  setAutoLaunchOnStartup,
  setCheckForUpdatesAutomatically,
  setCloseToTray,
  setMinimizeToTray,
  setRelaunchLastSession,
  setStartMinimized,
  setWakeWordEnabled,
} from '@/store/general-settings'
import { $updateChecking, $updateStatus, checkUpdates, openUpdatesWindow } from '@/store/updates'

import { RecommendationBadge, SectionHeading, SettingsContent } from './primitives'

const CAPTION = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'

function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn(CAPTION, className)}>{children}</p>
}

/** A card that groups related settings with a header label. */
function SettingsCard({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) overflow-hidden">
      <div className="px-4 pt-3 pb-1 text-xs font-semibold text-(--ui-text-secondary) uppercase tracking-wide">
        {label}
      </div>
      <div className="divide-y divide-(--ui-stroke-secondary)/50">{children}</div>
    </div>
  )
}

/** A single toggle row inside a settings card. */
function ToggleRow(props: {
  checked: boolean
  description: string
  disabled?: boolean
  label: string
  onChange: (on: boolean) => void
  recommendation?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{props.label}</div>
        <div className="mt-0.5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {props.description}
        </div>
        <RecommendationBadge text={props.recommendation} />
      </div>
      <Switch
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={on => {
          triggerHaptic('selection')
          props.onChange(on)
        }}
      />
    </div>
  )
}

export function GeneralSettings() {
  const { t } = useI18n()
  const prefs = useStore($generalPrefs)
  const copy = t.settings.general
  const updateChecking = useStore($updateChecking)
  const updateStatus = useStore($updateStatus)
  const [wakeWordListening, setWakeWordListening] = useState(false)
  const [wakeWordDepsMissing, setWakeWordDepsMissing] = useState<string[] | null>(null)
  const [wakeWordError, setWakeWordError] = useState<string | null>(null)

  // Check actual wake word listener status and dependency availability on mount
  useEffect(() => {
    const desktop = window.hermesDesktop as any

    if (!desktop?.hermes?.getWakeWordStatus) {return}
    desktop.hermes.getWakeWordStatus().then((status: { listening: boolean }) => {
      setWakeWordListening(status.listening)
    })

    if (desktop.hermes.checkWakeWordDeps) {
      desktop.hermes.checkWakeWordDeps().then((deps: { available: boolean; missing: string[] }) => {
        if (!deps.available) {setWakeWordDepsMissing(deps.missing)}
      })
    }

    // Listen for runtime errors from the wake word process
    if (desktop.hermes.onWakeWordError) {
      const unsubscribe = desktop.hermes.onWakeWordError((msg: string) => {
        setWakeWordError(msg)
      })

      return unsubscribe
    }
  }, [])

  const handleWakeWordToggle = (on: boolean) => {
    if (on && wakeWordDepsMissing && wakeWordDepsMissing.length > 0) {
      // Don't enable if deps are missing — the toggle will visually stay off
      return
    }

    setWakeWordEnabled(on)
    setWakeWordListening(on)
  }

  return (
    <SettingsContent>
      <SectionHeading icon={Settings2} title={copy.title} />
      <Caption className="mb-4 leading-(--conversation-caption-line-height)">{copy.intro}</Caption>

      <div className="flex flex-col gap-3">
        {/* --- Startup --- */}
        <SettingsCard label={copy.startupSection}>
          <ToggleRow
            checked={prefs.autoLaunchOnStartup}
            description={copy.autoLaunchDesc}
            label={copy.autoLaunch}
            onChange={setAutoLaunchOnStartup}
            recommendation={copy.autoLaunchRec}
          />
          <ToggleRow
            checked={prefs.startMinimized}
            description={copy.startMinimizedDesc}
            disabled={!prefs.autoLaunchOnStartup}
            label={copy.startMinimized}
            onChange={setStartMinimized}
            recommendation={copy.startMinimizedRec}
          />
          <ToggleRow
            checked={prefs.relaunchLastSession}
            description={copy.relaunchLastSessionDesc}
            label={copy.relaunchLastSession}
            onChange={setRelaunchLastSession}
            recommendation={copy.relaunchLastSessionRec}
          />
        </SettingsCard>

        {/* --- Window behavior --- */}
        <SettingsCard label={copy.windowSection}>
          <ToggleRow
            checked={prefs.closeToTray}
            description={copy.closeToTrayDesc}
            label={copy.closeToTray}
            onChange={setCloseToTray}
            recommendation={copy.closeToTrayRec}
          />
          <ToggleRow
            checked={prefs.minimizeToTray}
            description={copy.minimizeToTrayDesc}
            label={copy.minimizeToTray}
            onChange={setMinimizeToTray}
            recommendation={copy.minimizeToTrayRec}
          />
        </SettingsCard>

        {/* --- Voice --- */}
        <SettingsCard label={copy.voiceSection}>
          <ToggleRow
            checked={wakeWordListening}
            description={copy.wakeWordDesc}
            disabled={!!wakeWordDepsMissing}
            label={copy.wakeWord}
            onChange={handleWakeWordToggle}
            recommendation={copy.wakeWordRec}
          />
          {wakeWordDepsMissing && wakeWordDepsMissing.length > 0 && (
            <div className="px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">
              Missing dependencies: {wakeWordDepsMissing.join(', ')}. Install with: pip install SpeechRecognition PyAudio
            </div>
          )}
          {wakeWordError && (
            <div className="px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400">
              {wakeWordError}
            </div>
          )}
        </SettingsCard>

        {/* --- Updates --- */}
        <SettingsCard label={copy.updatesSection}>
          <ToggleRow
            checked={prefs.checkForUpdatesAutomatically}
            description={copy.autoUpdatesDesc}
            label={copy.autoUpdates}
            onChange={setCheckForUpdatesAutomatically}
            recommendation={copy.autoUpdatesRec}
          />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {updateChecking
                ? copy.checking
                : updateStatus?.error
                  ? copy.checkFailed
                  : (updateStatus?.behind ?? 0) > 0
                    ? copy.updateAvailable(updateStatus!.behind!)
                    : updateStatus
                      ? copy.upToDate
                      : ''}
            </div>
            <div className="flex items-center gap-2">
              {(updateStatus?.behind ?? 0) > 0 && !updateChecking && (
                <Button onClick={() => openUpdatesWindow()} size="sm" variant="textStrong">
                  {t.settings.about.seeWhatsNew}
                </Button>
              )}
              <Button
                disabled={updateChecking}
                onClick={() => void checkUpdates()}
                size="sm"
                variant="text"
              >
                {updateChecking ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                {copy.checkNow}
              </Button>
            </div>
          </div>
        </SettingsCard>
      </div>
    </SettingsContent>
  )
}
