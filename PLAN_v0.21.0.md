# Hermes v0.21.0 — Comprehensive Fix & Improvement Plan

> **Status:** PLANNING — No code written yet. Awaiting approval.
> **Scope:** 5 user-reported issues + 39 additional issues discovered during investigation.
> **Total items:** 44 fixes / upgrades / improvements across 7 categories.

---

## Investigation Summary

Five parallel investigations were conducted across the codebase:

| # | Investigation | Key Finding |
|---|---|---|
| 1 | README files | All 43 READMEs say "Hermes", zero say "Hermes". 5,452 "Hermes" references in website docs. |
| 2 | AI identity | Hardcoded fallback identity in `agent/prompt_builder.py` still says "Hermes Agent". This is why the AI thinks it's Hermes. |
| 3 | MCP integration | OAuth not available in desktop app (CLI-only). API key entry is manual. 48 catalog servers, 7 use OAuth, 35+ use API keys. |
| 4 | Version display | `$desktopVersion` atom never populated on app boot. No refresh after auto-update completes. |
| 5 | Desktop UI branding | Locale strings already say "Hermes". README.md still says "Hermes Desktop". Internal type names use "Hermes" (acceptable). |
| 6 | Deep "Hermes Agent" string search | Found **22 additional user-facing "Hermes Agent" strings** in CLI banner, `/version` command, `--version` output, skin engine (6 skins), setup wizard, uninstaller, FastAPI title, gateway service name, MCP OAuth client name, Matrix device name, OpenRouter headers, Discord/Telegram bot names, and 20+ test assertions. |

---

## Master Chart: All Fixes, Upgrades & Improvements

