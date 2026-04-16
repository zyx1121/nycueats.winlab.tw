#!/usr/bin/env python3
import json
import sys


def extract_command(payload: dict) -> str:
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        cmd = tool_input.get("command")
        if isinstance(cmd, str):
            return cmd

    tool_args = payload.get("toolArgs")
    if isinstance(tool_args, str):
        try:
            parsed = json.loads(tool_args)
            cmd = parsed.get("command")
            if isinstance(cmd, str):
                return cmd
        except json.JSONDecodeError:
            pass
    elif isinstance(tool_args, dict):
        cmd = tool_args.get("command")
        if isinstance(cmd, str):
            return cmd

    return ""


def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        return 0

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return 0

    command = extract_command(payload).strip()
    if not command.startswith("git commit"):
        return 0

    response = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                "A git commit command just completed. Spawn a subagent now. "
                "The subagent must run bun run lint, fix all lint errors in this repository, "
                "rerun bun run lint until it passes, and then report changed files. "
                "Do not create commits automatically."
            )
        },
        "systemMessage": "Post-commit lint subagent requested."
    }
    print(json.dumps(response))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
