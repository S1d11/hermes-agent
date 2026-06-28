"""Native Windows PowerShell execution environment.

Provides a terminal backend that runs commands via PowerShell instead of
Git Bash. This gives the agent native access to Windows-specific cmdlets,
registry operations (Get/Set-ItemProperty HKLM:), WMI, Service Control
Manager (sc.exe, Set-Service), and other Windows admin tooling without
shell-quoting friction from the Git Bash translation layer.

Selected via ``TERMINAL_ENV=powershell``. Only available on Windows.

Design notes:
  - Commands are base64-encoded (UTF-16LE) and passed via
    ``-EncodedCommand`` to avoid all PowerShell quoting issues.
  - Env vars are snapshotted as JSON between calls so ``$env:FOO = 'bar'``
    persists across commands (same contract as the bash snapshot).
  - CWD persists via the shared ``__HERMES_CWD_{session}__`` marker system.
  - No profile loading (``-NoProfile``) for deterministic execution.
"""

import base64
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

from tools.environments.base import BaseEnvironment, _pipe_stdin
from tools.environments.local import (
    _IS_WINDOWS,
    _make_run_env,
    _resolve_safe_cwd,
)
from hermes_cli._subprocess_compat import windows_hide_flags

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PowerShell executable resolution
# ---------------------------------------------------------------------------

_powershell_exe: Optional[str] = None  # resolved once, cached


def _find_powershell() -> str:
    """Find a PowerShell executable, preferring pwsh (7+) over powershell.exe.

    Resolution order:
      1. ``HERMES_POWERSHELL_PATH`` env var (explicit override).
      2. ``pwsh.exe`` in Program Files (PowerShell 7+).
      3. ``pwsh`` on PATH.
      4. ``powershell.exe`` in System32 (Windows PowerShell 5.1, always present).
      5. ``powershell`` on PATH.

    Raises RuntimeError if no PowerShell is found (should never happen on
    a supported Windows host).
    """
    global _powershell_exe
    if _powershell_exe:
        return _powershell_exe

    # 1. Explicit override
    custom = os.environ.get("HERMES_POWERSHELL_PATH")
    if custom and os.path.isfile(custom):
        _powershell_exe = custom
        return _powershell_exe

    # 2. PowerShell 7+ in Program Files
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    for ver in ("7", "6"):
        candidate = os.path.join(program_files, "PowerShell", ver, "pwsh.exe")
        if os.path.isfile(candidate):
            _powershell_exe = candidate
            return _powershell_exe

    # 3. pwsh on PATH
    which = shutil.which("pwsh")
    if which:
        _powershell_exe = which
        return _powershell_exe

    # 4. Windows PowerShell 5.1 (always present on supported Windows)
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    candidate = os.path.join(
        system_root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
    )
    if os.path.isfile(candidate):
        _powershell_exe = candidate
        return _powershell_exe

    # 5. powershell on PATH
    which = shutil.which("powershell")
    if which:
        _powershell_exe = which
        return _powershell_exe

    raise RuntimeError(
        "PowerShell not found. Set HERMES_POWERSHELL_PATH, install PowerShell 7+, "
        "or ensure powershell.exe is on PATH."
    )


# ---------------------------------------------------------------------------
# PowerShellEnvironment
# ---------------------------------------------------------------------------


