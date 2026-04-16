#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
if [[ -z "${INPUT// }" ]]; then
  exit 0
fi

COMMAND="$(HOOK_INPUT="$INPUT" python3 - <<'PY'
import json
import os

raw = os.environ.get("HOOK_INPUT", "").strip()
if not raw:
    print("")
    raise SystemExit(0)

try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    print("")
    raise SystemExit(0)

command = ""

tool_args = payload.get("toolArgs")
if isinstance(tool_args, str):
    try:
        parsed = json.loads(tool_args)
        command = parsed.get("command") or ""
    except json.JSONDecodeError:
        command = ""
elif isinstance(tool_args, dict):
    command = tool_args.get("command") or ""

if not command:
    tool_input = payload.get("tool_input")
    if isinstance(tool_input, dict):
        command = tool_input.get("command") or ""

print(command)
PY
)"

if [[ ! "$COMMAND" =~ ^git[[:space:]]+commit ]]; then
  exit 0
fi

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "A git commit command just completed. Spawn a subagent now. The subagent must run bun run lint, fix all lint errors, rerun bun run lint until it passes, and then combine the changes into the commit automatically."
  },
  "systemMessage": "Post-commit lint subagent requested."
}
JSON
