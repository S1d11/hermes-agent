"""``hermes evolve`` subcommand parser.

Wires the Zeus self-evolution framework (DSPy + GEPA) into the Hermes CLI.
The actual optimization runs live in the sibling ``zeus-self-evolution`` repo;
this subcommand is a thin launcher that imports and invokes it.

Extracted from ``hermes_cli/main.py:main()`` following the god-file Phase 2
pattern. Handler injected to avoid importing ``main``.
"""

from __future__ import annotations

from typing import Callable


def build_evolve_parser(subparsers, *, cmd_evolve: Callable) -> None:
    """Attach the ``evolve`` subcommand to ``subparsers``."""
    evolve_parser = subparsers.add_parser(
        "evolve",
        help="Self-improve skills, tools, and prompts via DSPy + GEPA optimization",
        description=(
            "Run the Zeus self-evolution pipeline. Optimizes skill instructions, "
            "tool descriptions, and system prompts using DSPy + GEPA, with "
            "benchmark gating and git-branch output for human review."
        ),
    )
    evolve_subparsers = evolve_parser.add_subparsers(dest="evolve_action")

    # ── skill ──────────────────────────────────────────────────────────────
    evolve_skill = evolve_subparsers.add_parser(
        "skill",
        help="Evolve a single skill's SKILL.md instructions",
        description=(
            "Run GEPA optimization on a skill's SKILL.md body. Generates a "
            "synthetic eval dataset (or uses a golden/sessiondb one), optimizes "
            "the instruction text, runs the test suite as a constraint gate, "
            "and writes the evolved skill to a git branch for review."
        ),
    )
    evolve_skill.add_argument("skill", help="Name of the skill to evolve")
    evolve_skill.add_argument(
        "--iterations",
        type=int,
        default=10,
        help="Number of GEPA iterations (default: 10)",
    )
    evolve_skill.add_argument(
        "--eval-source",
        default="synthetic",
        choices=["synthetic", "golden", "sessiondb"],
        help="Source for the evaluation dataset (default: synthetic)",
    )
    evolve_skill.add_argument(
        "--dataset-path",
        default=None,
        help="Path to an existing eval dataset (JSONL) — overrides --eval-source",
    )
    evolve_skill.add_argument(
        "--optimizer-model",
        default="openai/gpt-4.1",
        help="Model for GEPA reflections (default: openai/gpt-4.1)",
    )
    evolve_skill.add_argument(
        "--eval-model",
        default="openai/gpt-4.1-mini",
        help="Model for evaluations (default: openai/gpt-4.1-mini)",
    )
    evolve_skill.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_skill.add_argument(
        "--run-tests",
        action="store_true",
        help="Run the full pytest suite as a constraint gate",
    )
    evolve_skill.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate setup without running optimization",
    )
    evolve_skill.set_defaults(func=cmd_evolve)

    # ── status ─────────────────────────────────────────────────────────────
    evolve_status = evolve_subparsers.add_parser(
        "status",
        help="Show self-evolution status: available skills, last run, open branches",
        description=(
            "Report the current state of the self-evolution system: which "
            "skills are available to evolve, the last optimization run, and "
            "any open evolution branches awaiting review."
        ),
    )
    evolve_status.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_status.set_defaults(func=cmd_evolve)

    # ── monitor ────────────────────────────────────────────────────────────
    evolve_monitor = evolve_subparsers.add_parser(
        "monitor",
        help="Analyze SessionDB for self-improvement opportunities",
        description=(
            "Scan recent session history for patterns that suggest "
            "improvement opportunities: failing tool calls, ambiguous prompts, "
            "retries, low-confidence skill invocations. Emits a ranked list "
            "of evolution candidates."
        ),
    )
    evolve_monitor.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days of session history to analyze (default: 7)",
    )
    evolve_monitor.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_monitor.set_defaults(func=cmd_evolve)

    # ── auto ───────────────────────────────────────────────────────────────
    evolve_auto = evolve_subparsers.add_parser(
        "auto",
        help="Run the full self-improvement loop: analyze → triage → evolve",
        description=(
            "Run one cycle of the continuous self-improvement loop. Analyzes "
            "recent sessions for improvement opportunities, ranks candidates "
            "by impact × frequency, and automatically evolves the top "
            "candidates. Results are saved to git branches for human review."
        ),
    )
    evolve_auto.add_argument(
        "--days",
        type=int,
        default=7,
        help="Days of session history to analyze (default: 7)",
    )
    evolve_auto.add_argument(
        "--max-candidates",
        type=int,
        default=5,
        help="Max candidates to evolve per cycle (default: 5)",
    )
    evolve_auto.add_argument(
        "--iterations",
        type=int,
        default=5,
        help="GEPA iterations per target (default: 5)",
    )
    evolve_auto.add_argument(
        "--source",
        default=None,
        help="Filter by platform source (cli, telegram, tui, etc.)",
    )
    evolve_auto.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_auto.add_argument(
        "--dry-run",
        action="store_true",
        help="Analyze and report only — don't run evolution",
    )
    evolve_auto.set_defaults(func=cmd_evolve)

    # ── tool ───────────────────────────────────────────────────────────────
    evolve_tool = evolve_subparsers.add_parser(
        "tool",
        help="Evolve a tool's description for better tool selection",
        description=(
            "Run GEPA optimization on a tool's description text. Improves "
            "tool selection accuracy by evolving the description the model "
            "sees when deciding which tool to call."
        ),
    )
    evolve_tool.add_argument("tool", help="Name of the tool to evolve")
    evolve_tool.add_argument(
        "--iterations",
        type=int,
        default=5,
        help="Number of GEPA iterations (default: 5)",
    )
    evolve_tool.add_argument(
        "--eval-source",
        default="synthetic",
        choices=["synthetic", "golden", "sessiondb"],
        help="Source for the evaluation dataset (default: synthetic)",
    )
    evolve_tool.add_argument(
        "--dataset-path",
        default=None,
        help="Path to an existing eval dataset (JSONL)",
    )
    evolve_tool.add_argument(
        "--optimizer-model",
        default="openai/gpt-4.1",
        help="Model for GEPA reflections (default: openai/gpt-4.1)",
    )
    evolve_tool.add_argument(
        "--eval-model",
        default="openai/gpt-4.1-mini",
        help="Model for evaluations (default: openai/gpt-4.1-mini)",
    )
    evolve_tool.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_tool.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate setup without running optimization",
    )
    evolve_tool.set_defaults(func=cmd_evolve)

    # ── prompt ─────────────────────────────────────────────────────────────
    evolve_prompt = evolve_subparsers.add_parser(
        "prompt",
        help="Evolve a system prompt section",
        description=(
            "Run GEPA optimization on a system prompt section (e.g., "
            "DEFAULT_AGENT_IDENTITY, MEMORY_GUIDANCE). Improves agent "
            "behavior by evolving the guidance text. Prompt caching "
            "constraints apply — max 20% growth."
        ),
    )
    evolve_prompt.add_argument(
        "section",
        nargs="?",
        help="Name of the prompt section to evolve (e.g., DEFAULT_AGENT_IDENTITY)",
    )
    evolve_prompt.add_argument(
        "--list-sections",
        action="store_true",
        help="List all evolvable prompt sections and exit",
    )
    evolve_prompt.add_argument(
        "--iterations",
        type=int,
        default=5,
        help="Number of GEPA iterations (default: 5)",
    )
    evolve_prompt.add_argument(
        "--eval-source",
        default="synthetic",
        choices=["synthetic", "golden", "sessiondb"],
        help="Source for the evaluation dataset (default: synthetic)",
    )
    evolve_prompt.add_argument(
        "--dataset-path",
        default=None,
        help="Path to an existing eval dataset (JSONL)",
    )
    evolve_prompt.add_argument(
        "--optimizer-model",
        default="openai/gpt-4.1",
        help="Model for GEPA reflections (default: openai/gpt-4.1)",
    )
    evolve_prompt.add_argument(
        "--eval-model",
        default="openai/gpt-4.1-mini",
        help="Model for evaluations (default: openai/gpt-4.1-mini)",
    )
    evolve_prompt.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_prompt.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate setup without running optimization",
    )
    evolve_prompt.set_defaults(func=cmd_evolve)

    # ── validate ──────────────────────────────────────────────────────────
    evolve_validate = evolve_subparsers.add_parser(
        "validate",
        help="Validate the Zeus repo: imports, tools, skills, prompt sections",
        description=(
            "Run validation checks on the Zeus agent repo. Verifies core "
            "imports work, all tools register correctly, skills are well-formed, "
            "and prompt sections are accessible. Use after self-modification "
            "to confirm nothing is broken."
        ),
    )
    evolve_validate.add_argument(
        "--zeus-repo",
        "--hermes-repo",
        dest="zeus_repo",
        default=None,
        help="Path to the Zeus agent repo (default: auto-discovered)",
    )
    evolve_validate.set_defaults(func=cmd_evolve)

    # Default action when none given
    evolve_parser.set_defaults(func=cmd_evolve)