| ID | Category | Priority | Title | Files Affected | Effort | Risk |
|----|----------|----------|-------|----------------|--------|------|
| **F1** | AI Identity | CRITICAL | Replace hardcoded fallback identity "Hermes Agent" → "Hermes" | `agent/prompt_builder.py:123-131` | Low | Low |
| **F2** | AI Identity | CRITICAL | Replace help guidance "You run on Hermes Agent" → "Hermes" | `agent/prompt_builder.py:133-142` | Low | Low |
| **F3** | AI Identity | CRITICAL | Replace default SOUL.md template "Hermes Agent" → "Hermes" | `hermes_cli/default_soul.py:3-11` | Low | Low |
| **F4** | AI Identity | HIGH | Update docker/SOUL.md "Hermes Agent" → "Hermes" | `docker/SOUL.md` | Low | Low |
| **F5** | AI Identity | HIGH | Update install.sh SOUL.md heredoc → "Hermes" | `scripts/install.sh:1790` | Low | Low |
| **F6** | AI Identity | HIGH | Update install.ps1 SOUL.md content → "Hermes" | `scripts/install.ps1:2067` | Low | Low |
| **F7** | AI Identity | HIGH | Update doctor.py SOUL.md template → "Hermes" | `hermes_cli/doctor.py:1163-1167` | Low | Low |
| **F8** | AI Identity | MEDIUM | Update legacy SOUL template strings for "Hermes" → "Hermes" | `hermes_cli/default_soul.py:23-56` | Low | Medium |
| **F9** | Branding | HIGH | Rewrite main README.md: "Hermes Agent" → "Hermes" | `README.md` | Medium | Low |
| **F10** | Branding | HIGH | Rewrite desktop README.md: "Hermes Desktop" → "Hermes Desktop" | `apps/desktop/README.md` | Medium | Low |
| **F11** | Branding | MEDIUM | Update translated READMEs (es, zh-CN, ur-pk) | `README.es.md`, `README.zh-CN.md`, `README.ur-pk.md` | Medium | Low |
| **F12** | Branding | MEDIUM | Update subdirectory READMEs (providers, docs, plugins, skills) | ~35 README files | High | Low |
| **F13** | Branding | LOW | Update website Docusaurus docs (662 .md files, 5,452 "Hermes" refs) | `website/docs/**` | Very High | Low |
| **F14** | Version Display | CRITICAL | Call `refreshDesktopVersion()` on app boot | `apps/desktop/src/app/desktop-controller.tsx` | Low | Low |
| **F15** | Version Display | HIGH | Call `refreshDesktopVersion()` after auto-update downloaded event | `apps/desktop/src/components/auto-update-toast.tsx` | Low | Low |
| **F16** | Version Display | HIGH | Call `refreshDesktopVersion()` after auto-update installed & restarted | `apps/desktop/src/store/updates.ts` | Low | Low |
| **F17** | MCP: OAuth | CRITICAL | Add OAuth trigger API endpoints to web_server.py | `hermes_cli/web_server.py` | Medium | Medium |
| **F18** | MCP: OAuth | CRITICAL | Add "Connect with OAuth" button to Connections UI | `apps/desktop/src/app/connections/index.tsx` | Medium | Low |
| **F19** | MCP: OAuth | HIGH | Add OAuth status polling & success/failure toast | `apps/desktop/src/app/connections/index.tsx` | Medium | Low |
| **F20** | MCP: OAuth | HIGH | Add OAuth API bindings to hermes.ts | `apps/desktop/src/hermes.ts` | Low | Low |
| **F21** | MCP: UX | HIGH | Auto-trigger OAuth on install for OAuth-type servers (skip env var modal) | `apps/desktop/src/app/connections/index.tsx` | Medium | Low |
| **F22** | MCP: UX | MEDIUM | Add "Reconnect" / "Re-authenticate" button for expired OAuth tokens | `apps/desktop/src/app/connections/index.tsx` | Low | Low |
| **F23** | MCP: UX | MEDIUM | Surface dynamic tool refresh failures as notifications | `tools/mcp_tool.py`, `tui_gateway/server.py` | Medium | Medium |
| **F24** | MCP: UX | LOW | Add "Retry Now" button to bypass circuit breaker cooldown | `apps/desktop/src/app/connections/index.tsx`, `hermes_cli/web_server.py` | Medium | Medium |
| **F25** | MCP: OAuth | MEDIUM | Add device code flow support for headless/desktop OAuth | `tools/mcp_oauth.py`, `hermes_cli/web_server.py` | High | Medium |
| **F26** | Other | MEDIUM | Update AGENTS.md references from "Hermes" to "Hermes" | `AGENTS.md` | Medium | Low |
| **F27** | Other | LOW | Update user-facing bot descriptions (Slack, Discord, IRC) | `plugins/platforms/slack/adapter.py`, `plugins/platforms/discord/adapter.py`, `plugins/platforms/irc/adapter.py` | Low | Low |
| **F28** | Other | LOW | Update user-facing uninstall messages | `hermes_cli/uninstall.py` | Low | Low |
| **F29** | Release | — | Version bump to 0.21.0, build NSIS, create GitHub release | `package.json`, `hermes_cli/__init__.py` | Low | Low |
| **F30** | Hermes→Hermes | CRITICAL | Fix `/version` slash command: `format_banner_version_label()` says "Hermes Agent v..." | `hermes_cli/banner.py:509` | Low | Low |
| **F31** | Hermes→Hermes | CRITICAL | Fix `hermes --version` CLI output: "Hermes Agent v..." | `hermes_cli/main.py:231` | Low | Low |
| **F32** | Hermes→Hermes | CRITICAL | Fix CLI startup banner: "Hermes Agent v..." + "⚕ NOUS HERMES" | `cli.py:3243-3254` | Low | Low |
| **F33** | Hermes→Hermes | CRITICAL | Fix CLI welcome text: "Welcome to Hermes Agent!" | `cli.py:12608,12611` | Low | Low |
| **F34** | Hermes→Hermes | HIGH | Fix skin engine defaults: all 6 skins say "Hermes Agent" / "⚕ Hermes" | `hermes_cli/skin_engine.py:190,301,340,377,414` (+welcome+response_label) | Low | Low |
| **F35** | Hermes→Hermes | HIGH | Fix CLI suspend message: "Hermes Agent has been suspended" | `cli.py:13455` | Low | Low |
| **F36** | Hermes→Hermes | HIGH | Fix FastAPI title: `FastAPI(title="Hermes Agent")` | `hermes_cli/web_server.py:249` | Low | Low |
| **F37** | Hermes→Hermes | HIGH | Fix Telegram onboarding bot_name default: "Hermes Agent" | `hermes_cli/web_server.py:5554` | Low | Low |
| **F38** | Hermes→Hermes | HIGH | Fix setup wizard banner: "⚕ Hermes Agent Setup Wizard" | `hermes_cli/setup.py:2817,2828` | Low | Low |
| **F39** | Hermes→Hermes | HIGH | Fix uninstaller banner: "⚕ Hermes Agent Uninstaller" | `hermes_cli/uninstall.py:606,884` | Low | Low |
| **F40** | Hermes→Hermes | HIGH | Fix gateway service description: "Hermes Agent Gateway" | `hermes_cli/gateway.py:1662` | Low | Low |
| **F41** | Hermes→Hermes | MEDIUM | Fix MCP OAuth client_name default: "Hermes Agent" | `tools/mcp_oauth.py:739` | Low | Low |
| **F42** | Hermes→Hermes | MEDIUM | Fix Matrix device_name: "Hermes Agent" | `plugins/platforms/matrix/adapter.py:1209` | Low | Low |
| **F43** | Hermes→Hermes | MEDIUM | Fix OpenRouter attribution headers: X-Title "Hermes Agent", HTTP-Referer | `agent/auxiliary_client.py:404-405` | Low | Low |
| **F44** | Hermes→Hermes | MEDIUM | Fix CLI response label default: "⚕ Hermes" | `hermes_cli/cli_commands_mixin.py:1645` | Low | Low |
| **F45** | Hermes→Hermes | MEDIUM | Fix WhatsApp/Telegram reply header default: "⚕ *Hermes Agent*" | `hermes_cli/config.py:2309` | Low | Low |
| **F46** | Hermes→Hermes | LOW | Fix CLI /update message: "⚕ Updating Hermes Agent..." | `hermes_cli/main.py:8953` | Low | Low |
| **F47** | Hermes→Hermes | LOW | Fix Discord /update command description | `plugins/platforms/discord/adapter.py:3707` | Low | Low |
| **F48** | Hermes→Hermes | LOW | Fix Copilot ACP client title: "Hermes Agent" | `agent/copilot_acp_client.py:559` | Low | Low |
| **F49** | Hermes→Hermes | LOW | Fix agent_init error message: "by Hermes Agent" | `agent/agent_init.py:1678` | Low | Low |
| **F50** | Hermes→Hermes | LOW | Fix model_switch warning: "for use with Hermes Agent" | `hermes_cli/model_switch.py:78` | Low | Low |
| **F51** | Tests | LOW | Update test assertions that check for "Hermes Agent" string | `tests/run_agent/test_run_agent.py:5813,5840`, `tests/hermes_cli/test_tui_resume_flow.py:409`, `tests/agent/test_prompt_builder.py:703`, `tests/cli/test_cli_init.py` (8 matches) | Medium | Low |