class PowerShellEnvironment(BaseEnvironment):
    """Run commands via native Windows PowerShell.

    Spawn-per-call: every ``execute()`` spawns a fresh ``powershell.exe``
    (or ``pwsh.exe``) process.  Env vars are snapshotted as JSON between
    calls.  CWD persists via stdout markers (same as all backends).
    """

    def __init__(self, cwd: str = "", timeout: int = 60, env: dict = None):
        if not _IS_WINDOWS:
            raise RuntimeError(
                "PowerShellEnvironment is only available on Windows. "
                "Use 'local' (Git Bash) on other platforms."
            )
        if cwd:
            cwd = os.path.expanduser(cwd)
        super().__init__(cwd=cwd or os.getcwd(), timeout=timeout, env=env)
        # Override snapshot path to use .json extension (env vars serialized
        # as JSON, not a dot-sourceable .sh or .ps1 script).
        temp_dir = self.get_temp_dir()
        self._snapshot_path = f"{temp_dir}/hermes-snap-{self._session_id}.json"
        self.init_session()

    # ------------------------------------------------------------------
    # Temp dir (Windows-safe, same strategy as LocalEnvironment)
    # ------------------------------------------------------------------

    def get_temp_dir(self) -> str:
        """Return a Windows-safe writable temp dir under HERMES_HOME.

        Uses forward slashes so the same string works in both PowerShell
        command interpolations and Python ``open()``.
        """
        try:
            from hermes_constants import get_hermes_home

            cache_dir = get_hermes_home() / "cache" / "terminal"
        except Exception:
            cache_dir = Path(tempfile.gettempdir()) / "hermes_terminal"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return str(cache_dir).replace("\\", "/")

    # ------------------------------------------------------------------
    # Session snapshot (env vars as JSON)
    # ------------------------------------------------------------------

    def init_session(self):
        """Capture PowerShell environment variables into a JSON snapshot.

        Sets ``_snapshot_ready = True`` on success so subsequent commands
        restore env vars from the snapshot before running.
        """
        snap_path = self._snapshot_path.replace("\\", "/")
        cwd = self.cwd.replace("\\", "/").replace("'", "''")

        # PowerShell script to capture env vars as JSON and emit CWD marker.
        bootstrap = (
            "$ErrorActionPreference = 'Continue'\n"
            f"try {{ Set-Location '{cwd}' }} catch {{ }}\n"
            "try {\n"
            "  $env_vars = @{}\n"
            "  Get-ChildItem Env: | ForEach-Object { $env_vars[$_.Name] = $_.Value }\n"
            f"  $env_vars | ConvertTo-Json -Compress -Depth 2 | Out-File '{snap_path}' -Encoding UTF8\n"
            "} catch { }\n"
            f"$__hermes_cwd = (Get-Location).Path\n"
            f"Write-Output \"`n{self._cwd_marker}${{__hermes_cwd}}{self._cwd_marker}`n\"\n"
        )

        try:
            proc = self._run_powershell(
                bootstrap, timeout=self._snapshot_timeout
            )
            result = self._wait_for_process(
                proc, timeout=self._snapshot_timeout
            )
            self._snapshot_ready = True
            self._update_cwd(result)
            logger.info(
                "PowerShell session snapshot created (session=%s, cwd=%s)",
                self._session_id,
                self.cwd,
            )
        except Exception as exc:
            logger.warning(
                "PowerShell init_session failed (session=%s): %s — "
                "falling back to no-snapshot mode",
                self._session_id,
                exc,
            )
            self._snapshot_ready = False

    # ------------------------------------------------------------------
    # Command wrapping
    # ------------------------------------------------------------------

    def _wrap_command(self, command: str, cwd: str) -> str:
        """Build a PowerShell script that restores env, cd's, runs command,
        re-dumps env, and emits the CWD marker.

        The user command is base64-encoded (UTF-16LE) and decoded inside
        PowerShell to avoid all quoting issues — single quotes, double
        quotes, backticks, dollar signs, and newlines in the command are
        all preserved verbatim.
        """
        cmd_b64 = base64.b64encode(command.encode("utf-16-le")).decode("ascii")
        snap_path = self._snapshot_path.replace("\\", "/")
        cwd_escaped = cwd.replace("\\", "/").replace("'", "''")
        marker = self._cwd_marker

        parts = ["$ErrorActionPreference = 'Continue'"]

        # Restore env vars from JSON snapshot
        if self._snapshot_ready:
            parts.append(
                f"if (Test-Path '{snap_path}') {{"
                " try {"
                f"  $saved = Get-Content '{snap_path}' -Raw | ConvertFrom-Json;"
                "  foreach ($p in $saved.PSObject.Properties) {"
                "   Set-Item Env:$($p.Name) $p.Value"
                "  }"
                " } catch { }"
                "}"
            )

        # Set working directory
        parts.append(f"try {{ Set-Location '{cwd_escaped}' }} catch {{ }}")

        # Decode and run the command (base64 avoids quoting issues)
        parts.append(
            f"$__hermes_cmd = [System.Text.Encoding]::Unicode.GetString("
            f"[System.Convert]::FromBase64String('{cmd_b64}'))"
        )
        parts.append(
            "try { Invoke-Expression $__hermes_cmd;"
            " $__hermes_ec = $LASTEXITCODE }"
            " catch { Write-Output $_.Exception.Message; $__hermes_ec = 1 }"
        )
        parts.append("if ($null -eq $__hermes_ec) { $__hermes_ec = 0 }")

        # Re-dump env vars to JSON snapshot
        if self._snapshot_ready:
            parts.append(
                "try {"
                " $env_vars = @{};"
                " Get-ChildItem Env: | ForEach-Object { $env_vars[$_.Name] = $_.Value };"
                f" $env_vars | ConvertTo-Json -Compress -Depth 2 | Out-File '{snap_path}' -Encoding UTF8"
                "} catch { }"
            )

        # Emit CWD marker (same format as bash backends — base class parses this)
        parts.append("$__hermes_cwd = (Get-Location).Path")
        parts.append(f"Write-Output \"`n{marker}${{__hermes_cwd}}{marker}`n\"")
        parts.append("exit $__hermes_ec")

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Process spawning
    # ------------------------------------------------------------------

    def _run_powershell(
        self,
        cmd_string: str,
        *,
        timeout: int = 120,
        stdin_data: str | None = None,
    ) -> subprocess.Popen:
        """Spawn a PowerShell process to run *cmd_string*.

        Uses ``-EncodedCommand`` with base64-encoded UTF-16LE to avoid all
        quoting issues.  ``-NoProfile`` ensures deterministic execution
        (user profiles can add aliases/functions that change behavior).
        """
        ps = _find_powershell()
        encoded = base64.b64encode(
            cmd_string.encode("utf-16-le")
        ).decode("ascii")
        args = [
            ps,
            "-NoProfile",
            "-NoLogo",
            "-NonInteractive",
            "-EncodedCommand",
            encoded,
        ]

        run_env = _make_run_env(self.env)

        # Recover when cwd has been deleted (same rationale as LocalEnvironment)
        safe_cwd = _resolve_safe_cwd(self.cwd)
        if safe_cwd != self.cwd:
            self.cwd = safe_cwd

        proc = subprocess.Popen(
            args,
            text=True,
            env=run_env,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE
            if stdin_data is not None
            else subprocess.DEVNULL,
            creationflags=windows_hide_flags(),
            cwd=self.cwd,
        )

        if stdin_data is not None:
            _pipe_stdin(proc, stdin_data)

        return proc

    def _run_bash(
        self,
        cmd_string: str,
        *,
        login: bool = False,
        timeout: int = 120,
        stdin_data: str | None = None,
    ) -> subprocess.Popen:
        """Override BaseEnvironment._run_bash to use PowerShell.

        The method name ``_run_bash`` is inherited from the base class
        interface; this implementation spawns PowerShell instead.
        The ``login`` flag is ignored (PowerShell uses ``-NoProfile``).
        """
        return self._run_powershell(
            cmd_string, timeout=timeout, stdin_data=stdin_data
        )

    # ------------------------------------------------------------------
    # Process lifecycle
    # ------------------------------------------------------------------

    def _kill_process(self, proc):
        """Kill the PowerShell process and its children.

        Windows has no process groups (unlike POSIX ``os.killpg``), so we
        use ``proc.terminate()`` (sends WM_CLOSE / TerminateProcess) and
        fall back to ``proc.kill()`` if the process is still alive.
        """
        try:
            proc.terminate()
            time.sleep(0.5)
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def cleanup(self):
        """Remove snapshot and CWD files."""
        for path in (self._snapshot_path, self._cwd_file):
            try:
                if os.path.isfile(path):
                    os.unlink(path)
            except Exception:
                pass
