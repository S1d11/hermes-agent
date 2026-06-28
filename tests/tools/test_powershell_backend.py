"""Tests for the PowerShell terminal backend.

These tests verify the PowerShellEnvironment class without actually
spawning powershell.exe — they test command wrapping, encoding, and
the environment-type wiring in the terminal tool factory.

Tests that require a real PowerShell process are skipped on non-Windows
or when powershell.exe is unavailable.
"""

import base64
import json
import os
import sys

import pytest


# ---------------------------------------------------------------------------
# Import guard — PowerShellEnvironment is Windows-only
# ---------------------------------------------------------------------------

_is_windows = sys.platform == "win32"

if _is_windows:
    from tools.environments.powershell import (
        PowerShellEnvironment,
        _find_powershell,
    )
else:
    PowerShellEnvironment = None  # type: ignore[assignment,misc]
    _find_powershell = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Command wrapping (no PowerShell process needed)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _is_windows, reason="PowerShell backend is Windows-only")
class TestCommandWrapping:
    """Test _wrap_command produces valid PowerShell scripts."""

    def _make_env(self, tmp_path):
        """Create a PowerShellEnvironment with a temp cwd."""
        env = PowerShellEnvironment.__new__(PowerShellEnvironment)
        env.cwd = str(tmp_path)
        env.timeout = 60
        env.env = {}
        env._session_id = "test123"
        env._snapshot_path = str(tmp_path / "snap.json").replace("\\", "/")
        env._cwd_file = str(tmp_path / "cwd.txt").replace("\\", "/")
        env._cwd_marker = f"__HERMES_CWD_test123__"
        env._snapshot_ready = False
        return env

    def test_wrap_contains_encoded_command(self, tmp_path):
        """The wrapped script must contain a base64-encoded command."""
        env = self._make_env(tmp_path)
        wrapped = env._wrap_command("Get-Process", str(tmp_path))

        # The command should be base64-encoded in the wrapper
        # Verify we can decode it back
        import re

        match = re.search(r"FromBase64String\('([^']+)'\)", wrapped)
        assert match, "wrapped script must contain a base64-encoded command"
        decoded = base64.b64decode(match.group(1)).decode("utf-16-le")
        assert decoded == "Get-Process"

    def test_wrap_sets_location(self, tmp_path):
        """The wrapped script must set the working directory."""
        env = self._make_env(tmp_path)
        cwd = str(tmp_path).replace("\\", "/")
        wrapped = env._wrap_command("echo hi", cwd)
        assert "Set-Location" in wrapped
        assert cwd in wrapped

    def test_wrap_emits_cwd_marker(self, tmp_path):
        """The wrapped script must emit the CWD marker."""
        env = self._make_env(tmp_path)
        wrapped = env._wrap_command("echo hi", str(tmp_path))
        assert env._cwd_marker in wrapped

    def test_wrap_handles_special_chars_in_command(self, tmp_path):
        """Commands with quotes, backticks, and dollar signs must be preserved."""
        env = self._make_env(tmp_path)
        cmd = "Write-Output \"Hello `nWorld $env:PATH 'test'\""
        wrapped = env._wrap_command(cmd, str(tmp_path))

        import re

        match = re.search(r"FromBase64String\('([^']+)'\)", wrapped)
        assert match
        decoded = base64.b64decode(match.group(1)).decode("utf-16-le")
        assert decoded == cmd

    def test_wrap_with_snapshot_restore(self, tmp_path):
        """When _snapshot_ready is True, the wrapper restores env from JSON."""
        env = self._make_env(tmp_path)
        env._snapshot_ready = True
        wrapped = env._wrap_command("echo hi", str(tmp_path))
        assert "ConvertFrom-Json" in wrapped
        assert "Set-Item Env:" in wrapped

    def test_wrap_without_snapshot_no_restore(self, tmp_path):
        """When _snapshot_ready is False, the wrapper skips env restore."""
        env = self._make_env(tmp_path)
        env._snapshot_ready = False
        wrapped = env._wrap_command("echo hi", str(tmp_path))
        assert "ConvertFrom-Json" not in wrapped


