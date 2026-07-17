import { useQuery } from '@tanstack/react-query'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getElevenLabsVoices, getHermesConfigSchema, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'

import { setHermesConfigCache, useHermesConfigRecord } from '../hooks/use-config-record'
import { useOnProfileSwitch } from '../hooks/use-on-profile-switch'
import { PanelEmpty } from '../overlays/panel'

import { CONTROL_TEXT, EMPTY_SELECT_VALUE, FIELD_DESCRIPTIONS, FIELD_LABELS, SECTIONS } from './constants'
import { FallbackModelsField } from './fallback-models-field'
import { fieldCopyForSchemaKey } from './field-copy'
import { enumOptionsFor, getNested, prettyName, setNested } from './helpers'
import { MemoryConnect } from './memory/connect'
import { ModelSettings, ModelSettingsSkeleton } from './model-settings'
import { EmptyState, ListRow, LoadingState, SettingsContent } from './primitives'
import { ProviderConfigPanel } from './provider-config-panel'

// On the Voice page, only surface the sub-fields of the *selected* TTS/STT
// provider — otherwise every provider's options render at once (the "totally
// crazy" wall of ~30 fields). Top-level keys (tts.provider, stt.enabled,
// voice.*) always show; STT provider fields hide entirely when STT is off.
export function voiceFieldVisible(key: string, config: HermesConfigRecord): boolean {
  const match = /^(tts|stt)\.([^.]+)\./.exec(key)

  if (!match) {
    return true
  }

  const [, domain, provider] = match

  if (domain === 'stt' && !getNested(config, 'stt.enabled')) {
    return false
  }

  return provider === String(getNested(config, `${domain}.provider`) ?? '')
}

function ProviderCategoryBadge({ category }: { category: 'on-device' | 'cloud' }) {
  const { t } = useI18n()
  const badge = t.settings.providerBadges[category]

  return (
    <Badge variant={category === 'on-device' ? 'default' : 'muted'}>
      {category === 'on-device' && <Codicon className="size-3" name="chip" />}
      {category === 'cloud' && <Codicon className="size-3" name="cloud" />}
      {badge}
    </Badge>
  )
}

