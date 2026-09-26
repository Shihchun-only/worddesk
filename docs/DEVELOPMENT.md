# Development and AI handoff

Baseline: WordDesk 0.18.0 (2026-09-22). Start with `docs/REQUIREMENTS.zh-CN.md`; it supersedes old release notes and earlier conversation requirements.

## Run and build (Windows x64)

Use Node.js 24 and pnpm. The lockfile is checked in. No server, API secret or database service is required.

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm package
```

The explicit Electron installation step ensures the runtime exists even when pnpm blocks dependency build scripts. Packaging requires `node_modules/electron/dist`. The portable app is `dist/WordDesk-0.18.0-win32-x64/WordDesk.exe`; keep the whole folder. `scripts/package.cjs` derives the directory name from package.json. Do not commit node_modules or dist. The Windows workflow builds a downloadable portable ZIP artifact.

## Architecture

- `src/main.cjs`: Electron main process, dictionary WebContentsViews, IPC allowlist, persisted settings, audio downloads, import/export.
- `src/preload.cjs`: narrow context-isolated bridge. Do not expose Node to external dictionary pages.
- `src/extract.cjs`: executes in dictionary pages; returns structured data, not website HTML. Keep complete dictionary sense boundaries and pronunciation qualifiers.
- `src/store.cjs`: local JSON library, shared group membership, merging, personal edits, selected senses, trash retention.
- `src/export.cjs`: ExcelJS export, selected sources, original numbering, wrapping and continuation rows.
- `src/ui/app.js`: navigation and collection progress; `library.js` / `selection.js` / `manage.js`: shared full/review views and source-spanning drafts.
- `src/ui/work.js`: work tabs, native query view, PDF popup and return origin. `pdf.mjs`: PDF.js rendering/selection/highlights. `src/pdf-history.cjs`: file identity and reading metadata.
- `src/ui/exam-model.js`: pure grading and morphology helpers; `exam.js`: current-session exam UI.
- `src/ui/preferences.js`: theme, language, font, behavior preferences and cleanup.
- `src/ui/i18n-catalog.js` / `i18n.js`: reviewed local translations and reversible DOM text/attribute localization. Protect dictionary/user data and never translate it as UI.

## Data boundaries

Normal user data lives in Electron userData or a user-selected root. Never inspect or change a real user's library for testing. Set `WORDDESK_TEST_DATA` to a temporary directory. This repository intentionally excludes libraries, audio, PDFs, profile cookies, settings, screenshots and historical executables.

Words share one record across groups. `entries.mw` and `entries.cambridge` retain independent senses; each sense has saved selection/language/example flags and optional personal edits. Selection drafts stay in renderer memory until saved. PDF backups carry metadata only, not original PDF files. Main-process configuration holds view preferences/language.

## Tests

```powershell
pnpm test
node scripts/v18-ui-test.cjs
node scripts/v17-ui-test.cjs
node scripts/v16-ui-test.cjs
node scripts/v15-ui-test.cjs
pnpm package
$env:WORDDESK_RELEASE=(Resolve-Path 'dist/WordDesk-0.18.0-win32-x64/resources/app').Path
node scripts/v18-ui-test.cjs
node scripts/v3-package-launch.cjs
```

Unit tests use Node's test runner. UI tests launch isolated Electron profiles via Playwright and require an unlocked desktop. They must never automate the user's installed instance. Older scripts are retained as development history; some live probes require dictionary websites or locally generated fixtures, and some old UI assertions reflect superseded behaviors. Prefer the current suites above. A suffix such as v3 in `v3-package-launch.cjs` is historical; it reads the current package version.

`fixtures/` contains only explicitly selected regression inputs in Git. Minimal HTML fixtures are sanitized, offline test fragments (no scripts, cookies or account telemetry). Test output remains ignored. Live website behavior can differ; extraction should also be checked on actual pages when changing the parser.

## Known implementation limits

- Morphological answer masking is heuristic, not an exhaustive English lexicon; custom mask words supplement it.
- Website markup and anti-bot verification change. Do not report partial collection as complete or bypass site verification.
- Locale handling currently uses a phrase catalog, dynamic label patterns and protected DOM regions. New UI strings must be catalogued; new dictionary/user content must be protected. Test English → Chinese round trips with unsaved drafts and unusual group names.
- Excel row heights are estimated. Extremely long senses continue across rows. Check actual Excel/PDF output when changing layout; structural XLSX tests alone do not prove printer fidelity.
- Historical UI tests may contain immediate count assertions sensitive to async rendering. Wait for visible loaded state rather than arbitrary sleeps.
- Windows x64 is the tested target; other platforms, installation/signing and automatic upgrades are not implemented.

## Safe change workflow

1. Read latest requirements and relevant modules. Explain product changes before implementation when the user asks for a proposal.
2. Make the smallest coherent change. Preserve original dictionary text and personal edits. Never clear user data to fix a test.
3. Run relevant unit/UI checks, then package and verify the standalone executable for a release.
4. Update requirements if behavior changed, package version, README and test results. State any unverified limitations candidly.
5. Review the Git diff and ignored files before push. Do not upload tokens, personal data or full browsing snapshots. Do not grant a license without the owner's choice.

## Repository import verification (2026-09-26)

- Unit suite: 42 passed, 0 failed after fixture sanitization.
- Current v18 UI rerun: timed out waiting for the first vocabulary row; this run did not validate the UI. Investigate loading/test setup before treating historical UI results as current.
- GitHub Windows build has not yet been verified.

