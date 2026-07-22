/**
 * Tests for electron/update-remote.ts — the remote-detection helpers that
 * keep passive update checks off the SSH origin for official installs.
 *
 * Run with: node --test electron/update-remote.test.ts
 * (Wired into npm test:desktop:platforms in package.json.)
 *
 * Why this matters: a public install can carry
 * origin=git@github.com:S1d11/hermes-agent.git. A background
 * `git fetch origin` then authenticates over SSH and, with a FIDO2/passkey
 * key, triggers an unexplained hardware-touch prompt. isOfficialSshRemote
 * must reliably recognize the official SSH remote (in every URL form,
 * case-insensitively) so the caller can swap in the anonymous HTTPS path —
 * while NOT misclassifying forks, other hosts, or the HTTPS remote (which
 * never prompts and should keep the normal fetch path).
 */

import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
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
} from './update-remote'

test('canonicalGitHubRemote normalizes SSH and HTTPS forms to the same value', () => {
  assert.equal(
    canonicalGitHubRemote('git@github.com:S1d11/hermes-agent.git'),
    PRIMARY_REPO_CANONICAL
  )
  assert.equal(
    canonicalGitHubRemote('git@github.com:S1d11/hermes-agent'),
    PRIMARY_REPO_CANONICAL
  )
  assert.equal(
    canonicalGitHubRemote('ssh://git@github.com/S1d11/hermes-agent.git'),
    PRIMARY_REPO_CANONICAL
  )
  assert.equal(
    canonicalGitHubRemote('https://github.com/S1d11/hermes-agent.git'),
    PRIMARY_REPO_CANONICAL
  )
  // Upstream too.
  assert.equal(
    canonicalGitHubRemote('git@github.com:NousResearch/hermes-agent.git'),
    UPSTREAM_REPO_CANONICAL
  )
  assert.equal(
    canonicalGitHubRemote('https://github.com/NousResearch/hermes-agent/'),
    UPSTREAM_REPO_CANONICAL
  )
  // Case-insensitive: an uppercased owner still canonicalizes to the same repo.
  assert.equal(
    canonicalGitHubRemote('git@github.com:s1d11/hermes-agent.git'),
    PRIMARY_REPO_CANONICAL
  )
  // Trailing slashes are stripped.
  assert.equal(
    canonicalGitHubRemote('https://github.com/S1d11/hermes-agent/'),
    PRIMARY_REPO_CANONICAL
  )
})

test('canonicalGitHubRemote is empty for falsy input', () => {
  assert.equal(canonicalGitHubRemote(''), '')
  assert.equal(canonicalGitHubRemote(null), '')
  assert.equal(canonicalGitHubRemote(undefined), '')
})

test('isSshRemote detects scp-like and ssh:// forms only', () => {
  assert.equal(isSshRemote('git@github.com:S1d11/hermes-agent.git'), true)
  assert.equal(isSshRemote('ssh://git@github.com/S1d11/hermes-agent.git'), true)
  assert.equal(isSshRemote('https://github.com/S1d11/hermes-agent.git'), false)
  assert.equal(isSshRemote(''), false)
  assert.equal(isSshRemote(null), false)
})

test('isPrimarySshRemote is true only for the primary repo over SSH', () => {
  assert.equal(isPrimarySshRemote('git@github.com:S1d11/hermes-agent.git'), true)
  assert.equal(isPrimarySshRemote('git@github.com:S1d11/hermes-agent'), true)
  assert.equal(
    isPrimarySshRemote('ssh://git@github.com/S1d11/hermes-agent.git'),
    true
  )
  // Case-insensitive owner/repo match.
  assert.equal(isPrimarySshRemote('git@github.com:s1d11/hermes-agent.git'), true)
  // Upstream is NOT the primary repo.
  assert.equal(
    isPrimarySshRemote('git@github.com:NousResearch/hermes-agent.git'),
    false
  )
})

test('isUpstreamSshRemote is true only for the upstream repo over SSH', () => {
  assert.equal(
    isUpstreamSshRemote('git@github.com:NousResearch/hermes-agent.git'),
    true
  )
  assert.equal(
    isUpstreamSshRemote('ssh://git@github.com/NousResearch/hermes-agent.git'),
    true
  )
  // Primary is NOT upstream.
  assert.equal(isUpstreamSshRemote('git@github.com:S1d11/hermes-agent.git'), false)
})

test('isOfficialSshRemote matches primary or upstream, but not forks/other hosts/HTTPS', () => {
  assert.equal(isOfficialSshRemote('git@github.com:S1d11/hermes-agent.git'), true)
  assert.equal(
    isOfficialSshRemote('git@github.com:NousResearch/hermes-agent.git'),
    true
  )
  // A fork over SSH belongs to the user — fetching it is their own remote,
  // not the official upstream, so the SSH-avoidance swap must not apply.
  assert.equal(isOfficialSshRemote('git@github.com:someuser/hermes-agent.git'), false)
  // Same repo name on a different host is not the official repo.
  assert.equal(isOfficialSshRemote('git@gitlab.com:S1d11/hermes-agent.git'), false)
  // HTTPS to the official repo never prompts for SSH/FIDO2, so it keeps the
  // normal fetch path — must not be flagged as an official SSH remote.
  assert.equal(
    isOfficialSshRemote('https://github.com/S1d11/hermes-agent.git'),
    false
  )
  assert.equal(isOfficialSshRemote(''), false)
  assert.equal(isOfficialSshRemote(null), false)
})

test('resolveSshRemoteUrl swaps known SSH remotes to HTTPS and leaves others alone', () => {
  assert.equal(
    resolveSshRemoteUrl('git@github.com:S1d11/hermes-agent.git'),
    PRIMARY_REPO_HTTPS_URL
  )
  assert.equal(
    resolveSshRemoteUrl('git@github.com:NousResearch/hermes-agent.git'),
    UPSTREAM_REPO_HTTPS_URL
  )
  assert.equal(
    resolveSshRemoteUrl('https://github.com/S1d11/hermes-agent.git'),
    'https://github.com/S1d11/hermes-agent.git'
  )
  assert.equal(
    resolveSshRemoteUrl('git@github.com:someuser/hermes-agent.git'),
    'git@github.com:someuser/hermes-agent.git'
  )
})

test('PRIMARY_REPO_HTTPS_URL and UPSTREAM_REPO_HTTPS_URL canonicalize to their canonicals', () => {
  assert.equal(canonicalGitHubRemote(PRIMARY_REPO_HTTPS_URL), PRIMARY_REPO_CANONICAL)
  assert.equal(canonicalGitHubRemote(UPSTREAM_REPO_HTTPS_URL), UPSTREAM_REPO_CANONICAL)
})
