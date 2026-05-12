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

if [[ ! "$COMMAND" =~ ^git[[:space:]]+commit([[:space:]]|$) ]]; then
  exit 0
fi

FILES=()
while IFS= read -r file; do
  FILES+=("$file")
done < <(
  git diff --cached --name-only --diff-filter=ACMR -- \
    '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.cjs' '*.mts' '*.cts'
)

if (( ${#FILES[@]} == 0 )); then
  exit 0
fi

PARTIAL=()
for file in "${FILES[@]}"; do
  if ! git diff --quiet -- "$file"; then
    PARTIAL+=("$file")
  fi
done

if (( ${#PARTIAL[@]} > 0 )); then
  printf 'Cannot auto-fix partially staged files without staging unstaged changes:\n' >&2
  printf '  %s\n' "${PARTIAL[@]}" >&2
  printf 'Stage or stash the remaining changes, then commit again.\n' >&2
  exit 1
fi

bun run lint -- --fix "${FILES[@]}"
bun run lint -- "${FILES[@]}"
git add -- "${FILES[@]}"
