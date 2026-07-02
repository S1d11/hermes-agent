"""Handler for ``hermes evolve`` — launches the Zeus self-evolution pipeline.

This is a thin launcher. The actual optimization logic lives in the sibling
``zeus-self-evolution`` repo (``evolution.skills.evolve_skill`` and friends).
We import it lazily so the (heavy) DSPy/GEPA stack is only loaded when the
user actually runs ``hermes evolve``.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional


def _resolve_evolution_repo() -> Optional[Path]:
    """Find the ``zeus-self-evolution`` repo.

    Priority:
    1. ZEUS_SELF_EVOLUTION_REPO env var
    2. Sibling directory: <zeus>/zeus-self-evolution (typical dev layout)
    3. ~/.hermes/zeus-self-evolution
    """
    env = os.getenv("ZEUS_SELF_EVOLUTION_REPO")
    if env:
        p = Path(env).expanduser()
        if p.exists():
            return p

    # Sibling of the hermes-agent repo: <parent>/zeus-self-evolution
    # This file is at hermes-agent/hermes_cli/evolve_cmd.py → go up 2 levels.
    here = Path(__file__).resolve().parent.parent
    sibling = here.parent / "zeus-self-evolution"
    if sibling.exists():
        return sibling

    home = Path.home() / ".hermes" / "zeus-self-evolution"
    if home.exists():
        return home

    return None


def _ensure_evolution_importable() -> Path:
    """Make the ``evolution`` package importable. Returns the repo path."""
    repo = _resolve_evolution_repo()
    if repo is None:
        raise SystemExit(
            "Cannot find the zeus-self-evolution repo.\n"
            "Set ZEUS_SELF_EVOLUTION_REPO or clone it as a sibling of this repo:\n"
            "  git clone <hermes-agent-self-evolution> ../zeus-self-evolution"
        )
    repo_str = str(repo)
    if repo_str not in sys.path:
        sys.path.insert(0, repo_str)
    return repo


def _print_status(zeus_repo: Optional[str]) -> None:
    """Show self-evolution status."""
    _ensure_evolution_importable()
    from evolution.core.config import EvolutionConfig, get_zeus_agent_path

    try:
        agent_path = get_zeus_agent_path() if not zeus_repo else Path(zeus_repo)
    except FileNotFoundError as e:
        print(f"[evolve] {e}")
        return

    print(f"Zeus agent repo:  {agent_path}")
    skills_dir = agent_path / "skills"
    if skills_dir.exists():
        skills = sorted(d.name for d in skills_dir.iterdir() if d.is_dir())
        print(f"Available skills: {len(skills)}")
        for s in skills:
            print(f"  - {s}")
    else:
        print("No skills/ directory found.")

    config = EvolutionConfig()
    print(f"\nOptimizer model:  {config.optimizer_model}")
    print(f"Eval model:       {config.eval_model}")
    print(f"Judge model:      {config.judge_model}")
    print(f"Max skill size:   {config.max_skill_size} bytes")
    print(f"Max prompt growth: {config.max_prompt_growth:.0%}")

    # Look for open evolution branches
    import subprocess

    try:
        result = subprocess.run(
            ["git", "branch", "--list", "evolve/*"],
            cwd=str(agent_path),
            capture_output=True,
            text=True,
            timeout=5,
        )
        branches = [b.strip() for b in result.stdout.splitlines() if b.strip()]
        if branches:
            print(f"\nOpen evolution branches ({len(branches)}):")
            for b in branches:
                print(f"  {b}")
        else:
            print("\nNo open evolution branches.")
    except Exception:
        print("\n(git branch listing unavailable)")


def _run_monitor(days: int, zeus_repo: Optional[str]) -> None:
    """Analyze SessionDB for improvement opportunities."""
    try:
        from hermes_state import SessionDB
    except ImportError:
        print("[evolve monitor] SessionDB not available — run from the Zeus agent repo.")
        return

    try:
        db = SessionDB()
    except Exception as e:
        print(f"[evolve monitor] Could not open SessionDB: {e}")
        return

    import time
    from datetime import datetime, timedelta

    cutoff = time.time() - (days * 86400)
    print(f"Analyzing sessions from the last {days} days (since {datetime.fromtimestamp(int(cutoff)).strftime('%Y-%m-%d')})...")

    conn = db._conn
    try:
        cursor = conn.execute(
            "SELECT source, message_count, tool_call_count, input_tokens, output_tokens "
            "FROM sessions WHERE started_at >= ? ORDER BY started_at DESC",
            (cutoff,),
        )
        rows = [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"[evolve monitor] Query failed: {e}")
        db.close()
        return

    if not rows:
        print("No sessions found in that time range.")
        db.close()
        return

    total = len(rows)
    total_input = sum(r.get("input_tokens") or 0 for r in rows)
    total_output = sum(r.get("output_tokens") or 0 for r in rows)
    total_tools = sum(r.get("tool_call_count") or 0 for r in rows)
    total_msgs = sum(r.get("message_count") or 0 for r in rows)
    print(f"Sessions: {total}  Messages: {total_msgs:,}  Tool calls: {total_tools:,}")
    print(f"Tokens: {total_input + total_output:,} (in: {total_input:,}, out: {total_output:,})")

    # Per-source breakdown
    from collections import Counter, defaultdict

    by_source = Counter(r.get("source") or "unknown" for r in rows)
    print("\nBy source:")
    for src, count in by_source.most_common():
        print(f"  {src:20s} {count:4d} sessions")

    # TODO: deeper pattern analysis — failing tool calls, retries, ambiguous prompts
    # For now, surface the top-line stats as the starting point.
    print("\n[evolve monitor] Detailed pattern analysis is a Phase 5 feature.")
    print("For now, use `hermes insights` for usage analytics.")

    db.close()


def evolve_command(args) -> None:
    """Dispatch ``hermes evolve <action>``."""
    action = getattr(args, "evolve_action", None)

    if action is None:
        # No subcommand — print help-like status
        print("usage: hermes evolve <action> [options]\n")
        print("actions:")
        print("  skill     Evolve a single skill's SKILL.md instructions")
        print("  tool      Evolve a tool's description for better selection")
        print("  prompt    Evolve a system prompt section")
        print("  status    Show self-evolution status")
        print("  monitor   Analyze SessionDB for improvement opportunities")
        print("  auto      Run the full self-improvement loop")
        print("  validate  Validate repo health after self-modification")
        return

    if action == "status":
        _print_status(getattr(args, "zeus_repo", None))
        return

    if action == "monitor":
        _run_monitor(getattr(args, "days", 7), getattr(args, "zeus_repo", None))
        return

    if action == "auto":
        _ensure_evolution_importable()
        from evolution.monitor.auto_evolve import run_auto_loop

        run_auto_loop(
            days=getattr(args, "days", 7),
            max_candidates=getattr(args, "max_candidates", 5),
            iterations=getattr(args, "iterations", 5),
            dry_run=getattr(args, "dry_run", False),
            zeus_repo=getattr(args, "zeus_repo", None),
            source=getattr(args, "source", None),
        )
        return

    if action == "validate":
        _ensure_evolution_importable()
        from hermes_cli.evolve_validate import validate_all

        validate_all(getattr(args, "zeus_repo", None))
        return

    if action == "skill":
        _ensure_evolution_importable()
        from evolution.skills.evolve_skill import evolve

        evolve(
            skill_name=args.skill,
            iterations=args.iterations,
            eval_source=args.eval_source,
            dataset_path=args.dataset_path,
            optimizer_model=args.optimizer_model,
            eval_model=args.eval_model,
            hermes_repo=args.zeus_repo,
            run_tests=getattr(args, "run_tests", False),
            dry_run=args.dry_run,
        )
        return

    if action == "tool":
        _ensure_evolution_importable()
        from evolution.tools.evolve_tool import evolve as evolve_tool

        evolve_tool(
            tool_name=args.tool,
            iterations=args.iterations,
            eval_source=args.eval_source,
            dataset_path=args.dataset_path,
            optimizer_model=args.optimizer_model,
            eval_model=args.eval_model,
            hermes_repo=args.zeus_repo,
            dry_run=args.dry_run,
        )
        return

    if action == "prompt":
        _ensure_evolution_importable()

        if getattr(args, "list_sections", False):
            from evolution.prompts.prompt_module import EVOLVABLE_SECTIONS

            print("Evolvable system prompt sections:")
            for s in EVOLVABLE_SECTIONS:
                print(f"  {s}")
            return

        if not args.section:
            print("Error: --list-sections or provide a section name.")
            print("Run `hermes evolve prompt --list-sections` to see options.")
            return

        from evolution.prompts.evolve_prompt import evolve as evolve_prompt

        evolve_prompt(
            section_name=args.section,
            iterations=args.iterations,
            eval_source=args.eval_source,
            dataset_path=args.dataset_path,
            optimizer_model=args.optimizer_model,
            eval_model=args.eval_model,
            hermes_repo=args.zeus_repo,
            dry_run=args.dry_run,
        )
        return

    print(f"Unknown evolve action: {action}")
