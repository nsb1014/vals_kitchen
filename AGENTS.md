# Working notes for agents

Facts this repository cannot tell you. Everything derivable from the code, docs, or
git history belongs there, not here. Prune stale entries when you add new ones.

Canonical docs: `docs/PRD.md` owns all gameplay numbers. `docs/Tech-Stack.md` owns
stack and budgets. `docs/Progress.md` is the status tracker. Do not restate their
contents here.

## Environment

- As of 2026-07-24: `npm` is not on `PATH` in the agent sandbox. Invoke tools directly
  via `node node_modules/.bin/<tool>`, or find the npm CLI under `.npm-local/`. Scripts
  in `package.json` are still the source of truth for what to run.
- As of 2026-07-24: the sandbox network is allowlist-limited. `kenney.nl` returns HTTP
  403 for direct downloads. Large binary fetches (asset packs, Playwright's Chromium)
  need elevated permissions, and may still fail. When an asset cannot be fetched, hand
  the user an exact download list rather than substituting or fabricating provenance.
- Third-party assets must be CC0 only. This is a firm user requirement. Ship nothing whose
  license you have not verified, and keep `public/assets/CREDITS.json` the generated source
  of truth for the attribution screen so credits cannot drift from what ships.
- As of 2026-07-25, the user ruled that public domain is acceptable, so assets generated for
  this project may be CC0-dedicated by the project itself. Record them honestly as generated,
  never attributed to a third-party author or pack. Fabricated provenance is worse than none.

## Traps

- Subagent transcript files are buffered and lag far behind reality. Transcript mtime is
  not a progress signal. Use repository file mtimes instead — and note that a long test
  run writes no files at all, so silence does not mean stalled. A stall was misdiagnosed
  this way once and an agent was interrupted needlessly.
- `docs/RESEARCH.md` is read-only prior research and is superseded in places. Its §4
  recipe-source recommendation (TheMealDB) was rejected on licensing and cost; its §5
  asset packs (Tiny Town, RPG Base, Pixel Platformer Food Expansion, Pixel UI Pack) are
  not obtainable from this environment. Check `docs/PRD.md` §13 for ratified decisions
  before acting on anything RESEARCH recommends.
- The deep simulation suite (`npm run test:sim`) takes minutes by design and is opt-in.
  Never add simulation tests to the fast suite; CI runs the fast suite only.

## Working agreements

- Do not weaken a test to get green. Two distinct forms of this have already occurred and
  both must be refused: relaxing a threshold (`floor - 0.1`), and moving a test to a more
  favorable input state so the original assertion passes (swapping a 20-ingredient case
  for the 13-ingredient tier boundary). Report an honest failure instead.
- When agents run in parallel, give each an explicit list of files it owns and files it
  must not touch. Watch for files owned by *neither* agent: lint errors in
  `scripts/check-bundle-size.ts` survived a full round because the agent that created it
  had finished and the other correctly refused to edit outside its fence.
- Gameplay quantities in the docs are tunable defaults chosen on evidence, not
  requirements. Structural rules are different: 3-6 ingredients per dish, the 0-10 review
  scale, and the 0-6 rating band with start 3 / loss 0 / prestige 6 are assumed by the
  reducer, the recipe corpus, and the scoring search. Changing those is a code change with
  test consequences, not a dial.
