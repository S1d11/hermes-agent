/**
 * Pure helpers for choosing a remote URL during passive update checks.
 *
 * A public install can end up with `origin=git@github.com:S1d11/hermes-agent.git`
 * or `upstream=git@github.com:NousResearch/hermes-agent.git`. If the user's
 * GitHub SSH key is FIDO2/passkey-backed, a background `git fetch <remote>`
 * triggers an unexplained hardware-touch prompt. For passive checks against any
 * known Hermes repo we substitute the public HTTPS `ls-remote` path, which needs
 * no auth and cannot prompt. Active update/apply flows are left unchanged.
 *
 * Extracted from main.ts so the security-critical remote detection is unit
 * testable without booting Electron (main.ts requires('electron') at load).
 */

const PRIMARY_REPO_HTTPS_URL = 'https://github.com/S1d11/hermes-agent.git'
const UPSTREAM_REPO_HTTPS_URL = 'https://github.com/NousResearch/hermes-agent.git'
const PRIMARY_REPO_CANONICAL = 'github.com/s1d11/hermes-agent'
const UPSTREAM_REPO_CANONICAL = 'github.com/nousresearch/hermes-agent'

// Normalize common GitHub remote URL forms to `host/owner/repo` (lowercased,
// no trailing slash, no .git suffix) so SSH and HTTPS forms of the same repo
// compare equal.
function canonicalGitHubRemote(url) {
  if (!url) {
    return ''
  }

  let value = String(url).trim()

  if (value.startsWith('git@github.com:')) {
    value = `github.com/${value.slice('git@github.com:'.length)}`
  } else if (value.startsWith('ssh://git@github.com/')) {
    value = `github.com/${value.slice('ssh://git@github.com/'.length)}`
  } else {
    try {
      const parsed = new URL(value)

      if (parsed.hostname && parsed.pathname) {
        value = `${parsed.hostname}${parsed.pathname}`
      }
    } catch {
      // Leave non-URL forms unchanged.
    }
  }

  value = value.trim().replace(/\/+$/, '')

  if (value.endsWith('.git')) {
    value = value.slice(0, -4)
  }

  return value.toLowerCase()
}

function isSshRemote(url) {
  const value = String(url || '')
    .trim()
    .toLowerCase()

  return value.startsWith('git@') || value.startsWith('ssh://')
}

function isPrimarySshRemote(url) {
  return isSshRemote(url) && canonicalGitHubRemote(url) === PRIMARY_REPO_CANONICAL
}

function isUpstreamSshRemote(url) {
  return isSshRemote(url) && canonicalGitHubRemote(url) === UPSTREAM_REPO_CANONICAL
}

// True for either known Hermes repo over SSH. Passive update checks against
// these remotes are rewritten to the public HTTPS URL so they cannot trigger a
// FIDO2 hardware-touch prompt.
function isOfficialSshRemote(url) {
  return isPrimarySshRemote(url) || isUpstreamSshRemote(url)
}

// Return the public HTTPS URL to use for an SSH remote we recognize, or the
// original URL when it is HTTPS or unknown. This lets `checkUpdates` do a
// no-auth `git ls-remote` against origin or upstream without prompting.
function resolveSshRemoteUrl(url) {
  if (isPrimarySshRemote(url)) {
    return PRIMARY_REPO_HTTPS_URL
  }

  if (isUpstreamSshRemote(url)) {
    return UPSTREAM_REPO_HTTPS_URL
  }

  return url
}

export {
  canonicalGitHubRemote,
  isOfficialSshRemote,
  isPrimarySshRemote,
  isSshRemote,
  isUpstreamSshRemote,
  PRIMARY_REPO_CANONICAL,
  PRIMARY_REPO_HTTPS_URL,
  resolveSshRemoteUrl,
  UPSTREAM_REPO_CANONICAL,
  UPSTREAM_REPO_HTTPS_URL
}
