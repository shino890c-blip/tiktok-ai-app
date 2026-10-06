# AI Note Company — notes for Claude Code

Standalone Node 22 + TypeScript project (not part of the parent Next.js app). See README.md.

- Check: `npm run build && npm test && npm run e2e` (all must pass before committing).
- note.com DOM knowledge lives ONLY in `src/note/selectors.ts`. Never hardcode selectors elsewhere, never click by coordinates, never call note's private APIs.
- Never mark an article PUBLISHED unless the public URL was opened and verified. Never auto-retry after the publish click (`PublishUnverifiedError`).
- `NOTE_AUTO_PUBLISH` defaults to false; publishing requires an APPROVED approval.
- Never write passwords/cookies/API keys to code, logs or git. `.auth/` and `.env` are git-ignored.
- Missing metrics are `null`, never estimated. Knowledge trends need ≥5 samples per group.
- Prompts: `src/prompts/index.ts`. Mock LLM (offline): `src/llm/mock.ts`.