function GroupedProviderSelect({
  schemaKey,
  selectOptions,
  value,
  optionLabels,
  onChange
}: {
  schemaKey: string
  selectOptions: string[]
  value: unknown
  optionLabels?: Record<string, string>
  onChange: (value: unknown) => void
}) {
  const { t } = useI18n()
  const c = t.settings.config
  const meta = PROVIDER_OPTION_META[schemaKey] ?? {}
  const labels = OPTION_LABELS[schemaKey] ?? {}
  const groupLabels = t.settings.providerGroups

  // Partition options into on-device / cloud groups, preserving the original
  // order from ENUM_OPTIONS within each group.
  const onDevice = selectOptions.filter(opt => (meta[opt]?.category ?? 'cloud') === 'on-device')
  const cloud = selectOptions.filter(opt => (meta[opt]?.category ?? 'cloud') === 'cloud')

  const renderGroup = (groupName: 'on-device' | 'cloud', opts: string[]) => {
    if (opts.length === 0) {
      return null
    }

    return (
      <SelectGroup key={groupName}>
        <SelectLabel>{groupLabels[groupName]}</SelectLabel>
        {opts.map(option => {
          const optMeta = meta[option]

          const displayLabel = option
            ? (optionLabels?.[option] ?? labels[option] ?? prettyName(option))
            : schemaKey === 'display.personality'
              ? c.none
              : c.noneParen

          return (
            <SelectItem key={option || EMPTY_SELECT_VALUE} value={option || EMPTY_SELECT_VALUE}>
              <span className="flex items-center gap-2">
                <span>{displayLabel}</span>
                {optMeta && (
                  <Badge variant={optMeta.category === 'on-device' ? 'default' : 'muted'}>
                    {optMeta.category === 'on-device' ? groupLabels.onDeviceShort : groupLabels.cloudShort}
                  </Badge>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectGroup>
    )
  }

  return (
    <Select
      onValueChange={next => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
      value={String(value ?? '') || EMPTY_SELECT_VALUE}
    >
      <SelectTrigger className={CONTROL_TEXT}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {renderGroup('on-device', onDevice)}
        {renderGroup('cloud', cloud)}
      </SelectContent>
    </Select>
  )
}

function ConfigField({
  schemaKey,
  schema,
  value,
  enumOptions,
  optionLabels,
  onChange,
  descriptionExtra
}: {
  schemaKey: string
  schema: ConfigFieldSchema
  value: unknown
  enumOptions?: string[]
  optionLabels?: Record<string, string>
  onChange: (value: unknown) => void
  descriptionExtra?: ReactNode
}) {
  const { t } = useI18n()
  const c = t.settings.config

  const label =
    fieldCopyForSchemaKey(t.settings.fieldLabels, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_LABELS, schemaKey) ??
    prettyName(schemaKey.split('.').pop() ?? schemaKey)

  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')

  const rawDescription = (
    fieldCopyForSchemaKey(t.settings.fieldDescriptions, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_DESCRIPTIONS, schemaKey) ??
    schema.description ??
    ''
  ).trim()

  const normalizedDesc = normalize(rawDescription)

  const description =
    rawDescription && normalizedDesc !== normalize(label) && normalizedDesc !== normalize(schemaKey)
      ? rawDescription
      : undefined

  const descriptionNode: ReactNode = descriptionExtra ? (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {description}
      {descriptionExtra}
    </span>
  ) : (
    description
  )

  const recommendation = fieldCopyForSchemaKey(FIELD_RECOMMENDATIONS, schemaKey)

  const row = (action: ReactNode, wide = false) => (
    <ListRow action={action} description={descriptionNode} recommendation={recommendation} title={label} wide={wide} />
  )

  // `fallback_providers` is a list of {provider, model} objects; the generic
  // `list` branch below would stringify them to "[object Object]". Render the
  // dedicated structured editor instead.
  if (schemaKey === 'fallback_providers') {
    return row(<FallbackModelsField onChange={onChange} value={value} />, true)
  }

  if (schema.type === 'boolean') {
    return row(
      <div className="flex items-center justify-end">
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    )
  }

  const selectOptions = enumOptions ?? (schema.type === 'select' ? (schema.options ?? []).map(String) : undefined)

  // Provider badge shown next to the field description when a provider is
  // selected and we have category metadata for it.
  const providerMetaForCurrent = PROVIDER_OPTION_META[schemaKey]?.[String(value ?? '')]

  const providerBadge: ReactNode | undefined = providerMetaForCurrent ? (
    <ProviderCategoryBadge category={providerMetaForCurrent.category} />
  ) : undefined

  const descriptionWithBadge: ReactNode = providerBadge ? (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {description}
      {providerBadge}
    </span>
  ) : (
    descriptionNode
  )

  const rowWithBadge = (action: ReactNode, wide = false) => (
    <ListRow action={action} description={descriptionWithBadge} recommendation={recommendation} title={label} wide={wide} />
  )

  if (selectOptions) {
    // Grouped select for provider-type fields (stt.provider, tts.provider,
    // terminal.backend, memory.provider) — options are split into
    // "On-device" and "Cloud" groups with badges in each item.
    if (GROUPED_PROVIDER_KEYS.has(schemaKey)) {
      return rowWithBadge(
        <GroupedProviderSelect
          onChange={onChange}
          optionLabels={optionLabels}
          schemaKey={schemaKey}
          selectOptions={selectOptions}
          value={value}
        />
      )
    }

    return rowWithBadge(
      <Select
        onValueChange={next => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
        value={String(value ?? '') || EMPTY_SELECT_VALUE}
      >
        <SelectTrigger className={CONTROL_TEXT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectOptions.map(option => (
            <SelectItem key={option || EMPTY_SELECT_VALUE} value={option || EMPTY_SELECT_VALUE}>
              {option
                ? (optionLabels?.[option] ?? prettyName(option))
                : schemaKey === 'display.personality'
                  ? c.none
                  : c.noneParen}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (schema.type === 'number') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e => {
          const raw = e.target.value
          const n = raw === '' ? 0 : Number(raw)

          if (!Number.isNaN(n)) {
            onChange(n)
          }
        }}
        placeholder={c.notSet}
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
      />
    )
  }

  if (schema.type === 'list') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e =>
          onChange(
            e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={c.commaSeparated}
        value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return row(
      <Textarea
        className={cn('min-h-28 resize-y bg-background font-mono', CONTROL_TEXT)}
        onChange={e => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            /* keep last valid */
          }
        }}
        placeholder={c.notSet}
        spellCheck={false}
        value={JSON.stringify(value, null, 2)}
      />,
      true
    )
  }

  const isLong = schema.type === 'text' || String(value ?? '').length > 100

  return row(
    isLong ? (
      <Textarea
        className={cn('min-h-24 resize-y bg-background', CONTROL_TEXT)}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ) : (
      <Input
        className={CONTROL_TEXT}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ),
    isLong
  )
}

export function ConfigSettings({
  activeSectionId,
  onConfigSaved,
  onMainModelChanged,
  importInputRef
}: {
  activeSectionId: string
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
  importInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useI18n()
  const c = t.settings.config
  // The editable draft is local (debounced autosave watches it), but it's seeded
  // from — and saved back through — the shared config cache, so edits are visible
  // in the MCP/model surfaces and reopening the page doesn't reload-flash.
  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const { data: loadedConfig, isError: configLoadFailed, refetch: refetchConfig } = useHermesConfigRecord()

  const {
    data: schemaResponse,
    isError: schemaFailed,
    refetch: refetchSchema
  } = useQuery({
    queryKey: ['hermes-config-schema'],
    queryFn: getHermesConfigSchema,
    staleTime: 5 * 60 * 1000
  })

  const schema = schemaResponse?.fields ?? null
  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState<string[] | null>(null)
  const [elevenLabsVoiceLabels, setElevenLabsVoiceLabels] = useState<Record<string, string>>({})
  const saveVersionRef = useRef(0)
  const [saveVersion, setSaveVersion] = useState(0)

  // Seed the local draft once, the first time the shared record lands.
  // Background refetches thereafter must not clobber in-progress edits.
  const configSeeded = useRef(false)

  useEffect(() => {
    if (loadedConfig && !configSeeded.current) {
      configSeeded.current = true
      setConfig(loadedConfig)
    }
  }, [loadedConfig])

  // A profile switch invalidates (but doesn't clear) the shared config query, so
  // the local draft would otherwise keep profile A's data and autosave it into
  // B. Drop the seed + draft (re-seeds from B's refetch) and zero saveVersion so
  // the pending debounced autosave is cancelled by its effect cleanup.
  useOnProfileSwitch(() => {
    configSeeded.current = false
    setConfig(null)
    saveVersionRef.current = 0
    setSaveVersion(0)
  })

  useEffect(() => {
    let cancelled = false

    getElevenLabsVoices()
      .then(result => {
        if (cancelled || !result.available) {
          return
        }

        setElevenLabsVoiceOptions(result.voices.map(voice => voice.voice_id))
        setElevenLabsVoiceLabels(Object.fromEntries(result.voices.map(voice => [voice.voice_id, voice.label])))
      })
      .catch(() => {
        if (!cancelled) {
          setElevenLabsVoiceOptions(null)
          setElevenLabsVoiceLabels({})
        }
      })

    return () => void (cancelled = true)
  }, [])

  useEffect(() => {
    if (!config || saveVersion === 0) {
      return
    }

    const v = saveVersion

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveHermesConfig(config)
          // Mirror the saved record into the shared cache so MCP/model surfaces
          // reflect the edit without their own refetch.
          setHermesConfigCache(config)

          if (saveVersionRef.current === v) {
            onConfigSaved?.()
          }
        } catch (err) {
          if (saveVersionRef.current === v) {
            notifyError(err, c.autosaveFailed)
          }
        }
      })()
    }, 550)

    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copy is stable; avoid re-scheduling autosave on locale change
  }, [config, onConfigSaved, saveVersion])

  const updateConfig = (next: HermesConfigRecord) => {
    saveVersionRef.current += 1
    setConfig(next)
    setSaveVersion(saveVersionRef.current)
  }

  const sectionFields = useMemo(() => {
    if (!schema) {
      return new Map<string, [string, ConfigFieldSchema][]>()
    }

    return new Map(
      SECTIONS.map(s => [s.id, s.keys.flatMap(k => (schema[k] ? [[k, schema[k]] as [string, ConfigFieldSchema]] : []))])
    )
  }, [schema])

  const activeSection = SECTIONS.find(s => s.id === activeSectionId)
  const fields = sectionFields.get(activeSectionId) ?? []
  const isVoiceSection = activeSectionId === 'voice'

  // Build grouped field lists when the section defines sub-groups. Must run
  // before any early return so hook order is stable across renders.
  const groupedVisibleFields = useMemo(() => {
    if (!activeSection?.groups || !config || !schema) {
      return null
    }

    return activeSection.groups
      .map(group => {
        const groupFields = group.keys
          .filter(key => schema[key])
          .filter(key => !isVoiceSection || voiceFieldVisible(key, config))
          .map(key => [key, schema[key]] as [string, ConfigFieldSchema])

        return { group, fields: groupFields }
      })
      .filter(entry => entry.fields.length > 0)
  }, [activeSection, config, isVoiceSection, schema])

  // Deep-link target from the command palette (?field=<key>): scroll the row
  // into view and flash it, then drop the param so it doesn't re-fire.
  const [searchParams, setSearchParams] = useSearchParams()
  const targetField = searchParams.get('field')

  useEffect(() => {
    if (!targetField || !config || !schema) {
      return
    }

    const element = document.getElementById(`setting-field-${targetField}`)

    if (!element) {
      return
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.add('setting-field-highlight')

    const timeout = window.setTimeout(() => element.classList.remove('setting-field-highlight'), 1600)

    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous)
        next.delete('field')

        return next
      },
      { replace: true }
    )

    return () => window.clearTimeout(timeout)
  }, [config, schema, setSearchParams, targetField])

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        updateConfig(JSON.parse(String(reader.result)))
        notify({ kind: 'success', title: c.imported, message: t.common.saving })
      } catch (err) {
        notifyError(err, c.invalidJson)
      }
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  if (!config || !schema) {
    // A failed config/schema fetch must surface a retry, not spin forever.
    if ((configLoadFailed && !config) || (schemaFailed && !schema)) {
      return (
        <div className="flex h-full min-h-0 flex-1">
          <PanelEmpty
            action={
              <Button
                onClick={() => {
                  void refetchConfig()
                  void refetchSchema()
                }}
                size="sm"
              >
                {t.skills.refresh}
              </Button>
            }
            icon="error"
            title={c.failedLoad}
          />
        </div>
      )
    }

    // Model keeps its shape via a skeleton (its catalog fetch is the slow part);
    // other sections are quick config/schema reads, so a light loader is fine.
    if (activeSectionId === 'model') {
      return (
        <SettingsContent>
          <div className="mb-6">
            <ModelSettingsSkeleton />
          </div>
        </SettingsContent>
      )
    }

    return <LoadingState label={c.loading} />
  }

  // Capture narrowed config/schema for use inside nested closures (TypeScript
  // does not preserve null-narrowing of the state variables inside them).
  const cfg = config
  const schemaMap = schema

  const visibleFields = isVoiceSection ? fields.filter(([key]) => voiceFieldVisible(key, cfg)) : fields

  function renderConfigField(key: string, field: ConfigFieldSchema) {
    return (
      <div className="scroll-mt-6 rounded-lg" id={`setting-field-${key}`} key={key}>
        <ConfigField
          descriptionExtra={
            key === 'memory.provider' && Boolean(getNested(cfg, key)) ? (
              <MemoryConnect provider={String(getNested(cfg, key))} />
            ) : undefined
          }
          enumOptions={
            key === 'tts.elevenlabs.voice_id'
              ? enumOptionsFor(key, getNested(cfg, key), cfg, elevenLabsVoiceOptions ?? undefined)
              : enumOptionsFor(key, getNested(cfg, key), cfg)
          }
          onChange={value => updateConfig(setNested(cfg, key, value))}
          optionLabels={key === 'tts.elevenlabs.voice_id' ? elevenLabsVoiceLabels : undefined}
          schema={field}
          schemaKey={key}
          value={getNested(cfg, key)}
        />
        {key === 'memory.provider' && typeof getNested(cfg, key) === 'string' && getNested(cfg, key) ? (
          <ProviderConfigPanel provider={String(getNested(cfg, key))} />
        ) : null}
      </div>
    )
  }

  const hasContent = groupedVisibleFields
    ? groupedVisibleFields.some(entry => entry.fields.length > 0)
    : visibleFields.length > 0

  return (
    <SettingsContent>
      {activeSectionId === 'model' && (
        <div className="mb-6">
          <ModelSettings onMainModelChanged={onMainModelChanged} />
        </div>
      )}
      {!hasContent ? (
        <EmptyState description={c.emptyDesc} title={c.emptyTitle} />
      ) : groupedVisibleFields ? (
        <div className="grid gap-1">
          {groupedVisibleFields.map(({ group, fields: groupFields }) => (
            <div key={group.id}>
              <div className="mb-1 mt-4 flex items-center gap-2 border-b border-(--ui-stroke-secondary) pb-1.5 first:mt-0">
                <span className="text-[length:var(--conversation-text-font-size)] font-medium text-foreground">
                  {t.settings.sectionGroups[group.labelKey] ?? prettyName(group.labelKey)}
                </span>
              </div>
              {groupFields.map(([key, field]) => renderConfigField(key, field))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-1">
          {visibleFields.map(([key, field]) => renderConfigField(key, field))}
        </div>
      )}
      <input
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
        ref={importInputRef}
        type="file"
      />
    </SettingsContent>
  )
}
