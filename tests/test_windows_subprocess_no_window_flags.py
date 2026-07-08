from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest


_CREATE_NO_WINDOW = 0x08000000


class _Completed:
    def __init__(self, stdout: str | bytes = "ok\n", returncode: int = 0):
        self.stdout = stdout
        self.stderr = ""
        self.returncode = returncode


def _spawns(captured, *needles):
    """Captured ``subprocess.run`` calls whose argv contains every needle.

    These tests patch ``<module>.subprocess.run``, which is the shared
    ``subprocess`` module singleton — so the patch is process-wide. Importing
    ``tui_gateway.server`` kicks off ``prefetch_update_check`` (a daemon thread
    that shells out to ``git ... origin`` with ``text=True, timeout=5``), and
    that call can land in ``captured`` mid-test. Matching the distinctive argv
    tokens of the call under test (e.g. ``--show-toplevel``, ``ls-files``) keeps
    each assertion scoped to its own contract and immune to that cross-talk —
    otherwise a stray ``git`` spawn trips a bare ``KeyError: 'creationflags'``
    or a call-count / full-list mismatch.
    """
    return [
        (cmd, kwargs)
        for cmd, kwargs in captured
        if cmd and all(n in cmd for n in needles)
    ]


def test_tui_gateway_git_probe_hides_git_windows(monkeypatch):
    from tui_gateway import git_probe

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="main\n")

    monkeypatch.setattr(git_probe, "IS_WINDOWS", True)
    monkeypatch.setattr(git_probe, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(git_probe.subprocess, "run", fake_run)

    assert git_probe.run_git("C:/repo", "branch", "--show-current") == "main"

    git_calls = _spawns(captured, "branch", "--show-current")
    assert git_calls == [
        (
            ["git", "-C", "C:/repo", "branch", "--show-current"],
            {
                "capture_output": True,
                "text": True,
                "encoding": "utf-8",
                "errors": "replace",
                "timeout": git_probe._GIT_TIMEOUT,
                "check": False,
                "stdin": subprocess.DEVNULL,
                "creationflags": _CREATE_NO_WINDOW,
            },
        )
    ]


def test_tui_gateway_fuzzy_file_listing_hides_git_windows(monkeypatch):
    from hermes_cli import _subprocess_compat
    from tui_gateway import server

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        if cmd[-1] == "--show-toplevel":
            return _Completed(stdout=b"C:/repo\n")
        return _Completed(stdout=b"src/main.py\0README.md\0")

    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(server.subprocess, "run", fake_run)
    server._fuzzy_cache.clear()

    assert server._list_repo_files("C:/repo") == ["src/main.py", "README.md"]

    toplevel = _spawns(captured, "rev-parse", "--show-toplevel")
    ls_files = _spawns(captured, "ls-files")
    assert len(toplevel) == 1 and len(ls_files) == 1, captured
    assert toplevel[0][1].get("creationflags") == _CREATE_NO_WINDOW
    assert ls_files[0][1].get("creationflags") == _CREATE_NO_WINDOW


def test_coding_context_git_hides_git_windows(monkeypatch):
    from agent import coding_context

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="clean\n")

    monkeypatch.setattr(coding_context, "IS_WINDOWS", True)
    monkeypatch.setattr(coding_context, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(coding_context.subprocess, "run", fake_run)

    assert coding_context._git(Path("C:/repo"), "status", "--short") == "clean"
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_context_reference_git_and_rg_hide_windows(monkeypatch):
    from agent import context_references

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        if cmd[0] == "rg":
            return _Completed(stdout="src/main.py\n")
        return _Completed(stdout="diff --git a/src/main.py b/src/main.py\n")

    monkeypatch.setattr(context_references, "IS_WINDOWS", True)
    monkeypatch.setattr(context_references, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(context_references.subprocess, "run", fake_run)

    ref = context_references.ContextReference(
        raw="@diff",
        kind="diff",
        target="",
        start=0,
        end=5,
    )
    warning, block = context_references._expand_git_reference(
        ref,
        Path("C:/repo"),
        ["diff"],
        "git diff",
    )
    assert warning is None
    assert block is not None
    assert "git diff" in block
    assert context_references._rg_files(Path("C:/repo/src"), Path("C:/repo"), 10) == [
        Path("src/main.py")
    ]

    git_calls = _spawns(captured, "diff")
    rg_calls = _spawns(captured, "rg")
    assert len(git_calls) == 1 and len(rg_calls) == 1, captured
    assert git_calls[0][1].get("creationflags") == _CREATE_NO_WINDOW
    assert rg_calls[0][1].get("creationflags") == _CREATE_NO_WINDOW


def test_copilot_gh_cli_probe_hides_gh_windows(monkeypatch):
    from hermes_cli import copilot_auth

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="gho_from_cli\n")

    monkeypatch.setattr(copilot_auth, "IS_WINDOWS", True)
    monkeypatch.setattr(copilot_auth, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(copilot_auth, "_gh_cli_candidates", lambda: ["gh"])
    monkeypatch.setattr(copilot_auth.subprocess, "run", fake_run)

    assert copilot_auth._try_gh_cli_token() == "gho_from_cli"
    assert captured[0][0] == ["gh", "auth", "token"]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_gateway_pid_scan_hides_wmic_and_powershell_windows(monkeypatch):
    from hermes_cli import gateway
    from hermes_cli import _subprocess_compat

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        if cmd[0] == "wmic":
            return _Completed(stdout="", returncode=1)
        return _Completed(stdout="CommandLine=hermes gateway\nProcessId=123\n")

    monkeypatch.setattr(gateway, "is_windows", lambda: True)
    monkeypatch.setattr(gateway.shutil, "which", lambda name: name)
    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(gateway.subprocess, "run", fake_run)

    assert gateway._scan_gateway_pids(set()) == [123]
    # The wmic probe and the PowerShell fallback are the two console spawns
    # this scan makes on Windows; both must hide the window via
    # ``creationflags``. Filter to those two commands (rather than indexing a
    # positional list) so the contract — "every Windows pid-scan spawn is
    # windowless" — is asserted directly and can't be tripped by an unrelated
    # captured call leaking in from prior module-state churn in the same
    # process. ``.get`` keeps a stray non-windowed call from masking the real
    # assertion behind a bare KeyError.
    scan_spawns = [
        kwargs
        for cmd, kwargs in captured
        if cmd and cmd[0] in {"wmic", "powershell", "pwsh"}
    ]
    assert len(scan_spawns) == 2, captured
    assert [kwargs.get("creationflags") for kwargs in scan_spawns] == [
        _CREATE_NO_WINDOW,
        _CREATE_NO_WINDOW,
    ]


def test_stale_dashboard_windows_scan_hides_wmic(monkeypatch):
    from hermes_cli import main
    from hermes_cli import _subprocess_compat

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="CommandLine=hermes dashboard\nProcessId=123\n")

    monkeypatch.setattr(main.sys, "platform", "win32")
    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(main.subprocess, "run", fake_run)

    assert main._find_stale_dashboard_pids() == [123]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_gateway_force_kill_hides_taskkill_window(monkeypatch):
    from gateway import status
    from hermes_cli import _subprocess_compat

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="")

    monkeypatch.setattr(status, "_IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(status.subprocess, "run", fake_run)

    status.terminate_pid(123, force=True)

    kill_calls = _spawns(captured, "taskkill")
    assert kill_calls == [
        (
            ["taskkill", "/PID", "123", "/T", "/F"],
            {
                "capture_output": True,
                "text": True,
                "timeout": 10,
                "creationflags": _CREATE_NO_WINDOW,
            },
        )
    ]


def test_shell_hooks_hide_hook_command_windows(monkeypatch):
    from agent import shell_hooks

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return SimpleNamespace(returncode=0, stdout="{}", stderr="")

    monkeypatch.setattr(shell_hooks, "IS_WINDOWS", True)
    monkeypatch.setattr(shell_hooks, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(shell_hooks.subprocess, "run", fake_run)

    result = shell_hooks._spawn(
        shell_hooks.ShellHookSpec(event="post_tool_call", command="hook-bin --flag"),
        "{}",
    )

    assert result["returncode"] == 0
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_inline_skill_shell_hides_bash_window(monkeypatch):
    from agent import skill_preprocessing

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return SimpleNamespace(returncode=0, stdout="ok\n", stderr="")

    monkeypatch.setattr(skill_preprocessing, "IS_WINDOWS", True)
    monkeypatch.setattr(skill_preprocessing, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(skill_preprocessing.subprocess, "run", fake_run)

    assert skill_preprocessing.run_inline_shell("echo ok", cwd=None, timeout=5) == "ok"
    assert captured[0][0] == ["bash", "-c", "echo ok"]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_tts_opus_conversion_hides_ffmpeg_window(monkeypatch, tmp_path):
    from tools import tts_tool

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(returncode=0)

    monkeypatch.setattr(tts_tool, "_has_ffmpeg", lambda: True)
    monkeypatch.setattr(tts_tool, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(tts_tool.subprocess, "run", fake_run)

    tts_tool._convert_to_opus(str(tmp_path / "v.mp3"))

    assert captured[0][0][0] == "ffmpeg"
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_local_stt_audio_prep_hides_ffmpeg_window(monkeypatch, tmp_path):
    from tools import transcription_tools

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(returncode=0)

    monkeypatch.setattr(transcription_tools, "_find_ffmpeg_binary", lambda: "ffmpeg")
    monkeypatch.setattr(transcription_tools, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(transcription_tools.subprocess, "run", fake_run)

    transcription_tools._prepare_local_audio(str(tmp_path / "in.m4a"), str(tmp_path))

    assert captured[0][0][0] == "ffmpeg"
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_checkpoint_manager_git_hides_windows(monkeypatch):
    from tools import checkpoint_manager

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="clean\n")

    monkeypatch.setattr(checkpoint_manager, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(checkpoint_manager.subprocess, "run", fake_run)

    ok, _, _ = checkpoint_manager._run_git(["status", "--short"], Path("C:/store"), ".")
    assert ok
    assert captured[0][0][0] == "git"
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_cli_git_repo_root_hides_git_window(monkeypatch):
    pytest.importorskip("prompt_toolkit")
    from cli import _git_repo_root

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="C:/repo\n")

    monkeypatch.setattr("cli.windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr("cli.subprocess", SimpleNamespace(run=fake_run, DEVNULL=subprocess.DEVNULL))

    assert _git_repo_root() == "C:/repo"
    assert captured[0][0] == ["git", "rev-parse", "--show-toplevel"]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_cli_resolve_worktree_base_hides_git_windows(monkeypatch):
    pytest.importorskip("prompt_toolkit")
    from cli import _resolve_worktree_base

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="", returncode=1)

    monkeypatch.setattr("cli.windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr("cli.subprocess", SimpleNamespace(run=fake_run, DEVNULL=subprocess.DEVNULL))

    base_ref, label = _resolve_worktree_base("C:/repo")
    # Falls back to HEAD when all git probes fail
    assert base_ref == "HEAD"
    # Every git call should have the window-hiding flag
    assert len(captured) >= 1
    for _, kwargs in captured:
        assert kwargs["creationflags"] == _CREATE_NO_WINDOW


def test_skills_hub_gh_token_hides_windows(monkeypatch):
    from tools import skills_hub

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="gho_from_cli\n")

    monkeypatch.setattr(skills_hub, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(skills_hub.subprocess, "run", fake_run)

    auth = skills_hub.GitHubAuth.__new__(skills_hub.GitHubAuth)
    assert auth._try_gh_cli() == "gho_from_cli"
    assert captured[0][0] == ["gh", "auth", "token"]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_copilot_acp_spawn_hides_window(monkeypatch):
    from agent import copilot_acp_client

    captured = {}

    class FakeProc:
        def __init__(self):
            self.stdin = None
            self.stdout = None
            self.stderr = None
            self.pid = 12345

        def kill(self):
            pass

        def wait(self, timeout=None):
            pass

    def fake_popen(cmd, **kwargs):
        captured.update(kwargs)
        return FakeProc()

    monkeypatch.setattr("agent.copilot_acp_client.windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr("agent.copilot_acp_client.subprocess", SimpleNamespace(
        PIPE=-1, Popen=fake_popen, DEVNULL=subprocess.DEVNULL
    ))

    client = copilot_acp_client.CopilotACPClient.__new__(copilot_acp_client.CopilotACPClient)
    client._acp_command = "copilot-acp"
    client._acp_args = []
    client._acp_cwd = "C:/repo"

    # _build_subprocess_env is module-level; patch it to avoid env dependencies
    monkeypatch.setattr(copilot_acp_client, "_build_subprocess_env", lambda: {})

    try:
        client._run_prompt("test", timeout_seconds=5)
    except Exception:
        pass  # We only care about the Popen kwargs

    assert captured.get("creationflags") == _CREATE_NO_WINDOW


def test_codex_app_server_spawn_hides_window(monkeypatch):
    from agent.transports import codex_app_server

    captured = {}

    class FakeProc:
        def __init__(self):
            self.stdin = None
            self.stdout = None
            self.stderr = None
            self.pid = 12345

        def kill(self):
            pass

        def wait(self, timeout=None):
            pass

    def fake_popen(cmd, **kwargs):
        captured.update(kwargs)
        return FakeProc()

    monkeypatch.setattr("agent.transports.codex_app_server.windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr("agent.transports.codex_app_server.subprocess", SimpleNamespace(
        PIPE=-1, Popen=fake_popen, DEVNULL=subprocess.DEVNULL
    ))

    # Construct a CodexAppServerClient with minimal args to reach the Popen call
    try:
        codex_app_server.CodexAppServerClient(
            codex_bin="codex",
        )
    except Exception:
        pass  # We only care about the Popen kwargs

    assert captured.get("creationflags") == _CREATE_NO_WINDOW


def test_tui_gateway_pdftoppm_hides_window(monkeypatch):
    from hermes_cli import _subprocess_compat
    from tui_gateway import server

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(returncode=1, stdout="", stderr="not found")

    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(server.subprocess, "run", fake_run)

    # _render_pdf_pages will fail early (pdftoppm returns nonzero), but the
    # subprocess.run call should still carry creationflags.
    # We need a fake PDF path and request id to call the function.
    try:
        server._render_pdf_pages(
            rid="test-1",
            pdf_path="fake.pdf",
            first_page=1,
            last_page=1,
        )
    except Exception:
        pass

    if captured:
        assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_web_server_git_log_hides_window(monkeypatch):
    try:
        from hermes_cli import web_server
    except Exception:
        pytest.skip("web_server import requires compatible FastAPI version")
    from hermes_cli import _subprocess_compat

    captured = []

    def fake_run(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Completed(stdout="")

    monkeypatch.setattr(_subprocess_compat, "IS_WINDOWS", True)
    monkeypatch.setattr(_subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)
    monkeypatch.setattr(web_server.subprocess, "run", fake_run)

    web_server._recent_upstream_commits(n=5)

    assert len(captured) == 1
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW


def test_tui_slash_worker_hides_python_window(monkeypatch):
    from tui_gateway import server

    captured = []

    class _Proc:
        stdin = SimpleNamespace()
        stdout = []
        stderr = []

    def fake_popen(cmd, **kwargs):
        captured.append((cmd, kwargs))
        return _Proc()

    monkeypatch.setattr(server.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(server.threading, "Thread", lambda *a, **k: SimpleNamespace(start=lambda: None))

    import hermes_cli._subprocess_compat as subprocess_compat

    monkeypatch.setattr(subprocess_compat, "windows_hide_flags", lambda: _CREATE_NO_WINDOW)

    server._SlashWorker("session-key", "model-x")

    assert captured[0][0][:3] == [server.sys.executable, "-m", "tui_gateway.slash_worker"]
    assert captured[0][1]["creationflags"] == _CREATE_NO_WINDOW