---

## Detailed Plans

### CATEGORY 1: AI Identity — "The AI thinks it's Hermes Agent"

**Root Cause:** The user's `SOUL.md` at `~/.hermes/SOUL.md` was manually updated to "Hermes", but when SOUL.md fails to load, is skipped (cron mode, `skip_context_files`), or on a fresh install, the agent falls back to `DEFAULT_AGENT_IDENTITY` in `agent/prompt_builder.py` which still says "You are Hermes Agent, an intelligent AI assistant created by Nous Research."

#### F1 — Replace DEFAULT_AGENT_IDENTITY (CRITICAL)
- **File:** `agent/prompt_builder.py` lines 123-131
- **Change:** Replace "Hermes Agent" → "Hermes" and "created by Nous Research" → "created by Hermes" (or remove the creator attribution per your preference)
- **New string:**
  ```
  You are Hermes, an intelligent AI assistant. You are helpful, knowledgeable, and direct...
  ```
- **Why critical:** This is THE string the AI sees when SOUL.md is not loaded. This is the #1 reason the AI still calls itself Hermes.

#### F2 — Replace HERMES_AGENT_HELP_GUIDANCE (CRITICAL)
- **File:** `agent/prompt_builder.py` lines 133-142
- **Change:** Replace "You run on Hermes Agent (by Nous Research)" → "You run on Hermes". Replace "Hermes itself" → "Hermes itself". Update docs URL if changing.
- **Why critical:** This tells the AI what platform it's running on. If it says "Hermes Agent", the AI will tell users "I am Hermes Agent".

#### F3 — Replace DEFAULT_SOUL_MD (CRITICAL)
- **File:** `hermes_cli/default_soul.py` lines 3-11
- **Change:** Replace "Hermes Agent" → "Hermes" in the default SOUL.md template
- **Why critical:** This is what gets written to `~/.hermes/SOUL.md` on fresh installs and repairs. New users will get "Hermes Agent" in their SOUL.md.

#### F4 — Update docker/SOUL.md (HIGH)
- **File:** `docker/SOUL.md`
- **Change:** Replace "Hermes Agent" → "Hermes"
- **Why:** Docker deployments use this file as the identity.

#### F5 — Update install.sh SOUL.md heredoc (HIGH)
- **File:** `scripts/install.sh` line 1790
- **Change:** Replace "Hermes Agent" → "Hermes" in the heredoc that writes SOUL.md

#### F6 — Update install.ps1 SOUL.md content (HIGH)
- **File:** `scripts/install.ps1` line 2067
- **Change:** Replace "Hermes Agent" → "Hermes" in the PowerShell here-string

#### F7 — Update doctor.py SOUL.md template (HIGH)
- **File:** `hermes_cli/doctor.py` lines 1163-1167
- **Change:** Replace "# Hermes Agent Persona" → "# Hermes Persona", "how Hermes communicates" → "how Hermes communicates", "You are Hermes" → "You are Hermes"

#### F8 — Update legacy SOUL template strings (MEDIUM)
- **File:** `hermes_cli/default_soul.py` lines 23-56
- **Change:** Update `_LEGACY_TEMPLATE_SOULS` strings to say "Hermes" instead of "Hermes Agent". This is needed so `is_legacy_template_soul()` correctly identifies old templates that should be upgraded to the new Hermes default.
- **Risk:** Medium — need to ensure the legacy detection logic still works for users who have old "Hermes" template SOUL.md files. May need to ADD Hermes variants while keeping Hermes variants for backward compatibility detection.

---

### CATEGORY 2: README & Documentation Branding

