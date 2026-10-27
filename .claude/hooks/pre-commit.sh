#!/bin/bash
# PreToolUse(Bash): gate only `git commit`, and only once the project is scaffolded.
# Husky's git pre-commit hook is the real gate; this gives Claude early feedback.
CMD=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')
case "$CMD" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac
[ -f tsconfig.json ] || exit 0
npm run -s typecheck || { echo "Type errors found. Fix before committing." >&2; exit 2; }
exit 0
