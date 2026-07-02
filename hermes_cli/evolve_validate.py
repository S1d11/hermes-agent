"""Validation helpers for self-modification.

After Zeus adds/removes a skill, tool, or prompt section, these helpers
validate that the change is syntactically correct and doesn't break
imports. Called by `hermes evolve validate`.
"""

from __future__ import annotations

import ast
import importlib
import sys
from pathlib import Path
from typing import List, Optional, Tuple


def validate_skill(zeus_repo: Path, skill_path: Path) -> Tuple[bool, List[str]]:
    """Validate a skill file is well-formed.

    Returns (passed, messages).
    """
    messages = []
    if not skill_path.exists():
        return False, [f"Skill file not found: {skill_path}"]

    content = skill_path.read_text()

    # Check YAML frontmatter
    if not content.strip().startswith("---"):
        messages.append("Missing YAML frontmatter (must start with ---)")
        return False, messages

    parts = content.split("---", 2)
    if len(parts) < 3:
        messages.append("Malformed frontmatter — expected opening and closing ---")
        return False, messages

    frontmatter = parts[1].strip()
    body = parts[2].strip()

    # Parse YAML
    try:
        import yaml
        fm = yaml.safe_load(frontmatter)
        if not isinstance(fm, dict):
            messages.append("Frontmatter is not a valid YAML mapping")
            return False, messages
        if "name" not in fm:
            messages.append("Missing 'name' field in frontmatter")
        if "description" not in fm:
            messages.append("Missing 'description' field in frontmatter")
    except ImportError:
        # No PyYAML — do a basic check
        if "name:" not in frontmatter:
            messages.append("Missing 'name:' field in frontmatter")
        if "description:" not in frontmatter:
            messages.append("Missing 'description:' field in frontmatter")
    except Exception as e:
        messages.append(f"YAML parse error: {e}")
        return False, messages

    # Check body is non-empty
    if not body:
        messages.append("Skill body is empty")

    if not messages:
        messages.append(f"Skill OK: {skill_path.name} ({len(content)} chars)")
        return True, messages
    return False, messages


def validate_tool(zeus_repo: Path, tool_name: str) -> Tuple[bool, List[str]]:
    """Validate a tool can be imported and registered.

    Returns (passed, messages).
    """
    messages = []
    zeus_str = str(zeus_repo)
    if zeus_str not in sys.path:
        sys.path.insert(0, zeus_str)

    # Try to import the tool module
    # Tool files are named <name>_tool.py
    possible_modules = [
        f"tools.{tool_name}_tool",
        f"tools.{tool_name.replace('-', '_')}_tool",
    ]

    imported = False
    for mod_name in possible_modules:
        try:
            importlib.import_module(mod_name)
            imported = True
            messages.append(f"Imported: {mod_name}")
            break
        except ImportError:
            continue
        except Exception as e:
            messages.append(f"Import error in {mod_name}: {e}")
            return False, messages

    if not imported:
        messages.append(f"Could not find tool module for '{tool_name}'")
        return False, messages

    # Check it registered
    try:
        from tools.registry import registry
        schema = registry.get_schema(tool_name)
        if schema is None:
            messages.append(f"Tool '{tool_name}' imported but not registered")
            return False, messages
        messages.append(f"Registered: {tool_name} (description: {schema.get('description', '')[:60]}...)")
    except Exception as e:
        messages.append(f"Registry check failed: {e}")
        return False, messages

    return True, messages


def validate_prompt_section(zeus_repo: Path, section_name: str) -> Tuple[bool, List[str]]:
    """Validate a prompt section exists and is importable.

    Returns (passed, messages).
    """
    messages = []
    zeus_str = str(zeus_repo)
    if zeus_str not in sys.path:
        sys.path.insert(0, zeus_str)

    try:
        import importlib
        pb = importlib.import_module("agent.prompt_builder")
        importlib.reload(pb)
        value = getattr(pb, section_name, None)
        if value is None:
            messages.append(f"Section '{section_name}' not found in agent.prompt_builder")
            return False, messages
        if not isinstance(value, str):
            messages.append(f"Section '{section_name}' is not a string (got {type(value).__name__})")
            return False, messages
        if not value.strip():
            messages.append(f"Section '{section_name}' is empty")
            return False, messages
        messages.append(f"Section OK: {section_name} ({len(value)} chars)")
        return True, messages
    except Exception as e:
        messages.append(f"Import error: {e}")
        return False, messages


def validate_imports(zeus_repo: Path) -> Tuple[bool, List[str]]:
    """Quick smoke test: can we import the core modules?

    Returns (passed, messages).
    """
    messages = []
    zeus_str = str(zeus_repo)
    if zeus_str not in sys.path:
        sys.path.insert(0, zeus_str)

    core_modules = [
        "tools.registry",
        "toolsets",
        "agent.prompt_builder",
        "hermes_cli.main",
    ]

    all_ok = True
    for mod in core_modules:
        try:
            importlib.import_module(mod)
            messages.append(f"  OK: {mod}")
        except Exception as e:
            messages.append(f"  FAIL: {mod} — {e}")
            all_ok = False

    return all_ok, messages


def validate_all(zeus_repo: Optional[str] = None) -> None:
    """Run all validation checks. Called by `hermes evolve validate`."""
    from evolution.core.config import resolve_zeus_agent_path

    repo = resolve_zeus_agent_path(zeus_repo)
    print(f"Validating Zeus agent repo: {repo}\n")

    # 1. Core imports
    print("Core imports:")
    ok, msgs = validate_imports(repo)
    for m in msgs:
        print(m)
    if not ok:
        print("\nCore import validation FAILED — fix before continuing.")
        return
    print()

    # 2. All registered tools
    print("Registered tools:")
    try:
        from tools.registry import registry
        from tools.registry import discover_builtin_tools
        discover_builtin_tools()
        tools = registry.get_all_tool_names()
        print(f"  {len(tools)} tools registered")
        for t in tools[:10]:
            print(f"    - {t}")
        if len(tools) > 10:
            print(f"    ... and {len(tools) - 10} more")
    except Exception as e:
        print(f"  FAIL: {e}")
    print()

    # 3. All skills
    print("Skills:")
    skills_dir = repo / "skills"
    if skills_dir.exists():
        skills = list(skills_dir.rglob("SKILL.md"))
        print(f"  {len(skills)} skills found")
        for s in skills[:10]:
            rel = s.relative_to(repo)
            print(f"    - {rel}")
        if len(skills) > 10:
            print(f"    ... and {len(skills) - 10} more")
    else:
        print("  No skills/ directory")
    print()

    # 4. Prompt sections
    print("Prompt sections:")
    evolvable = [
        "DEFAULT_AGENT_IDENTITY",
        "HERMES_AGENT_HELP_GUIDANCE",
        "MEMORY_GUIDANCE",
        "SESSION_SEARCH_GUIDANCE",
        "SKILLS_GUIDANCE",
        "TASK_COMPLETION_GUIDANCE",
    ]
    for section in evolvable:
        ok, msgs = validate_prompt_section(repo, section)
        status = "OK" if ok else "FAIL"
        print(f"  [{status}] {section}: {msgs[0]}")

    print("\nValidation complete.")