#### F9 — Rewrite main README.md (HIGH)
- **File:** `README.md`
- **Changes:**
  - Line 2: `alt="Hermes Agent"` → `alt="Hermes"`
  - Line 5: `# Hermes Agent ☤` → `# Hermes`
  - Line 7: All "Hermes Agent" / "Hermes Desktop" links → "Hermes" / "Hermes Desktop"
  - Line 10: Badge text `hermes-agent.nousresearch.com` → update if domain is changing
  - Line 12: GitHub URL `NousResearch/hermes-agent` → `S1d11/hermes-agent`
  - Line 19: "built by Nous Research" → keep or change per your preference
  - Line 21: `hermes model` → keep CLI command name (backward compat) OR rename
  - All `hermes` CLI command references → decide: keep as `hermes` for backward compat or rename to `hermes`
  - All install URLs → update to new domain/repo if changing
- **Decision needed:** Should CLI commands (`hermes`, `hermes model`, `hermes mcp`) be renamed to `hermes`? This is a breaking change for existing users.

#### F10 — Rewrite desktop README.md (HIGH)
- **File:** `apps/desktop/README.md`
- **Changes:**
  - Line 1: `# Hermes Desktop ☤` → `# Hermes Desktop`
  - Line 10: "Hermes Agent" → "Hermes"
  - Line 13: "Hermes surface" → "Hermes surface"
  - Line 16: "Talk to Hermes" → "Talk to Hermes"
  - Line 25: "Install with Hermes" → "Install with Hermes"
  - Line 33: "Hermes walks you through" → "Hermes walks you through"
  - Line 37: "Hermes Desktop website" → "Hermes Desktop website"
  - Keep CLI command references (`hermes desktop`, `hermes update`) as-is unless renaming CLI

#### F11 — Update translated READMEs (MEDIUM)
- **Files:** `README.es.md`, `README.zh-CN.md`, `README.ur-pk.md`
- **Changes:** Same branding replacements as F9, in each language

#### F12 — Update subdirectory READMEs (MEDIUM)
- **Files:** ~35 README files across `docs/`, `plugins/`, `providers/`, `skills/`, `ui-tui/`, `web/`, `packaging/`
- **Changes:** Replace "Hermes" → "Hermes" in user-facing text. Keep technical identifiers (paths, env vars, package names) as-is.

#### F13 — Update website Docusaurus docs (LOW — separate effort)
- **Files:** 662 `.md` files in `website/docs/` with 5,452 "Hermes" references
- **Note:** This is a massive effort. Recommend doing as a separate follow-up or scripted bulk replace. Low priority for this release.

---

### CATEGORY 3: Auto-Updater Version Display

**Root Cause:** The `$desktopVersion` nanostore atom is initialized as `null` and is never populated on app boot. It's only refreshed when: (a) the About panel is opened, (b) window regains focus, (c) a git-based update poll runs. For packaged (NSIS) installs, the git-based update path is skipped entirely, so the atom stays `null` unless the user opens About or refocuses the window. After an auto-update installs and restarts, the new version is in the binary but never displayed until one of those triggers fires.

#### F14 — Call refreshDesktopVersion() on app boot (CRITICAL)
- **File:** `apps/desktop/src/app/desktop-controller.tsx` (near line 298 where `startUpdatePoller()` is called)
- **Change:** Add `void refreshDesktopVersion()` in the initial `useEffect` so the version is fetched immediately when the app loads.
- **Why critical:** This ensures the version shows in the statusbar from the moment the app starts, not just when the user opens About.

#### F15 — Refresh version after auto-update downloaded (HIGH)
- **File:** `apps/desktop/src/components/auto-update-toast.tsx`
- **Change:** In the `'update-downloaded'` event handler, add `void refreshDesktopVersion()` so the statusbar shows the new version number as "pending" before restart.
- **Note:** The displayed version should show the CURRENT running version, not the downloaded version. The toast already shows the downloaded version separately. The statusbar should continue showing the current version until restart.

#### F16 — Refresh version after auto-update restart (HIGH)
- **File:** `apps/desktop/src/store/updates.ts`
- **Change:** After the app restarts following an auto-update, detect that an update was just applied (e.g., check a flag in electron main or compare versions) and call `refreshDesktopVersion()` immediately.
- **Approach:** The `resolveHermesVersion()` in `main.cjs` reads from `hermes_cli/__init__.py` or `app.getVersion()`. After a packaged update, `app.getVersion()` returns the NEW version. So simply calling `refreshDesktopVersion()` on boot (F14) already fixes this — the restarted app will fetch and display the new version.
- **Conclusion:** F14 alone fixes the post-restart display. F16 is a belt-and-suspenders confirmation.

---

### CATEGORY 4: MCP Streamlined Login (OAuth in Desktop App)

**Current State:** The desktop app's Connections page can install MCP servers from the catalog, but:
- OAuth servers (GitHub, Linear, Notion, Slack, Google Drive, Gmail, Calendar, Maps) require the user to run `hermes mcp login <name>` via CLI first
- The desktop app can only configure API key auth
- There is no "Connect" / "Login with X" button in the desktop UI
- Users must manually copy/paste API keys for 35+ servers

