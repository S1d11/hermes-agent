"""run_git must spawn git windowless so the periodic Projects-tree probe
doesn't flash a console per repo on a console-less Windows backend (#53178).

Behavior contract (platform-independent): run_git routes its creationflags
through windows_hide_flags() — CREATE_NO_WINDOW on Windows, 0 on POSIX — rather
than spawning a bare console git.
"""

from __future__ import annotations

from types import SimpleNamespace

import tui_gateway.git_probe as gp
from hermes_cli._subprocess_compat import windows_hide_flags


def test_run_git_routes_through_hide_flags(monkeypatch):
    captured: dict = {}

    def fake_run(cmd, **kwargs):
        captured.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="main\n")

    monkeypatch.setattr(gp.subprocess, "run", fake_run)
    assert gp.run_git("/repo", "branch", "--show-current") == "main"
    assert captured.get("creationflags") == windows_hide_flags()


def test_run_git_empty_cwd_does_not_spawn(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("run_git must not spawn for an empty cwd")

    monkeypatch.setattr(gp.subprocess, "run", boom)
    assert gp.run_git("") == ""
