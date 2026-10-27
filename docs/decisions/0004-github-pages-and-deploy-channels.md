# 0004: Public GitHub Pages with per-channel storage

- Status: accepted (2026-10-27)
- Context: free hosting from GitHub was requested; PR previews were wanted; previews share the production origin.
- Decision: deploy `main` to the `gh-pages` branch root and PR previews to `pr-preview/pr-N/` on the same branch. Compile `DEPLOY_CHANNEL` into the app and namespace every storage key and database with it.
- Consequences: the app is public but designs stay in each browser. A preview build can never migrate or corrupt production data. Password protection would need another host (see README).