**Goal:** User clicks "Connect" on an MCP server → browser opens to OAuth login page → user logs in (e.g., with Google) → connection is established. No API key entry needed.

#### F17 — Add OAuth trigger API endpoints to web_server.py (CRITICAL)
- **File:** `hermes_cli/web_server.py`
- **New endpoints:**
  - `POST /api/mcp/{name}/oauth/start` — Triggers the OAuth flow for an MCP server. Calls `mcp_oauth.py` to begin the browser-based authorization. Returns a status token for polling.
  - `GET /api/mcp/{name}/oauth/status` — Polls the OAuth flow status (pending, success, error). Returns auth state.
  - `POST /api/mcp/{name}/oauth/reauth` — Re-authenticates an expired OAuth token.
  - `POST /api/mcp/{name}/circuit-breaker/reset` — Resets the circuit breaker for a server (F24).
- **Implementation:** Reuse the existing `tools/mcp_oauth.py` and `tools/mcp_oauth_manager.py` code. The OAuth flow already works in CLI — we just need to expose it over HTTP for the desktop app.
- **Challenge:** The OAuth flow opens a browser and runs a localhost callback server. In the desktop context, this needs to work from the Python backend (which is running as a child process of Electron). The browser opening and callback should work since the backend runs on the user's machine.

#### F18 — Add "Connect with OAuth" button to Connections UI (CRITICAL)
- **File:** `apps/desktop/src/app/connections/index.tsx`
- **Changes:**
  - For catalog entries with `auth.type === 'oauth'`, replace the "Install" button with a "Connect" button
  - Clicking "Connect" calls the new `POST /api/mcp/{name}/oauth/start` endpoint
  - Show a loading spinner while OAuth is in progress
  - Poll `GET /api/mcp/{name}/oauth/status` every 2 seconds
  - On success: show green checkmark, "Connected" badge, refresh server list
  - On failure: show error message with retry button
- **UI mockup:**
  ```
  ┌─────────────────────────────────────────────────┐
  │ GitHub          [HTTP] [OAuth]                   │
  │ Manage GitHub repos — issues, PRs, commits...   │
  │                          [Connect with GitHub →] │
  └─────────────────────────────────────────────────┘
  ```
  After clicking Connect:
  ```
  ┌─────────────────────────────────────────────────┐
  │ GitHub          [HTTP] [OAuth]                   │
  │ Manage GitHub repos — issues, PRs, commits...   │
  │                   [Connecting... (Cancel)]       │
  └─────────────────────────────────────────────────┘
  ```
  After success:
  ```
  ┌─────────────────────────────────────────────────┐
  │ GitHub          [HTTP] [OAuth] [Connected ✓]    │
  │ Manage GitHub repos — issues, PRs, commits...   │
  │                          [Disconnect] [Settings] │
  └─────────────────────────────────────────────────┘
  ```

#### F19 — Add OAuth status polling & notifications (HIGH)
- **File:** `apps/desktop/src/app/connections/index.tsx`
- **Changes:**
  - Poll OAuth status while a connection is pending
  - Show toast notification on success: "GitHub connected successfully"
  - Show toast notification on failure: "GitHub connection failed: <error>"
  - Show toast notification on token expiry: "GitHub token expired, click to reconnect"

#### F20 — Add OAuth API bindings to hermes.ts (HIGH)
- **File:** `apps/desktop/src/hermes.ts`
- **New functions:**
  ```typescript
  export function startMcpOAuth(serverName: string): Promise<{ statusToken: string }>
  export function getMcpOAuthStatus(serverName: string): Promise<{ state: 'pending' | 'success' | 'error', error?: string }>
  export function reauthMcpOAuth(serverName: string): Promise<{ ok: boolean }>
  export function resetMcpCircuitBreaker(serverName: string): Promise<{ ok: boolean }>
  ```

#### F21 — Auto-trigger OAuth on install for OAuth-type servers (HIGH)
- **File:** `apps/desktop/src/app/connections/index.tsx`
- **Change:** When a user clicks "Connect" on an OAuth server:
  1. Install the server config (call `installMcpCatalogEntry` with empty env)
  2. Immediately trigger OAuth flow (call `startMcpOAuth`)
  3. Show the browser-based login page
  4. Poll for completion
  5. On success, enable the server and reload tools
- **No env var modal needed** — OAuth servers don't need manual API keys

#### F22 — Add "Reconnect" button for expired OAuth tokens (MEDIUM)
- **File:** `apps/desktop/src/app/connections/index.tsx`
- **Change:** For installed OAuth servers that have expired/failed tokens:
  - Show an orange "Reconnect" button
  - Clicking it calls `reauthMcpOAuth(serverName)` which triggers a fresh OAuth flow

#### F23 — Surface dynamic tool refresh failures as notifications (MEDIUM)
- **File:** `tools/mcp_tool.py` (lines 1517-1520), `tui_gateway/server.py`
- **Change:** When dynamic tool refresh fails, emit an event to the TUI gateway which surfaces it as a desktop notification: "MCP server 'github' tools failed to refresh. Click to reconnect."
- **Why:** Currently these failures are silently logged. Users don't know their MCP tools aren't working.

