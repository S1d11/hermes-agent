---
name: self-modify
description: "Add or remove Zeus features: skills, tools, prompt sections, CLI commands."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [self-modification, features, development, meta]
    related_skills: [self-improvement]
---

# Self-Modify: Add and Remove Zeus Features

## Overview

This skill lets you directly modify Zeus itself — add new skills, remove
old ones, create new tools, change prompt sections, or add CLI commands.
You already have the tools for this (terminal, write_file, patch, read_file);
this skill provides the structured workflow and knowledge of where
everything lives so you do it correctly and safely.

**Key principle**: Every modification is committed to a git branch before
it takes effect. Nothing is applied to the running agent without the
user being able to review and roll back.

## Repository Layout

The Zeus agent repo is at the path returned by `hermes evolve status`
(typically `~/.hermes/hermes-agent` or a sibling directory). Key locations:

```
hermes-agent/
├── skills/<category>/<skill-name>/SKILL.md     # Skills
├── tools/<name>_tool.py                        # Tool implementations
├── tools/registry.py                           # Tool registry (auto-discovery)
├── toolsets.py                                 # Toolset definitions
├── agent/prompt_builder.py                     # System prompt sections
├── hermes_cli/subcommands/<name>.py            # CLI subcommand parsers
├── hermes_cli/<name>_cmd.py                    # CLI command handlers
├── hermes_cli/main.py                          # CLI entry point + wiring
```

## Workflow: Adding a Skill

When the user says "add a skill for X" or "create a skill that does Y":

1. **Pick a category.** Browse `skills/` to find the right category
   (productivity, research, software-development, creative, etc.).
   If none fits, create a new category directory.

2. **Create the skill directory:**
   ```
   skills/<category>/<skill-name>/
   ```

3. **Write SKILL.md** with this structure:
   ```markdown
   ---
   name: <skill-name>
   description: "<one-line description>"
   version: 1.0.0
   platforms: [linux, macos, windows]
   metadata:
     hermes:
       tags: [<relevant-tags>]
   ---

   # <Skill Title>

   ## Overview
   <What this skill does>

   ## Prerequisites
   <What's needed: tools, commands, APIs>

   ## Workflow
   <Step-by-step procedure>

   ## Examples
   <Concrete usage examples>
   ```

4. **Add reference files** if the skill needs detailed documentation:
   ```
   skills/<category>/<skill-name>/references/<topic>.md
   ```

5. **Validate:** Run `python -c "import ast; ast.parse(open('skills/<category>/<skill-name>/SKILL.md').read())"` — wait, that's markdown. Instead verify the YAML frontmatter parses:
   ```bash
   python -c "import yaml; yaml.safe_load(open('skills/<category>/<skill-name>/SKILL.md').read().split('---')[1])"
   ```

6. **Test:** Tell the user to restart Zeus or run `hermes skills list` to
   verify the skill appears.

7. **Commit:**
   ```bash
   git checkout -b feature/skill-<name>
   git add skills/<category>/<skill-name>/
   git commit -m "Add skill: <skill-name>"
   ```

## Workflow: Removing a Skill

When the user says "remove the X skill" or "delete the Y skill":

1. **Find it:** `find skills/ -name "SKILL.md" | xargs grep -l "name: <skill-name>"`

2. **Check for dependencies:** Search for references to the skill name
   in other skills, config, or code:
   ```bash
   grep -r "<skill-name>" skills/ --include="*.md"
   grep -r "<skill-name>" hermes_cli/ --include="*.py"
   ```

3. **Remove the directory:**
   ```bash
   rm -rf skills/<category>/<skill-name>/
   ```

4. **Commit:**
   ```bash
   git checkout -b cleanup/remove-skill-<name>
   git add -A
   git commit -m "Remove skill: <skill-name>"
   ```

5. **Tell the user** it's removed and they should restart Zeus.

## Workflow: Adding a Tool

When the user says "add a tool that does X" or "create a tool for Y":

**WARNING**: New core tools ship on every API call (they're in the model's
tool schema). Only add a core tool if the capability is fundamental and
broadly useful. Otherwise, prefer a skill + CLI command, or an MCP server.
See AGENTS.md "The Footprint Ladder."

1. **Create the tool file:** `tools/<name>_tool.py`

2. **Write the tool** following this pattern:
   ```python
   """<Tool name> tool — <description>."""
   import logging
   from tools.registry import registry

   logger = logging.getLogger(__name__)

   <TOOL_NAME>_SCHEMA = {
       "name": "<tool_name>",
       "description": "<Clear description of what the tool does>",
       "parameters": {
           "type": "object",
           "properties": {
               "<param>": {
                   "type": "string",
                   "description": "<What this parameter does>",
               },
           },
           "required": ["<param>"],
       },
   }

   def _handle_<tool_name>(args: dict, **kwargs) -> str:
       """Handle the <tool_name> tool call."""
       try:
           # Your tool logic here
           result = do_something(args["<param>"])
           return result
       except Exception as e:
           return f"Error: {e}"

   # Optional: availability check
   def _check_<tool_name>_available() -> bool:
       """Return True if this tool's requirements are met."""
       return True

   registry.register(
       name="<tool_name>",
       toolset="<toolset>",  # e.g. "file", "web", or a new one
       schema=<TOOL_NAME>_SCHEMA,
       handler=_handle_<tool_name>,
       check_fn=_check_<tool_name>_available,
       emoji="🔧",
   )
   ```

