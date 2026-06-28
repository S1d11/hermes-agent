import type { Dispatch, SetStateAction } from 'react'

import type { HermesGateway } from '@/hermes'
import type { IconComponent } from '@/lib/icons'
import type { EnvVarInfo } from '@/types/hermes'

export type SettingsView =
  | 'about'
  | 'gateway'
  | 'general'
  | 'keys'
  | 'mcp'
  | 'notifications'
  | 'providers'
  | 'sessions'
  | `config:${string}`
export type EnvPatch = Partial<Pick<EnvVarInfo, 'is_set' | 'redacted_value'>>

export interface SettingsPageProps {
  gateway?: HermesGateway | null
  onClose: () => void
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

export interface ProviderGroup {
  name: string
  priority: number
  entries: [string, EnvVarInfo][]
  hasAnySet: boolean
}

export interface ConfigSectionGroup {
  id: string
  /** i18n key under ``settings.sectionGroups`` — resolved at render time. */
  labelKey: string
  keys: string[]
}

export interface DesktopConfigSection {
  id: string
  label: string
  icon: IconComponent
  keys: string[]
  /**
   * Optional sub-groups within the section. When present, the renderer
   * inserts a sub-heading divider before each group's fields. The flat
   * ``keys`` array is still used for schema lookup; ``groups`` only
   * controls render ordering and headings.
   */
  groups?: ConfigSectionGroup[]
}

export interface EnvRowProps {
  varKey: string
  info: EnvVarInfo
  edits: Record<string, string>
  revealed: Record<string, string>
  saving: string | null
  setEdits: Dispatch<SetStateAction<Record<string, string>>>
  onSave: (key: string) => void
  onClear: (key: string) => void
  onReveal: (key: string) => void
  compact?: boolean
}