#### F24 — Add "Retry Now" button to bypass circuit breaker (LOW)
- **File:** `apps/desktop/src/app/connections/index.tsx`, `hermes_cli/web_server.py`
- **Change:** When a server is in circuit-breaker-open state, show a "Retry Now" button that calls `POST /api/mcp/{name}/circuit-breaker/reset` to immediately reset the breaker and retry the connection.

#### F25 — Add device code flow for headless OAuth (MEDIUM — future)
- **File:** `tools/mcp_oauth.py`, `hermes_cli/web_server.py`
- **Change:** For SSH/remote environments where browser launch doesn't work, implement the OAuth device code flow (RFC 8628). Show a code + URL in the desktop UI that the user can open on any device.
- **Note:** This is a nice-to-have for this release. The primary OAuth flow (browser-based) covers the desktop use case.

---

### CATEGORY 5: User-Facing "Hermes Agent" Strings (NEW — found in deeper search)

After a deeper search, I found **22 additional user-facing places** where the app says "Hermes Agent" instead of "Hermes". These are NOT in the AI system prompt — they're in the CLI banner, slash commands, web UI, setup wizard, uninstaller, messaging platforms, and HTTP headers. Every one of these is something the user sees.

#### F30 — Fix `/version` slash command (CRITICAL)
- **File:** `hermes_cli/banner.py` line 509
- **Current:** `base = f"Hermes Agent v{VERSION} ({RELEASE_DATE})"`
- **Fix:** `base = f"Hermes v{VERSION} ({RELEASE_DATE})"`
- **Why:** This is what `/version` returns in both the CLI and the desktop app's chat. The desktop slash command list already says "Show Hermes Agent version" but the backend returns "Hermes Agent v...".

#### F31 — Fix `hermes --version` CLI output (CRITICAL)
- **File:** `hermes_cli/main.py` line 231
- **Current:** `print(f"Hermes Agent v{__version__} ({__release_date__})")`
- **Fix:** `print(f"Hermes v{__version__} ({__release_date__})")`

#### F32 — Fix CLI startup banner (CRITICAL)
- **File:** `cli.py` lines 3243-3254
- **Current:**
  - Line 3243: `line1 = "⚕ NOUS HERMES - AI Agent Framework"`
  - Line 3244: `tiny_line = "⚕ NOUS HERMES"`
  - Line 3254: `version_line = f"Hermes Agent v{_version} ({_release_date})"`
- **Fix:**
  - `line1 = "Hermes - AI Agent"` (or similar)
  - `tiny_line = "Hermes"`
  - `version_line = f"Hermes v{_version} ({_release_date})"`

#### F33 — Fix CLI welcome text (CRITICAL)
- **File:** `cli.py` lines 12608, 12611
- **Current:** `"Welcome to Hermes Agent! Type your message or /help for commands."`
- **Fix:** `"Welcome to Hermes! Type your message or /help for commands."`

#### F34 — Fix skin engine defaults for all 6 built-in skins (HIGH)
- **File:** `hermes_cli/skin_engine.py`
- **Lines affected:** 190, 301, 340, 377, 414 (and the docstring at 68, 93)
- **Current (each skin):**
  ```python
  "branding": {
      "agent_name": "Hermes Agent",
      "welcome": "Welcome to Hermes Agent! ...",
      "response_label": " ⚕ Hermes ",
      ...
  }
  ```
- **Fix:** Replace all `"Hermes Agent"` → `"Hermes"`, all `"⚕ Hermes"` → `"Hermes"`, all welcome messages → `"Welcome to Hermes! ..."` across ALL 6 skins (default, ares, mono, slate, daylight, warm-lightmode) + the docstring example
- **Also fix line 101:** `"default" — Classic Hermes gold/kawaii` → `"default" — Classic Hermes gold/kawaii`

#### F35 — Fix CLI suspend message (HIGH)
- **File:** `cli.py` line 13455
- **Current:** `agent_name = get_active_skin().get_branding("agent_name", "Hermes Agent")`
- **Fix:** Change the fallback default to `"Hermes"` (F34 fixes the skin value, but the fallback string here also needs updating)

#### F36 — Fix FastAPI API title (HIGH)
- **File:** `hermes_cli/web_server.py` line 249
- **Current:** `app = FastAPI(title="Hermes Agent", version=__version__, ...)`
- **Fix:** `app = FastAPI(title="Hermes", version=__version__, ...)`
- **Why:** This shows in the Swagger/OpenAPI docs at `/docs` and in API metadata

#### F37 — Fix Telegram onboarding bot_name default (HIGH)
- **File:** `hermes_cli/web_server.py` line 5554
- **Current:** `bot_name = (body.bot_name or "Hermes Agent").strip() or "Hermes Agent"`
- **Fix:** `bot_name = (body.bot_name or "Hermes").strip() or "Hermes"`

