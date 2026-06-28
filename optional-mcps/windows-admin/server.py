#!/usr/bin/env python3
"""Windows Admin MCP Server — structured Windows system management tools.

Exposes registry, service, process, scheduled-task, and environment-variable
operations as MCP tools, giving the agent typed params/returns instead of
raw shell access. Safer than shelling out to reg.exe/sc.exe/powershell.exe
because each tool validates inputs and returns structured JSON.

Runs as a stdio MCP server. Add to Hermes with:
    hermes mcp add windows-admin --command "python optional-mcps/windows-admin/server.py"

Or add to any MCP client config:
    {
        "mcpServers": {
            "windows-admin": {
                "command": "python",
                "args": ["optional-mcps/windows-admin/server.py"]
            }
        }
    }

Requires:
  - Windows (uses powershell.exe for registry/service/process operations)
  - mcp package: pip install mcp

Tools provided:
  Registry:
    registry_read    — Read a registry value (key path + value name)
    registry_list    — List subkeys and values under a key
    registry_write   — Write a registry value
    registry_delete  — Delete a registry key or value
  Services:
    service_list     — List Windows services (optionally filtered by status)
    service_get      — Get detailed info about a specific service
    service_start    — Start a service
    service_stop     — Stop a service
    service_restart  — Restart a service
    service_set_startup — Set service startup type (auto/manual/disabled)
  Processes:
    process_list     — List running processes (optionally filtered by name)
    process_kill     — Kill a process by PID or name
  Scheduled Tasks:
    scheduled_task_list   — List scheduled tasks
    scheduled_task_delete — Delete a scheduled task
  Environment:
    env_var_get      — Get a system or user environment variable
    env_var_set      — Set a machine or user environment variable
  System Info:
    disk_info        — Get disk and partition information
    net_info         — Get network adapter information
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any

# Lazy MCP SDK import
try:
    from mcp.server.fastmcp import FastMCP

    _MCP_AVAILABLE = True
except ImportError:
    print(
        "Error: mcp package not installed. Install with: pip install mcp",
        file=sys.stderr,
    )
    sys.exit(1)

if sys.platform != "win32":
    print(
        "Error: windows-admin MCP server is only available on Windows.",
        file=sys.stderr,
    )
    sys.exit(1)


mcp = FastMCP("windows-admin")


# ---------------------------------------------------------------------------
# PowerShell helper
# ---------------------------------------------------------------------------


def _run_powershell(script: str, timeout: int = 30) -> dict[str, Any]:
    """Run a PowerShell script and return structured result.

    Returns {"success": bool, "output": str, "error": str, "exit_code": int}.
    """
    import base64

    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    try:
        proc = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NoLogo", "-NonInteractive",
             "-EncodedCommand", encoded],
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return {
            "success": proc.returncode == 0,
            "output": proc.stdout.strip(),
            "error": proc.stderr.strip(),
            "exit_code": proc.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "output": "", "error": "PowerShell command timed out", "exit_code": -1}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e), "exit_code": -1}


def _run_powershell_json(script: str, timeout: int = 30) -> dict[str, Any]:
    """Run a PowerShell script that outputs JSON and parse it.

    The script should end with `| ConvertTo-Json -Compress` or similar.
    Returns the parsed JSON dict, or an error dict.
    """
    result = _run_powershell(script, timeout=timeout)
    if not result["success"]:
        return {"error": result["error"] or result["output"]}
    try:
        if result["output"]:
            return json.loads(result["output"])
        return {}
    except json.JSONDecodeError:
        return {"error": f"Failed to parse JSON output: {result['output'][:200]}"}


# ---------------------------------------------------------------------------
# Registry tools
# ---------------------------------------------------------------------------


@mcp.tool()
def registry_read(key_path: str, value_name: str = "") -> str:
    """Read a Windows registry value.

    Args:
        key_path: Registry key path (e.g. HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion)
        value_name: Value name (empty string reads the default value)

    Returns:
        JSON with the value data, type, and any error.
    """
    if value_name:
        script = (
            f"$v = Get-ItemProperty -Path 'Registry::{key_path}' "
            f"-Name '{value_name}' -ErrorAction Stop; "
            f"$v.{value_name} | ConvertTo-Json -Compress"
        )
    else:
        script = (
            f"(Get-ItemProperty -Path 'Registry::{key_path}' "
            f"-ErrorAction Stop).'(default)' | ConvertTo-Json -Compress"
        )
    result = _run_powershell(script)
    if result["success"]:
        return json.dumps({"value": result["output"].strip('"')})
    return json.dumps({"error": result["error"] or result["output"]})


@mcp.tool()
def registry_list(key_path: str) -> str:
    """List subkeys and values under a registry key.

    Args:
        key_path: Registry key path (e.g. HKLM\\SOFTWARE\\Microsoft)

    Returns:
        JSON with "subkeys" (list of names) and "values" (list of {name, type, value}).
    """
    script = (
        "$result = @{ subkeys = @(); values = @() }\n"
        f"try {{\n"
        f"  $key = Get-ChildItem -Path 'Registry::{key_path}' -ErrorAction Stop\n"
        f"  $result.subkeys = $key.Name | ForEach-Object {{ $_.Split('\\')[-1] }}\n"
        f"}} catch {{ }}\n"
        f"try {{\n"
        f"  $props = Get-ItemProperty -Path 'Registry::{key_path}' -ErrorAction Stop\n"
        f"  $props.PSObject.Properties | Where-Object {{ $_.Name -notmatch '^PS' }} | "
        f"ForEach-Object {{ $result.values += @{{ name = $_.Name; value = $_.Value }} }}\n"
        f"}} catch {{ }}\n"
        f"$result | ConvertTo-Json -Depth 3 -Compress"
    )
    result = _run_powershell_json(script)
    return json.dumps(result)


@mcp.tool()
def registry_write(key_path: str, value_name: str, value_data: str,
                   value_type: str = "String") -> str:
    """Write a Windows registry value.

    Args:
        key_path: Registry key path (e.g. HKCU\\Software\\MyApp)
        value_name: Value name
        value_data: Value data (as string)
        value_type: Registry value type: String, DWord, QWord, Binary, ExpandString, MultiString

    Returns:
        JSON with success status.
    """
    valid_types = {"String", "DWord", "QWord", "Binary", "ExpandString", "MultiString"}
    if value_type not in valid_types:
        return json.dumps({"error": f"Invalid type. Use one of: {valid_types}"})

    script = (
        f"New-Item -Path 'Registry::{key_path}' -Force | Out-Null; "
        f"New-ItemProperty -Path 'Registry::{key_path}' -Name '{value_name}' "
        f"-Value '{value_data}' -PropertyType {value_type} -Force | Out-Null; "
        f"Write-Output 'OK'"
    )
    result = _run_powershell(script)
    if result["success"]:
        return json.dumps({"success": True})
    return json.dumps({"success": False, "error": result["error"] or result["output"]})


@mcp.tool()
def registry_delete(key_path: str, value_name: str = "") -> str:
    """Delete a registry key or value.

    Args:
        key_path: Registry key path
        value_name: If provided, deletes only this value. If empty, deletes the entire key.

    Returns:
        JSON with success status.
    """
    if value_name:
        script = (
            f"Remove-ItemProperty -Path 'Registry::{key_path}' "
            f"-Name '{value_name}' -ErrorAction Stop; Write-Output 'OK'"
        )
    else:
        script = (
            f"Remove-Item -Path 'Registry::{key_path}' -Recurse -Force -ErrorAction Stop; "
            f"Write-Output 'OK'"
        )
    result = _run_powershell(script)
    if result["success"]:
        return json.dumps({"success": True})
    return json.dumps({"success": False, "error": result["error"] or result["output"]})


# ---------------------------------------------------------------------------
# Service tools
# ---------------------------------------------------------------------------


@mcp.tool()
def service_list(status: str = "") -> str:
    """List Windows services, optionally filtered by status.

    Args:
        status: Filter by status (Running, Stopped, or empty for all)

    Returns:
        JSON array of {name, display_name, status, start_type}.
    """
    if status:
        script = (
            f"Get-Service | Where-Object {{ $_.Status -eq '{status}' }} | "
            f"Select-Object Name, DisplayName, Status, "
            f"@{{N='StartType';E={{(Get-Service $_.Name).StartType}}}} | "
            f"ConvertTo-Json -Depth 2 -Compress"
        )
    else:
        script = (
            "Get-Service | Select-Object Name, DisplayName, Status, StartType | "
            "ConvertTo-Json -Depth 2 -Compress"
        )
    result = _run_powershell_json(script)
    # Normalize single-object output to array
    if isinstance(result, dict) and "Name" in result:
        result = [result]
    return json.dumps(result)


@mcp.tool()
def service_get(name: str) -> str:
    """Get detailed information about a specific Windows service.

    Args:
        name: Service name (e.g. 'Spooler', 'wuauserv')

    Returns:
        JSON with service details (name, display_name, status, start_type, etc.).
    """
    script = (
        f"$s = Get-Service -Name '{name}' -ErrorAction Stop; "
        f"$s | Select-Object Name, DisplayName, Status, StartType, "
        f"CanPauseAndContinue, CanShutdown, CanStop, ServiceType | "
        f"ConvertTo-Json -Compress"
    )
    result = _run_powershell_json(script)
    return json.dumps(result)


@mcp.tool()
def service_start(name: str) -> str:
    """Start a Windows service.

    Args:
        name: Service name

    Returns:
        JSON with success status.
    """
    result = _run_powershell(f"Start-Service -Name '{name}' -ErrorAction Stop; Write-Output 'OK'")
    return json.dumps({"success": result["success"], "error": result["error"]})


@mcp.tool()
def service_stop(name: str) -> str:
    """Stop a Windows service.

    Args:
        name: Service name

    Returns:
        JSON with success status.
    """
    result = _run_powershell(f"Stop-Service -Name '{name}' -Force -ErrorAction Stop; Write-Output 'OK'")
    return json.dumps({"success": result["success"], "error": result["error"]})


@mcp.tool()
def service_restart(name: str) -> str:
    """Restart a Windows service.

    Args:
        name: Service name

    Returns:
        JSON with success status.
    """
    result = _run_powershell(f"Restart-Service -Name '{name}' -Force -ErrorAction Stop; Write-Output 'OK'")
    return json.dumps({"success": result["success"], "error": result["error"]})


@mcp.tool()
def service_set_startup(name: str, startup_type: str) -> str:
    """Set a Windows service's startup type.

    Args:
        name: Service name
        startup_type: One of: Automatic, Manual, Disabled, AutomaticDelayedStart

    Returns:
        JSON with success status.
    """
    valid = {"Automatic", "Manual", "Disabled", "AutomaticDelayedStart"}
    if startup_type not in valid:
        return json.dumps({"error": f"Invalid startup type. Use one of: {valid}"})
    result = _run_powershell(f"Set-Service -Name '{name}' -StartupType {startup_type} -ErrorAction Stop; Write-Output 'OK'")
    return json.dumps({"success": result["success"], "error": result["error"]})


# ---------------------------------------------------------------------------
# Process tools
# ---------------------------------------------------------------------------


@mcp.tool()
def process_list(name_filter: str = "") -> str:
    """List running processes, optionally filtered by name.

    Args:
        name_filter: If provided, only return processes matching this name.

    Returns:
        JSON array of {id, name, cpu, working_set_mb}.
    """
    if name_filter:
        script = (
            f"Get-Process -Name '{name_filter}*' -ErrorAction SilentlyContinue | "
            f"Select-Object Id, Name, "
            f"@{{N='CPU';E={{[math]::Round($_.CPU, 2)}}}}, "
            f"@{{N='WorkingSetMB';E={{[math]::Round($_.WorkingSet64/1MB, 1)}}}} | "
            f"ConvertTo-Json -Depth 2 -Compress"
        )
    else:
        script = (
            "Get-Process | Select-Object Id, Name, "
            "@{N='CPU';E={[math]::Round($_.CPU, 2)}}, "
            "@{N='WorkingSetMB';E={[math]::Round($_.WorkingSet64/1MB, 1)}} | "
            "ConvertTo-Json -Depth 2 -Compress"
        )
    result = _run_powershell_json(script)
    if isinstance(result, dict) and "Id" in result:
        result = [result]
    return json.dumps(result)


@mcp.tool()
def process_kill(pid: int = 0, name: str = "") -> str:
    """Kill a process by PID or name.

    Args:
        pid: Process ID (use 0 to kill by name)
        name: Process name (used when pid is 0)

    Returns:
        JSON with success status.
    """
    if pid > 0:
        result = _run_powershell(f"Stop-Process -Id {pid} -Force -ErrorAction Stop; Write-Output 'OK'")
    elif name:
        result = _run_powershell(f"Stop-Process -Name '{name}' -Force -ErrorAction Stop; Write-Output 'OK'")
    else:
        return json.dumps({"error": "Provide either pid or name"})
    return json.dumps({"success": result["success"], "error": result["error"]})


# ---------------------------------------------------------------------------
# Scheduled task tools
# ---------------------------------------------------------------------------


@mcp.tool()
def scheduled_task_list(task_name: str = "") -> str:
    """List scheduled tasks, optionally filtered by name.

    Args:
        task_name: If provided, only return tasks matching this name pattern.

    Returns:
        JSON array of {task_name, state, last_run_time, next_run_time}.
    """
    if task_name:
        script = (
            f"Get-ScheduledTask -TaskName '*{task_name}*' -ErrorAction SilentlyContinue | "
            f"Select-Object TaskName, State, "
            f"@{{N='LastRunTime';E={{(Get-ScheduledTaskInfo $_).LastRunTime}}}}, "
            f"@{{N='NextRunTime';E={{(Get-ScheduledTaskInfo $_).NextRunTime}}}} | "
            f"ConvertTo-Json -Depth 2 -Compress"
        )
    else:
        script = (
            "Get-ScheduledTask | Select-Object TaskName, State, "
            "@{N='LastRunTime';E={(Get-ScheduledTaskInfo $_).LastRunTime}}, "
            "@{N='NextRunTime';E={(Get-ScheduledTaskInfo $_).NextRunTime}} | "
            "ConvertTo-Json -Depth 2 -Compress"
        )
    result = _run_powershell_json(script, timeout=60)
    if isinstance(result, dict) and "TaskName" in result:
        result = [result]
    return json.dumps(result)


@mcp.tool()
def scheduled_task_delete(task_name: str) -> str:
    """Delete a scheduled task.

    Args:
        task_name: Exact task name to delete

    Returns:
        JSON with success status.
    """
    result = _run_powershell(
        f"Unregister-ScheduledTask -TaskName '{task_name}' -Confirm:$false -ErrorAction Stop; Write-Output 'OK'"
    )
    return json.dumps({"success": result["success"], "error": result["error"]})


# ---------------------------------------------------------------------------
# Environment variable tools
# ---------------------------------------------------------------------------


@mcp.tool()
def env_var_get(name: str, scope: str = "Machine") -> str:
    """Get a system or user environment variable.

    Args:
        name: Environment variable name
        scope: "Machine" (system-wide) or "User" (current user)

    Returns:
        JSON with the variable value.
    """
    if scope not in ("Machine", "User"):
        return json.dumps({"error": "scope must be 'Machine' or 'User'"})
    script = (
        f"[Environment]::GetEnvironmentVariable('{name}', '{scope}') | ConvertTo-Json -Compress"
    )
    result = _run_powershell_json(script)
    return json.dumps(result)


@mcp.tool()
def env_var_set(name: str, value: str, scope: str = "Machine") -> str:
    """Set a system or user environment variable.

    Args:
        name: Environment variable name
        value: Environment variable value
        scope: "Machine" (system-wide, requires admin) or "User" (current user)

    Returns:
        JSON with success status.
    """
    if scope not in ("Machine", "User"):
        return json.dumps({"error": "scope must be 'Machine' or 'User'"})
    script = (
        f"[Environment]::SetEnvironmentVariable('{name}', '{value}', '{scope}'); "
        f"Write-Output 'OK'"
    )
    result = _run_powershell(script)
    return json.dumps({"success": result["success"], "error": result["error"]})


# ---------------------------------------------------------------------------
# System info tools
# ---------------------------------------------------------------------------


@mcp.tool()
def disk_info() -> str:
    """Get disk and partition information.

    Returns:
        JSON array of disks with size, free space, and partition info.
    """
    script = (
        "Get-Disk | Select-Object Number, FriendlyName, "
        "@{N='SizeGB';E={[math]::Round($_.Size/1GB, 1)}}, "
        "@{N='FreeGB';E={[math]::Round(($_.Size - (Get-Partition -DiskNumber $_.Number | "
        "Measure-Object -Property Size -Sum).Sum)/1GB, 1)}}, "
        "PartitionStyle, OperationalStatus | ConvertTo-Json -Depth 2 -Compress"
    )
    result = _run_powershell_json(script)
    if isinstance(result, dict) and "Number" in result:
        result = [result]
    return json.dumps(result)


@mcp.tool()
def net_info() -> str:
    """Get network adapter information.

    Returns:
        JSON array of network adapters with name, status, IP, MAC.
    """
    script = (
        "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | "
        "Select-Object Name, InterfaceDescription, LinkSpeed, MacAddress, "
        "@{N='IPAddress';E={(Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress}} | "
        "ConvertTo-Json -Depth 2 -Compress"
    )
    result = _run_powershell_json(script)
    if isinstance(result, dict) and "Name" in result:
        result = [result]
    return json.dumps(result)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    mcp.run(transport="stdio")
