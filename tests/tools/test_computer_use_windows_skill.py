"""Tests for the computer-use-windows skill.

Verifies the SKILL.md file exists, has valid frontmatter, and contains
the expected sections for Windows desktop automation.
"""

import os

import pytest


def _skill_path():
    """Return the path to the computer-use-windows SKILL.md."""
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(repo_root, "skills", "computer-use-windows", "SKILL.md")


def test_skill_file_exists():
    """The SKILL.md file must exist."""
    assert os.path.isfile(_skill_path()), "skills/computer-use-windows/SKILL.md not found"


def test_skill_has_frontmatter():
    """The SKILL.md must have YAML frontmatter."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert content.startswith("---"), "SKILL.md must start with YAML frontmatter"
    # Find the closing ---
    parts = content.split("---", 2)
    assert len(parts) >= 3, "SKILL.md must have closing --- for frontmatter"


def test_skill_name():
    """The skill name must be 'computer-use-windows'."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "name: computer-use-windows" in content


def test_skill_platforms_windows():
    """The skill must target Windows."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "windows" in content.lower()


def test_skill_has_window_management():
    """The skill must cover window management."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "Window Management" in content or "window" in content.lower()


def test_skill_has_powershell_examples():
    """The skill must include PowerShell code examples."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "powershell" in content.lower()
    assert "Set-Location" in content or "Get-Process" in content or "Start-Process" in content


def test_skill_mentions_win32():
    """The skill must reference Win32 APIs."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "Win32" in content or "user32" in content


def test_skill_mentions_screenshots():
    """The skill must cover screenshot capture."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "screenshot" in content.lower() or "CopyFromScreen" in content


def test_skill_mentions_clipboard():
    """The skill must cover clipboard operations."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "clipboard" in content.lower() or "Clipboard" in content


def test_skill_mentions_windows_admin_mcp():
    """The skill should reference the windows-admin MCP server."""
    with open(_skill_path(), "r", encoding="utf-8") as f:
        content = f.read()
    assert "windows-admin" in content