#### F38 — Fix setup wizard banner (HIGH)
- **File:** `hermes_cli/setup.py` lines 2817, 2828
- **Current:**
  - `"│             ⚕ Hermes Agent Setup Wizard                │"`
  - `"│  Let's configure your Hermes Agent installation.       │"`
- **Fix:**
  - `"│             Hermes Setup Wizard                         │"`
  - `"│  Let's configure your Hermes installation.              │"`

#### F39 — Fix uninstaller banner and goodbye message (HIGH)
- **File:** `hermes_cli/uninstall.py` lines 606, 884
- **Current:**
  - `"│            ⚕ Hermes Agent Uninstaller                  │"`
  - `"Thank you for using Hermes Agent! ⚕"`
- **Fix:**
  - `"│            Hermes Uninstaller                            │"`
  - `"Thank you for using Hermes!"`

#### F40 — Fix gateway Windows service description (HIGH)
- **File:** `hermes_cli/gateway.py` line 1662
- **Current:** `SERVICE_DESCRIPTION = "Hermes Agent Gateway - Messaging Platform Integration"`
- **Fix:** `SERVICE_DESCRIPTION = "Hermes Gateway - Messaging Platform Integration"`

#### F41 — Fix MCP OAuth client_name default (MEDIUM)
- **File:** `tools/mcp_oauth.py` line 739
- **Current:** `client_name = cfg.get("client_name", "Hermes Agent")`
- **Fix:** `client_name = cfg.get("client_name", "Hermes")`
- **Why:** This is the name shown to users on the OAuth consent screen (e.g., "Hermes Agent wants to access your GitHub")

#### F42 — Fix Matrix device display name (MEDIUM)
- **File:** `plugins/platforms/matrix/adapter.py` line 1209
- **Current:** `device_name="Hermes Agent"`
- **Fix:** `device_name="Hermes"`
- **Why:** Shows in Matrix's "Devices" / "Sessions" list

#### F43 — Fix OpenRouter HTTP attribution headers (MEDIUM)
- **File:** `agent/auxiliary_client.py` lines 404-405
- **Current:**
  - `"HTTP-Referer": "https://hermes-agent.nousresearch.com"`
  - `"X-Title": "Hermes Agent"`
- **Fix:**
  - `"HTTP-Referer": "https://github.com/S1d11/hermes-agent"` (or your new URL)
  - `"X-Title": "Hermes"`
- **Why:** Shows in OpenRouter dashboard as the app name making requests

#### F44 — Fix CLI response label default (MEDIUM)
- **File:** `hermes_cli/cli_commands_mixin.py` line 1645
- **Current:** `label = _skin.get_branding("response_label", "⚕ Hermes")`
- **Fix:** `label = _skin.get_branding("response_label", "Hermes")`
- **Why:** This is the prefix shown before each AI response in the CLI

#### F45 — Fix WhatsApp/Telegram reply header (MEDIUM)
- **File:** `hermes_cli/config.py` line 2309
- **Current:** `# Default (None) uses the built-in "⚕ *Hermes Agent*" header.`
- **Fix:** Update the comment AND the actual default header logic to use "Hermes"
- **Also check:** Where the actual default header string is constructed (search for the header construction code)

#### F46 — Fix CLI /update message (LOW)
- **File:** `hermes_cli/main.py` line 8953
- **Current:** `print("⚕ Updating Hermes Agent...")`
- **Fix:** `print("Updating Hermes...")`

#### F47 — Fix Discord /update command (LOW)
- **File:** `plugins/platforms/discord/adapter.py` line 3707
- **Current:** `description="Update Hermes Agent to the latest version"`
- **Fix:** `description="Update Hermes to the latest version"`

#### F48 — Fix Copilot ACP client title (LOW)
- **File:** `agent/copilot_acp_client.py` line 559
- **Current:** `"title": "Hermes Agent"`
- **Fix:** `"title": "Hermes"`

#### F49 — Fix agent_init error message (LOW)
- **File:** `agent/agent_init.py` line 1678
- **Current:** `f"by Hermes Agent.  Choose a model with at least "`
- **Fix:** `f"by Hermes.  Choose a model with at least "`

#### F50 — Fix model_switch warning (LOW)
- **File:** `hermes_cli/model_switch.py` line 78
- **Current:** `"for use with Hermes Agent. They lack the tool-calling capabilities "`
- **Fix:** `"for use with Hermes. They lack the tool-calling capabilities "`

#### F51 — Update test assertions (LOW)
- **Files:**
  - `tests/run_agent/test_run_agent.py:5813,5840` — `assert "Hermes Agent" in agent._cached_system_prompt`
  - `tests/hermes_cli/test_tui_resume_flow.py:409` — `assert "Hermes Agent v" in out`
  - `tests/agent/test_prompt_builder.py:703` — `assert "Hermes Agent" in result`
  - `tests/cli/test_cli_init.py` — 8 matches checking "Checking Running Hermes Agent"
  - `tests/test_cli_skin_integration.py` — 4 matches with "Hermes Agent v0.1.0"
  - `tests/tools/test_mcp_oauth_*.py` — 6 matches with `client_name="Hermes Agent"`