# ---------------------------------------------------------------------------
# PowerShell executable resolution
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _is_windows, reason="PowerShell backend is Windows-only")
class TestFindPowerShell:
    """Test _find_powershell resolution."""

    def test_finds_powershell(self):
        """_find_powershell must find a PowerShell executable on Windows."""
        ps = _find_powershell()
        assert ps, "_find_powershell returned empty string"
        assert os.path.isfile(ps), f"_find_powershell returned non-existent path: {ps}"

    def test_caches_result(self):
        """_find_powershell caches its result."""
        ps1 = _find_powershell()
        ps2 = _find_powershell()
        assert ps1 == ps2


# ---------------------------------------------------------------------------
# Terminal tool factory wiring
# ---------------------------------------------------------------------------


class TestTerminalToolWiring:
    """Test that the terminal tool factory recognizes 'powershell'."""

    def test_powershell_in_env_config(self):
        """_get_env_config should accept TERMINAL_ENV=powershell."""
        os.environ["TERMINAL_ENV"] = "powershell"
        try:
            from tools.terminal_tool import _get_env_config

            config = _get_env_config()
            assert config["env_type"] == "powershell"
        finally:
            del os.environ["TERMINAL_ENV"]

    def test_powershell_not_container_backend(self):
        """powershell should NOT be treated as a container backend."""
        from tools.terminal_tool import _get_env_config

        os.environ["TERMINAL_ENV"] = "powershell"
        try:
            config = _get_env_config()
            # container_backend is derived from env_type in _get_env_config
            # powershell is a host-level backend like local
            assert config["env_type"] not in {
                "docker",
                "singularity",
                "modal",
                "daytona",
            }
        finally:
            del os.environ["TERMINAL_ENV"]


# ---------------------------------------------------------------------------
# Integration test (requires real PowerShell — skipped if unavailable)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not _is_windows,
    reason="PowerShell backend is Windows-only",
)
class TestPowerShellIntegration:
    """Integration tests that spawn a real PowerShell process."""

    def test_simple_echo(self, tmp_path):
        """Execute a simple command in PowerShell."""
        try:
            env = PowerShellEnvironment(cwd=str(tmp_path), timeout=30)
        except RuntimeError:
            pytest.skip("PowerShell not available")
        try:
            result = env.execute("Write-Output 'hello from powershell'")
            assert result["returncode"] == 0
            assert "hello from powershell" in result["output"]
        finally:
            env.cleanup()

    def test_cwd_persistence(self, tmp_path):
        """CWD should persist across commands via markers."""
        try:
            env = PowerShellEnvironment(cwd=str(tmp_path), timeout=30)
        except RuntimeError:
            pytest.skip("PowerShell not available")
        try:
            # First command: cd to a subdirectory
            sub = tmp_path / "subdir"
            sub.mkdir()
            result = env.execute(f"Set-Location '{sub}'")
            assert result["returncode"] == 0

            # Second command: verify we're in the subdirectory
            result = env.execute("Get-Location | Select-Object -ExpandProperty Path")
            assert result["returncode"] == 0
            # The CWD should have been updated by the marker system
            assert str(sub).lower() in env.cwd.lower() or str(sub) in env.cwd
        finally:
            env.cleanup()

    def test_env_var_persistence(self, tmp_path):
        """Env vars should persist across commands via JSON snapshot."""
        try:
            env = PowerShellEnvironment(cwd=str(tmp_path), timeout=30)
        except RuntimeError:
            pytest.skip("PowerShell not available")
        try:
            # Set an env var
            env.execute("$env:HERMES_TEST_VAR = 'persisted_value'")

            # Read it back in a separate command
            result = env.execute("Write-Output $env:HERMES_TEST_VAR")
            assert result["returncode"] == 0
            assert "persisted_value" in result["output"]
        finally:
            env.cleanup()

    def test_exit_code_propagation(self, tmp_path):
        """Non-zero exit codes should be propagated."""
        try:
            env = PowerShellEnvironment(cwd=str(tmp_path), timeout=30)
        except RuntimeError:
            pytest.skip("PowerShell not available")
        try:
            result = env.execute("exit 42")
            assert result["returncode"] == 42
        finally:
            env.cleanup()
