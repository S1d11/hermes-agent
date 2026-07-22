import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ExternalLink, RefreshCw } from '@/lib/icons'
import { $changelogOpen, $desktopVersion, refreshDesktopVersion, setChangelogOpen } from '@/store/updates'

interface ReleaseInfo {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}

const RELEASES_API = 'https://api.github.com/repos/S1d11/hermes-agent/releases'
const CACHE_KEY = 'hermes:changelog-cache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedReleases {
  timestamp: number
  releases: ReleaseInfo[]
}

function loadCachedReleases(): ReleaseInfo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)

    if (!raw) {return null}
    const cached = JSON.parse(raw) as CachedReleases

    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {return null}

    return cached.releases
  } catch {
    return null
  }
}

function saveCachedReleases(releases: ReleaseInfo[]) {
  try {
    const data: CachedReleases = { timestamp: Date.now(), releases }
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // localStorage may be full or unavailable — best-effort
  }
}

async function fetchReleases(): Promise<ReleaseInfo[]> {
  const cached = loadCachedReleases()

  if (cached) {return cached}

  const resp = await fetch(`${RELEASES_API}?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json' }
  })

  if (resp.status === 403) {
    throw new Error('GitHub API rate limit exceeded. Try again in a few minutes.')
  }

  if (resp.status === 404) {
    throw new Error('No releases found for this repository.')
  }

  if (!resp.ok) {
    throw new Error(`GitHub API returned ${resp.status}`)
  }

  const data = await resp.json()
  saveCachedReleases(data)

  return data
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${bytes} B`}

  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(0)} KB`}

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

/**
 * Convert a limited subset of GitHub-flavored markdown to HTML for
 * display in the changelog dialog. Supports: headers, bold, italic,
 * inline code, fenced code blocks, unordered/ordered lists, links,
 * and horizontal rules. Escapes HTML entities first to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/)
  const html: string[] = []
  let inCodeBlock = false
  let codeLang = ''
  let inList = false
  let listType: 'ul' | 'ol' | null = null

  const flushList = () => {
    if (inList && listType) {
      html.push(`</${listType}>`)
      inList = false
      listType = null
    }
  }

  for (const line of lines) {
    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)$/)

    if (fenceMatch) {
      if (inCodeBlock) {
        html.push('</code></pre>')
        inCodeBlock = false
        codeLang = ''
      } else {
        codeLang = fenceMatch[1] || ''
        html.push(`<pre class="rounded-md bg-muted/40 p-3 overflow-x-auto text-xs"><code>`)
        inCodeBlock = true
      }

      continue
    }

    if (inCodeBlock) {
      html.push(line)

      continue
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      flushList()
      html.push('<hr class="border-border/40 my-2" />')

      continue
    }

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/)

    if (headerMatch) {
      flushList()
      const level = headerMatch[1].length
      const sizes = ['text-sm font-bold', 'text-sm font-semibold', 'text-xs font-semibold', 'text-xs font-medium']
      html.push(`<div class="${sizes[Math.min(level - 1, 3)]} mt-2 mb-1 text-foreground">${inlineFormat(headerMatch[2])}</div>`)

      continue
    }

    // Unordered list item
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/)

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        flushList()
        html.push('<ul class="list-disc pl-5 space-y-0.5 my-1">')
        inList = true
        listType = 'ul'
      }

      html.push(`<li>${inlineFormat(ulMatch[1])}</li>`)

      continue
    }

    // Ordered list item
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/)

    if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList()
        html.push('<ol class="list-decimal pl-5 space-y-0.5 my-1">')
        inList = true
        listType = 'ol'
      }

      html.push(`<li>${inlineFormat(olMatch[1])}</li>`)

      continue
    }

    // Empty line
    if (line.trim() === '') {
      flushList()
      html.push('')

      continue
    }

    // Regular paragraph
    flushList()
    html.push(`<p class="my-0.5">${inlineFormat(line)}</p>`)
  }

  if (inCodeBlock) {html.push('</code></pre>')}
  flushList()

  return html.join('\n')
}

/** Apply inline formatting: bold, italic, inline code, links. */
function inlineFormat(text: string): string {
  return text
    // Links [text](url)
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-primary underline underline-offset-2" target="_blank" rel="noreferrer">$1</a>'
    )
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic *text* (but not ** which is bold)
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    // Inline code `text`
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted/50 px-1 py-0.5 text-xs font-mono">$1</code>')
}

export function ChangelogDialog() {
  const open = useStore($changelogOpen)
  const version = useStore($desktopVersion)
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {return}
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
            aria-label="Refresh changelog"
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
            <div className="space-y-6">
              {[0, 1, 2].map(i => (
                <div className="rounded-lg border border-border/50 bg-muted/10 p-4" key={i}>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
                    <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-full animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-muted/40" />
                    <div className="h-3 w-3/5 animate-pulse rounded bg-muted/40" />
                  </div>
                </div>
              ))}
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
                  href="https://github.com/S1d11/hermes-agent/releases"
                  onClick={e => {
                    e.preventDefault()
                    void window.hermesDesktop?.openExternal?.('https://github.com/S1d11/hermes-agent/releases')
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
                    className={`rounded-lg border p-4 ${
                      isCurrent
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/50 bg-muted/10'
                    }`}
                    key={release.tag_name}
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
                      <div
                        className="text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_pre]:rounded-md [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre]:overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(release.body) }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">No release notes available.</p>
                    )}
                    {release.assets.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {release.assets.map(asset => (
                          <a
                            className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30"
                            href={asset.browser_download_url}
                            key={asset.name}
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
              href="https://github.com/S1d11/hermes-agent/releases"
              onClick={e => {
                e.preventDefault()
                void window.hermesDesktop?.openExternal?.('https://github.com/S1d11/hermes-agent/releases')
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
