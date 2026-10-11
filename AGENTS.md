# Working on this repository

These instructions apply to anyone changing this codebase, human or AI assistant.

## Read first
1. `docs/HANDOVER.md`: status, open work, where to begin.
2. `docs/IMPLEMENTATION_SPEC.md`: requirements and architecture (canonical spec). Section 19 lists the working rules.
3. `docs/DEVELOPMENT.md`: setup, code tour, conventions, recipes, gotchas.
4. `docs/DECISIONS.md`: open client decisions and the defaults currently in place.
5. `docs/DESIGN.md`: before touching UI or the PDF.

## Hard rules
- **Never edit questionnaire text, options or scoring keys by hand.** They're generated from `docs/source/QUESTIONNAIRES_SOURCE_DATA.json` by `npm run content:generate`, and a test enforces fidelity.
- **Never change the behaviour of an existing version** (questionnaire, scoring, report template, interpretation pack). Add a new version; old attempts keep theirs.
- **Never invent client content** (scoring rules, thresholds, interpretations, prices, legal text) and present it as approved. Label drafts, and record defaults in `docs/DECISIONS.md`.
- **Enforce on the server.** Payment status, price, scores, unlock and roles are decided only in `src/server`. Unlock logic lives only in `src/server/workflow/unlock.ts`.
- **Keep it host-portable.** It must keep working on Vercel (serverless), Hostinger (MySQL, Node.js apps) and Docker. Database schema changes use only types that work on both PostgreSQL and MySQL, with migrations for both engines.
- **No secrets or real personal data** in the repository, fixtures, logs or screenshots.
- Code in `src/server/**` imports `server-only` and must never be imported by client components.

## Before saying a change is done
Run what applies, and report the exact commands and results:

```bash
npm run typecheck && npm run lint && npm test
TEST_DATABASE_URL=postgresql://... npm run test:integration   # for anything touching data or workflow
npm run build                                                  # for anything touching pages, config or dependencies
BASE_URL=http://localhost:3000 npm run test:e2e                # for API or flow changes (mock payments)
node scripts/ui-walkthrough.mjs ./screenshots                  # for UI changes; look at the screenshots
```

Distinguish mocked, sandbox and live verification. Don't call an integration done when only its mock or log adapter ran.

## Keep the docs current
- Add an entry to `docs/CHANGELOG.md` for every meaningful change.
- Update `docs/DECISIONS.md` when a client decision closes or a default changes.
- Update `docs/IMPLEMENTATION_SPEC.md` when requirements, API routes, environment variables or the data model change.
- Update `.env.example` and spec section 14 when adding configuration.
