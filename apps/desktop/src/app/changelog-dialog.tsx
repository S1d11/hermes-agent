import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Loader } from '@/components/ui/loader'
import { ExternalLink, RefreshCw } from '@/lib/icons'
import { $desktopVersion, $changelogOpen, setChangelogOpen, refreshDesktopVersion } from '@/store/updates'

interface ReleaseInfo {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}

const RELEASES_API = 'https://api.github.com/repos/S1d11/zeus/releases'

async function fetchReleases(): Promise<ReleaseInfo[]> {
  const resp = await fetch(`${RELEASES_API}?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!resp.ok) {
    throw new Error(`GitHub API returned ${resp.status}`)
  }
  return resp.json()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

/** Strip markdown to plain text for display in the dialog body. */
function renderMarkdown(md: string): string {
  // Lightweight: strip headers markers, bold/italic, code fences, and links
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .trim()
}

export function ChangelogDialog() {
  const open = useStore($changelogOpen)
  const version = useStore($desktopVersion)
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void refreshDesktopVersion()
    setLoading(true)
    setError(null)
    fetchReleases()
      .then(data => {
        setReleases(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [open])

  const currentVersion = version?.appVersion

  return (
    <Dialog onOpenChange={setChangelogOpen} open={open}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
          <BrandMark className="size-8" />
          <div className="flex-1">
            <DialogTitle className="text-base font-semibold">Changelog</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {currentVersion ? `Running v${currentVersion}` : 'Version info unavailable'}
            </DialogDescription>
          </div>
          <Button
            disabled={loading}
            onClick={() => {
              setLoading(true)
              setError(null)
              fetchReleases()
                .then(data => {
                  setReleases(data)
                  setLoading(false)
                })
                .catch(err => {
                  setError(err.message)
                  setLoading(false)
                })
            }}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading && !releases ? (
            <div className="flex items-center justify-center py-12">
              <Loader />
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p className="mb-2">Could not load changelog: {error}</p>
              <Button
                asChild
                size="sm"
                variant="text"
              >
                <a
                  href="https://github.com/S1d11/zeus/releases"
                  onClick={e => {
                    e.preventDefault()
                    void window.hermesDesktop?.openExternal?.('https://github.com/S1d11/zeus/releases')
                  }}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="size-3" />
                  View on GitHub
                </a>
              </Button>
            </div>
          ) : releases && releases.length > 0 ? (
            <div className="space-y-6">
              {releases.map(release => {
                const isCurrent = currentVersion && release.tag_name === `v${currentVersion}`
                return (
                  <div
                    key={release.tag_name}
                    className={`rounded-lg border p-4 ${
                      isCurrent
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/50 bg-muted/10'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {release.name || release.tag_name}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                          Current
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDate(release.published_at)}
                      </span>
                    </div>
                    {release.body ? (
                      <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
                        {renderMarkdown(release.body)}
                      </pre>
                    ) : (
                      <p className="text-xs text-muted-foreground">No release notes available.</p>
                    )}
                    {release.assets.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {release.assets.map(asset => (
                          <a
                            key={asset.name}
                            className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30"
                            href={asset.browser_download_url}
                            onClick={e => {
                              e.preventDefault()
                              void window.hermesDesktop?.openExternal?.(asset.browser_download_url)
                            }}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ExternalLink className="size-3" />
                            {asset.name} ({formatBytes(asset.size)})
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No releases found.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
          <Button
            asChild
            size="sm"
            variant="text"
          >
            <a
              href="https://github.com/S1d11/zeus/releases"
              onClick={e => {
                e.preventDefault()
                void window.hermesDesktop?.openExternal?.('https://github.com/S1d11/zeus/releases')
              }}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-3" />
              View all releases
            </a>
          </Button>
          <Button onClick={() => setChangelogOpen(false)} size="sm" variant="textStrong">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
