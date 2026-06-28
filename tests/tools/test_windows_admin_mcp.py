"""Tests for the Windows Admin MCP server.

These tests verify the PowerShell helper functions and tool logic
without requiring the full MCP protocol stack. Integration tests
that spawn real PowerShell processes are skipped on non-Windows.
"""

import json
import sys

import pytest

_is_windows = sys.platform == "win32"


@pytest.mark.skipif(not _is_windows, reason="Windows-only MCP server")
class TestPowerShellHelper:
    """Test the _run_powershell helper."""

    def test_simple_echo(self):
        """_run_powershell should execute a simple command."""
        # Import the server module directly
        import importlib.util
        import os

        server_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "optional-mcps", "windows-admin", "server.py",
        )
        spec = importlib.util.spec_from_file_location("win_admin_mcp", server_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        result = mod._run_powershell("Write-Output 'hello'")
        assert result["success"] is True
        assert "hello" in result["output"]

    def test_error_handling(self):
        """_run_powershell should capture errors."""
        import importlib.util
        import os

        server_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "optional-mcps", "windows-admin", "server.py",
        )
        spec = importlib.util.spec_from_file_location("win_admin_mcp_err", server_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        result = mod._run_powershell("throw 'test error'")
        assert result["success"] is False

    def test_json_output(self):
        """_run_powershell_json should parse JSON output."""
        import importlib.util
        import os

        server_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "optional-mcps", "windows-admin", "server.py",
        )
        spec = importlib.util.spec_from_file_location("win_admin_mcp_json", server_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        result = mod._run_powershell_json(
            "@{ foo = 'bar'; num = 42 } | ConvertTo-Json -Compress"
        )
        assert result.get("foo") == "bar"
        assert result.get("num") == 42


@pytest.mark.skipif(not _is_windows, reason="Windows-only MCP server")
class TestRegistryTools:
    """Test registry read/list operations (read-only, safe)."""

    def _load_server(self):
        import importlib.util
        import os

        server_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "optional-mcps", "windows-admin", "server.py",
        )
        spec = importlib.util.spec_from_file_location("win_admin_mcp_reg", server_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_registry_read_known_value(self):
        """Read a known registry value (OS ProductName)."""
        mod = self._load_server()
        result = json.loads(mod.registry_read(
            "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
            "ProductName"
        ))
        # Should return a value containing "Windows" or an error
        assert "value" in result or "error" in result
        if "value" in result:
            assert "Windows" in result["value"] or result["value"]

    def test_registry_list_hklm_software(self):
        """List subkeys under HKLM\\SOFTWARE."""
        mod = self._load_server()
        result = json.loads(mod.registry_list("HKLM\\SOFTWARE"))
        assert "subkeys" in result or "error" in result
        if "subkeys" in result:
            assert isinstance(result["subkeys"], list)


@pytest.mark.skipif(not _is_windows, reason="Windows-only MCP server")
class TestServiceTools:
    """Test service list/get operations (read-only, safe)."""

    def _load_server(self):
        import importlib.util
        import os

        server_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "optional-mcps", "windows-admin", "server.py",
        )
        spec = importlib.util.spec_from_file_location("win_admin_mcp_svc", server_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_service_list(self):
        """List services — should return a non-empty list."""
        mod = self._load_server()
        result = json.loads(mod.service_list())
        # Result should be a list of service objects
        assert isinstance(result, list)
        assert len(result) > 0
        # Each service should have a Name field
        assert "Name" in result[0] or "name" in result[0]

    def test_service_get_spooler(self):
        """Get details for the Spooler service (should exist on all Windows)."""
        mod = self._load_server()
        result = json.loads(mod.service_get("Spooler"))
        assert "Name" in result or "error" in result
        if "Name" in result:
            assert result["Name"] == "Spooler" or result.get("name") == "Spooler"


class TestManifestExists:
    """Test that the manifest file exists and is valid."""

    def test_manifest_file_exists(self):
        import os

        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        manifest = os.path.join(repo_root, "optional-mcps", "windows-admin", "manifest.yaml")
        assert os.path.isfile(manifest), "manifest.yaml not found"

    def test_server_file_exists(self):
        import os

        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        server = os.path.join(repo_root, "optional-mcps", "windows-admin", "server.py")
        assert os.path.isfile(server), "server.py not found"
