import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { StatusDot, type StatusTone } from '@/components/status-dot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  deleteMcpServer,
  getMcpCatalog,
  getMcpServers,
  installMcpCatalogEntry,
  type McpCatalogEntry,
  type McpServerInfo,
  setMcpServerEnabled
} from '@/hermes'
import { type Translations, useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { ExternalLink, Plug, Trash2 } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import { runGatewayRestart } from '@/store/system-actions'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { PageSearchShell } from '../page-search-shell'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

interface ConnectionsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

const TRANSPORT_TONE: Record<string, StatusTone> = {
  http: 'good',
  stdio: 'warn',
  unknown: 'muted'
}

function authBadgeVariant(authType: string): 'default' | 'muted' | 'warn' {
  if (authType === 'oauth') {
    return 'default'
  }

  if (authType === 'api_key') {
    return 'warn'
  }

  return 'muted'
}

function transportTone(entry: McpCatalogEntry): StatusTone {
  return TRANSPORT_TONE[entry.transport] ?? 'muted'
}

export function ConnectionsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: ConnectionsViewProps) {
  const { t } = useI18n()
  const m = t.connections
  const restartGatewayAction = { label: t.commandCenter.restartGateway, onClick: () => void runGatewayRestart() }

  const [catalog, setCatalog] = useState<McpCatalogEntry[] | null>(null)
  const [servers, setServers] = useState<McpServerInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  // Selected catalog entry for the install modal
  const [installTarget, setInstallTarget] = useState<McpCatalogEntry | null>(null)
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({})

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRefreshing(true)
      }

      try {
        const [cat, srv] = await Promise.all([getMcpCatalog(), getMcpServers()])
        setCatalog(cat.entries)
        setServers(srv.servers)
      } catch (err) {
        if (!silent) {
          notifyError(err, m.loadFailed)
        }
      } finally {
        if (!silent) {
          setRefreshing(false)
        }
      }
    },
    [m]
  )

  useRefreshHotkey(() => void refresh())

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Auto-poll while visible so install/enable status updates without a manual
  // refresh. Pause when the tab is hidden.
  useEffect(() => {
    let cancelled = false

    function tick() {
      if (cancelled || document.hidden) {
        return
      }

      void refresh(true)
    }

    const id = window.setInterval(tick, 30_000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [refresh])

  const installedNames = useMemo(() => {
    return new Set(servers?.map(s => s.name) ?? [])
  }, [servers])

  const visibleEntries = useMemo(() => {
    if (!catalog) {
      return []
    }

    const q = query.trim().toLowerCase()

    if (!q) {
      return catalog
    }

    return catalog.filter(entry =>
      [entry.name, entry.description, entry.source, entry.transport, entry.auth_type]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [catalog, query])

  const visibleServers = useMemo(() => {
    if (!servers) {
      return []
    }

    const q = query.trim().toLowerCase()

    if (!q) {
      return servers
    }

    return servers.filter(srv =>
      [srv.name, srv.transport, srv.url, srv.command, ...(srv.tools ?? [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [servers, query])

  async function handleInstall(entry: McpCatalogEntry) {
    setInstalling(entry.name)

    try {
      const result = await installMcpCatalogEntry(entry.name, envDraft, true)

      if (result.background) {
        notify({
          kind: 'info',
          title: m.installingInBackground(entry.name),
          message: m.installBackgroundDetail
        })
      } else {
        notify({
          kind: 'success',
          title: m.installed(entry.name),
          message: m.restartToActivate,
          action: restartGatewayAction
        })
      }

      setInstallTarget(null)
      setEnvDraft({})
      void refresh()
    } catch (err) {
      notifyError(err, m.installFailed(entry.name))
    } finally {
      setInstalling(null)
    }
  }

  async function handleToggleServer(server: McpServerInfo, enabled: boolean) {
    setToggling(server.name)

    try {
      await setMcpServerEnabled(server.name, enabled)
      setServers(
        current =>
          current?.map(row => (row.name === server.name ? { ...row, enabled } : row)) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? m.serverEnabled(server.name) : m.serverDisabled(server.name),
        message: m.restartToApply,
        action: restartGatewayAction
      })
    } catch (err) {
      notifyError(err, m.failedToggle(server.name))
    } finally {
      setToggling(null)
    }
  }

  async function handleRemoveServer(server: McpServerInfo) {
    setRemoving(server.name)

    try {
      await deleteMcpServer(server.name)
      setServers(current => current?.filter(row => row.name !== server.name) ?? current)
      notify({
        kind: 'success',
        title: m.serverRemoved(server.name),
        message: m.restartToApply,
        action: restartGatewayAction
      })
    } catch (err) {
      notifyError(err, m.failedRemove(server.name))
    } finally {
      setRemoving(null)
    }
  }

  function openInstallModal(entry: McpCatalogEntry) {
    setEnvDraft({})
    setInstallTarget(entry)
  }

  const loading = catalog === null || servers === null
  const installedCount = servers?.filter(s => s.enabled).length ?? 0

  return (
    <PageSearchShell
      {...props}
      onSearchChange={setQuery}
      searchHidden={loading && !query}
      searchPlaceholder={m.search}
      searchTrailingAction={
        <Button
          aria-label={m.refresh}
          className="size-7 shrink-0 p-0"
          onClick={() => void refresh()}
          size="icon"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
        </Button>
      }
      searchValue={query}
    >
      {loading ? (
        <PageLoader label={m.loading} />
      ) : (
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-5 py-4">
            {/* Installed servers */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Plug className="size-4 text-(--ui-text-secondary)" />
                <h2 className="text-sm font-semibold text-foreground">{m.installedSection}</h2>
                <Badge variant="muted">{installedCount}</Badge>
              </div>

              {visibleServers.length === 0 ? (
                <p className="text-sm text-(--ui-text-tertiary)">{m.noServers}</p>
              ) : (
                <ul className="space-y-2">
                  {visibleServers.map(server => (
                    <InstalledServerRow
                      key={server.name}
                      labels={m}
                      onRemove={() => void handleRemoveServer(server)}
                      onToggle={enabled => void handleToggleServer(server, enabled)}
                      removing={removing === server.name}
                      server={server}
                      toggling={toggling === server.name}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* Catalog browser */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Codicon className="text-(--ui-text-secondary)" name="extensions" size="1rem" />
                <h2 className="text-sm font-semibold text-foreground">{m.catalogSection}</h2>
                <Badge variant="muted">{visibleEntries.length}</Badge>
              </div>

              {visibleEntries.length === 0 ? (
                <p className="text-sm text-(--ui-text-tertiary)">{m.noCatalogEntries}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleEntries.map(entry => (
                    <CatalogEntryCard
                      entry={entry}
                      installed={installedNames.has(entry.name)}
                      installing={installing === entry.name}
                      key={entry.name}
                      labels={m}
                      onInstall={() => openInstallModal(entry)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Install modal */}
      {installTarget && (
        <InstallModal
          entry={installTarget}
          envDraft={envDraft}
          installing={installing === installTarget.name}
          labels={m}
          onCancel={() => {
            setInstallTarget(null)
            setEnvDraft({})
          }}
          onEnvChange={setEnvDraft}
          onInstall={() => void handleInstall(installTarget)}
        />
      )}
    </PageSearchShell>
  )
}

// ─── Installed server row ───────────────────────────────────────────────────

function InstalledServerRow({
  onRemove,
  onToggle,
  removing,
  server,
  toggling,
  labels
}: {
  onRemove: () => void
  onToggle: (enabled: boolean) => void
  removing: boolean
  server: McpServerInfo
  toggling: boolean
  labels: Translations['connections']
}) {
  const tone = TRANSPORT_TONE[server.transport] ?? 'muted'
  const toolCount = server.tools?.length ?? 0

  return (
    <li className="flex items-center gap-3 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StatusDot tone={server.enabled ? 'good' : 'muted'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{server.name}</span>
            <Badge variant="muted">{server.transport}</Badge>
            {toolCount > 0 && <Badge variant="outline">{labels.toolsCount(toolCount)}</Badge>}
          </div>
          {server.url && (
            <p className="mt-0.5 truncate text-xs text-(--ui-text-tertiary)">{server.url}</p>
          )}
          {server.command && (
            <p className="mt-0.5 truncate text-xs text-(--ui-text-tertiary)">
              {server.command}
              {server.args.length > 0 ? ` ${server.args.join(' ')}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Switch checked={server.enabled} disabled={toggling} onCheckedChange={onToggle} />
        <Button
          aria-label={labels.remove}
          className="size-7 p-0 text-(--ui-text-tertiary) hover:text-destructive"
          disabled={removing}
          onClick={onRemove}
          size="icon"
          variant="ghost"
        >
          {removing ? (
            <Codicon name="loading" size="0.875rem" spinning />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      </div>
    </li>
  )
}

// ─── Catalog entry card ─────────────────────────────────────────────────────

function CatalogEntryCard({
  entry,
  installed,
  installing,
  onInstall,
  labels
}: {
  entry: McpCatalogEntry
  installed: boolean
  installing: boolean
  onInstall: () => void
  labels: Translations['connections']
}) {
  const tone = transportTone(entry)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) p-3 transition-colors hover:border-(--ui-stroke-primary)">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot tone={tone} />
            <span className="truncate text-sm font-medium text-foreground">{entry.name}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-(--ui-text-secondary)">{entry.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="muted">{entry.transport}</Badge>
        <Badge variant={authBadgeVariant(entry.auth_type)}>{labels.authType[entry.auth_type]}</Badge>
        {entry.needs_install && <Badge variant="warn">{labels.needsInstall}</Badge>}
        {installed && <Badge variant="default">{labels.installedBadge}</Badge>}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {entry.source ? (
          <button
            className="flex items-center gap-1 text-xs text-(--ui-text-tertiary) transition-colors hover:text-foreground"
            onClick={() => void openExternalLink(entry.source)}
            type="button"
          >
            <ExternalLink className="size-3" />
            <span className="truncate">{labels.source}</span>
          </button>
        ) : (
          <span />
        )}

        <Button
          disabled={installing}
          onClick={onInstall}
          size="sm"
          variant={installed ? 'outline' : 'default'}
        >
          {installing ? (
            <Codicon name="loading" size="0.875rem" spinning />
          ) : installed ? (
            labels.reinstall
          ) : (
            labels.install
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Install modal ──────────────────────────────────────────────────────────

function InstallModal({
  entry,
  envDraft,
  installing,
  onCancel,
  onEnvChange,
  onInstall,
  labels
}: {
  entry: McpCatalogEntry
  envDraft: Record<string, string>
  installing: boolean
  onCancel: () => void
  onEnvChange: (env: Record<string, string>) => void
  onInstall: () => void
  labels: Translations['connections']
}) {
  const requiredEnv = entry.required_env.filter(v => v.required)
  const optionalEnv = entry.required_env.filter(v => !v.required)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{entry.name}</h3>
            <p className="mt-1 text-sm text-(--ui-text-secondary)">{entry.description}</p>
          </div>
          <button
            className="shrink-0 text-(--ui-text-tertiary) hover:text-foreground"
            onClick={onCancel}
            type="button"
          >
            <Codicon name="close" size="1rem" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <Badge variant="muted">{entry.transport}</Badge>
          <Badge variant={authBadgeVariant(entry.auth_type)}>
            {labels.authType[entry.auth_type]}
          </Badge>
          {entry.needs_install && <Badge variant="warn">{labels.needsInstall}</Badge>}
        </div>

        {requiredEnv.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="text-sm font-medium text-foreground">{labels.requiredCredentials}</p>
            {requiredEnv.map(envVar => (
              <EnvInputField
                envVar={envVar}
                key={envVar.name}
                onChange={value => onEnvChange({ ...envDraft, [envVar.name]: value })}
                value={envDraft[envVar.name] ?? ''}
              />
            ))}
          </div>
        )}

        {optionalEnv.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="text-sm font-medium text-(--ui-text-secondary)">{labels.optionalCredentials}</p>
            {optionalEnv.map(envVar => (
              <EnvInputField
                envVar={envVar}
                key={envVar.name}
                onChange={value => onEnvChange({ ...envDraft, [envVar.name]: value })}
                value={envDraft[envVar.name] ?? ''}
              />
            ))}
          </div>
        )}

        {entry.post_install && (
          <div className="mb-4 rounded-md bg-muted/50 p-3">
            <p className="whitespace-pre-line text-xs text-(--ui-text-secondary)">
              {entry.post_install}
            </p>
          </div>
        )}

        {entry.auth_type === 'oauth' && (
          <p className="mb-4 text-xs text-(--ui-text-tertiary)">{labels.oauthHint}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="ghost">
            {labels.cancel}
          </Button>
          <Button
            disabled={installing || (requiredEnv.length > 0 && !requiredEnv.every(v => envDraft[v.name]?.trim()))}
            onClick={onInstall}
          >
            {installing ? (
              <>
                <Codicon name="loading" size="0.875rem" spinning />
                <span className="ml-1.5">{labels.installing}</span>
              </>
            ) : (
              labels.install
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EnvInputField({
  envVar,
  value,
  onChange
}: {
  envVar: { name: string; prompt: string; required: boolean }
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-(--ui-text-secondary)" htmlFor={envVar.name}>
        {envVar.prompt || envVar.name}
      </label>
      <Input
        className="h-8 text-sm"
        id={envVar.name}
        onChange={e => onChange(e.target.value)}
        placeholder={envVar.name}
        type="text"
        value={value}
      />
    </div>
  )
}