- **Fix:** Update all assertions to expect "Hermes" instead of "Hermes Agent"

---

### CATEGORY 6: Other Branding & Cleanup

#### F26 — Update AGENTS.md (MEDIUM)
- **File:** `AGENTS.md`
- **Changes:** Replace "Hermes" → "Hermes" in user-facing descriptions. Keep technical references (paths, env vars like `HERMES_HOME`, `HERMES_TIMEZONE`) as-is since those are code identifiers.
- **Note:** `HERMES_HOME` and other env vars should NOT be renamed — that would be a breaking change requiring migration logic.

#### F27 — Update bot descriptions for messaging platforms (LOW)
- **Files:**
  - `plugins/platforms/slack/adapter.py` — Bot description
  - `plugins/platforms/discord/adapter.py` — Command description
  - `plugins/platforms/irc/adapter.py` — Comment
  - `hermes_cli/slack_cli.py` — Bot description
- **Change:** Replace "Hermes" → "Hermes" in user-facing bot descriptions

#### F28 — Update uninstall messages (LOW)
- **File:** `hermes_cli/uninstall.py`
- **Change:** Replace "Hermes agent" → "Hermes" in user-facing uninstall confirmation messages

---

### CATEGORY 6: Release

#### F29 — Version bump, build, and release
- **Files:** `apps/desktop/package.json`, `hermes_cli/__init__.py`
- **Steps:**
  1. Bump version to `0.21.0`
  2. Run `npm run dist:win:nsis` to build the NSIS installer
  3. Create GitHub release `v0.21.0` in `S1d11/hermes-agent` repo
  4. Upload `Hermes-0.21.0-win-x64.exe`, `latest.yml`, and `.blockmap` as release assets
  5. Write release notes covering all fixes

---

## Implementation Order

### Phase 1: AI Identity Fixes (F1-F8) — Do First
These are the simplest, highest-impact changes. 8 string replacements across 6 files. Fixes the core "AI thinks it's Hermes" issue.

### Phase 2: User-Facing "Hermes Agent" Strings (F30-F51) — Do Second
22 string replacements across ~15 files. Fixes the `/version` command, CLI banner, setup wizard, uninstaller, skin engine, and all other places where users see "Hermes Agent". Most are single-line string changes.

### Phase 3: Version Display Fix (F14-F16) — Do Third
3 small changes to 3 TypeScript files. Fixes the version number not updating.

### Phase 4: MCP OAuth in Desktop (F17-F22) — Do Fourth
This is the most complex work. New API endpoints + new UI components. 6 changes across 4 files.

### Phase 5: README & Branding (F9-F13, F26-F28) — Do Fifth
Documentation updates. Can be done in parallel with Phase 4. Large number of files but low risk.

### Phase 6: MCP UX Polish (F23-F25) — Do Last
Nice-to-have improvements. Can be deferred to a follow-up release if needed.

### Phase 7: Test Updates (F51) — After all string changes
Update all test assertions to expect "Hermes" instead of "Hermes Agent".

### Phase 8: Release (F29) — Do Last
Version bump, build, upload.

---

## Decisions Needed From You

| # | Question | Options |
|---|----------|---------|
| D1 | Should CLI commands (`hermes`, `hermes mcp`, `hermes model`) be renamed to `hermes`? | **Keep as `hermes`** (backward compat, no breaking change) / **Rename to `hermes`** (full rebrand, breaking change) |
| D2 | Should env vars (`HERMES_HOME`, `HERMES_TIMEZONE`, `HERMES_DESKTOP`) be renamed? | **Keep as-is** (recommended — renaming breaks existing installs) / **Rename** (requires migration logic) |
| D3 | Should the "created by Nous Research" attribution be kept or removed? | **Keep** / **Remove** / **Change to "Hermes"** |
| D4 | Should the website docs (662 files, 5,452 refs) be updated in this release? | **Skip for now** (separate effort) / **Bulk replace** (scripted) |
| D5 | Should F25 (device code OAuth flow) be included in this release? | **Include** / **Defer to next release** |
| D6 | Should F24 (circuit breaker reset) be included? | **Include** / **Defer** |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Legacy SOUL.md detection breaks after F8 | Medium | Medium | Keep Hermes variants in `_LEGACY_TEMPLATE_SOULS` AND add Hermes variants |
| OAuth flow doesn't work from desktop backend | Low | High | Test with GitHub MCP first; fallback to CLI instructions if browser launch fails |
| Version refresh causes flicker in statusbar | Low | Low | Only refresh on boot + update events, not on every render |
| README URL changes break links | Medium | Low | Keep old URLs as redirects or keep `hermes-agent.nousresearch.com` domain |
| CLI rename breaks existing user workflows | High (if done) | High | Recommend NOT renaming CLI commands (D1) |
