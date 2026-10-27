#!/bin/bash
# PostToolUse(Edit|Write): auto-fix lint on the edited TS file, silently.
# Hook input arrives as JSON on stdin; the path is tool_input.file_path.
FILE=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
if [[ "$FILE" =~ \.(ts|tsx)$ ]] && [ -f eslint.config.js ]; then
  npx eslint "$FILE" --fix --quiet 2>/dev/null
fi
exit 0