3. **Add to the toolset** if it should be in the default toolset:
   Edit `toolsets.py` and add the tool name to `_HERMES_CORE_TOOLS` (only
   if it should be available everywhere) or to a specific toolset's
   `"tools"` list.

4. **Validate:**
   ```bash
   python -c "from tools.<name>_tool import <TOOL_NAME>_SCHEMA; print('OK')"
   python -c "from tools.registry import registry; registry.get_schema('<tool_name>')"
   ```

5. **Commit:**
   ```bash
   git checkout -b feature/tool-<name>
   git add tools/<name>_tool.py toolsets.py
   git commit -m "Add tool: <tool_name>"
   ```

## Workflow: Removing a Tool

1. **Find the tool file:** `grep -r "registry.register.*name=\"<tool_name>\"" tools/`

2. **Remove from toolsets:** Edit `toolsets.py` and remove the tool name
   from `_HERMES_CORE_TOOLS` and any toolset definitions.

3. **Delete the tool file:** `rm tools/<name>_tool.py`

4. **Check for references:**
   ```bash
   grep -r "<tool_name>" --include="*.py" .
   ```

5. **Validate:** `python -c "import tools; print('OK')"`

6. **Commit:**
   ```bash
   git checkout -b cleanup/remove-tool-<name>
   git add -A
   git commit -m "Remove tool: <tool_name>"
   ```

## Workflow: Modifying a Prompt Section

When the user says "change the memory guidance" or "update the agent identity":

1. **Find the section:** Look in `agent/prompt_builder.py` for the
   constant (e.g., `MEMORY_GUIDANCE`, `DEFAULT_AGENT_IDENTITY`).

2. **Read the current value:**
   ```bash
   python -c "from agent.prompt_builder import MEMORY_GUIDANCE; print(MEMORY_GUIDANCE)"
   ```

3. **Edit the file** using the patch tool or write_file. Keep the change
   within 20% of the original size (prompt caching constraint).

4. **Validate:**
   ```bash
   python -c "from agent.prompt_builder import MEMORY_GUIDANCE; print(len(MEMORY_GUIDANCE))"
   python -c "from agent.system_prompt import build_system_prompt; print('OK')"
   ```

5. **Commit:**
   ```bash
   git checkout -b feature/prompt-<section>
   git add agent/prompt_builder.py
   git commit -m "Update prompt section: <section>"
   ```

## Workflow: Adding a CLI Command

When the user says "add a hermes command for X":

1. **Create the subcommand parser:** `hermes_cli/subcommands/<name>.py`
   ```python
   """``hermes <name>`` subcommand parser."""
   from __future__ import annotations
   from typing import Callable

   def build_<name>_parser(subparsers, *, cmd_<name>: Callable) -> None:
       parser = subparsers.add_parser("<name>", help="<description>")
       parser.add_argument("--flag", default=None, help="<flag desc>")
       parser.set_defaults(func=cmd_<name>)
   ```

2. **Create the handler:** `hermes_cli/<name>_cmd.py`
   ```python
   """Handler for ``hermes <name>``."""
   def <name>_command(args) -> None:
       # Your command logic
       print("Done")
   ```

3. **Wire into main.py:**
   - Add import: `from hermes_cli.subcommands.<name> import build_<name>_parser`
   - Add handler: `def cmd_<name>(args): from hermes_cli.<name>_cmd import <name>_command; <name>_command(args)`
   - Register parser: `build_<name>_parser(subparsers, cmd_<name>=cmd_<name>)`
   - Add to `_BUILTIN_SUBCOMMANDS` set

4. **Validate:**
   ```bash
   python -m hermes_cli.main <name> --help
   ```

5. **Commit:**
   ```bash
   git checkout -b feature/cli-<name>
   git add hermes_cli/subcommands/<name>.py hermes_cli/<name>_cmd.py hermes_cli/main.py
   git commit -m "Add CLI command: <name>"
   ```

## Safety Rules

1. **Always create a git branch first** — never commit directly to main
2. **Always validate after changes** — import tests, syntax checks
3. **Never remove error handling** from existing tools
4. **Never change function signatures** of registered tools
5. **Never modify `registry.register()` calls** for existing tools
6. **Keep prompt section changes within 20% growth** — prompt caching
7. **Tell the user to restart Zeus** after changes take effect
8. **If something breaks:** `git checkout main` to revert, or
   `git diff main feature/<branch>` to review

## Quick Reference

| Action | Location | Validate |
|--------|----------|----------|
| Add skill | `skills/<cat>/<name>/SKILL.md` | `hermes skills list` |
| Remove skill | `rm -rf skills/<cat>/<name>/` | `hermes skills list` |
| Add tool | `tools/<name>_tool.py` + `toolsets.py` | `python -c "from tools.<name>_tool import *"` |
| Remove tool | `rm tools/<name>_tool.py` + edit `toolsets.py` | `python -c "import tools"` |
| Edit prompt | `agent/prompt_builder.py` | `python -c "from agent.prompt_builder import *"` |
| Add CLI | `hermes_cli/subcommands/<name>.py` + `main.py` | `python -m hermes_cli.main <name> --help` |
