# Development and AI handoff

Baseline: WordDesk 0.20.0 (2026-10-03). Start with `docs/REQUIREMENTS.zh-CN.md`; it supersedes old release notes and earlier conversation requirements.

## Run and build (Windows x64)

Use Node.js 24 and pnpm. The lockfile is checked in. No server, API secret or database service is required.

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm package
```

The explicit Electron installation step ensures the runtime exists even when pnpm blocks dependency build scripts. Packaging requires `node_modules/electron/dist`. The portable app is `dist/WordDesk-0.20.0-win32-x64/WordDesk.exe`; keep the whole folder. `scripts/package.cjs` derives the directory name from package.json. Do not commit node_modules or dist. The Windows workflow builds a downloadable portable ZIP artifact.

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

Words share one record across groups. `entries.mw` and `entries.cambridge` retain independent senses; each sense has saved selection/language/example flags and optional personal edits. Selection drafts and failed word edits stay in renderer memory until saved; a failed save blocks leaving/closing. PDF positions live in reading-history.json, with merged writes and explicit flushes. ZIP backups embed this metadata into library.json for backward compatibility; original PDFs are excluded. Main-process configuration holds view preferences/language.

## Tests

Run `pnpm test` for unit checks; `pnpm test:ui` for the current source UI suite. Run `pnpm test:recovery` for startup recovery with deliberately damaged temporary libraries. Then `pnpm package` and `pnpm test:release` to verify the packaged EXE with the same UI suite and an empty-profile startup test. Release verification also repeats the damaged-library recovery tests.

The current harness launches its own Electron process with WORDDESK_TEST_DATA in an OS temporary directory. It uses the shipped Node/Chromium debugging protocols, awaits application ready and visible state, disables background throttling in the test instance only, and kills only its own process. A desktop sandbox that prevents Chromium renderer startup requires an approved local test run; do not disable Electron isolation or use the user's running instance. Screenshots and generated PDFs/ZIP files stay in the temporary test directory.

Offline dictionary fixtures test capture and collection without contacting websites. Live behavior can still differ. The parser was not changed in 0.19.0. Do not rewrite fixtures during acceptance. Old v3–v18 tests are historical and can contain obsolete selectors or timing assumptions.

The current suite covers two-source drafts/preview, selected-language preservation, entry search, small-screen layout, failed disk save/retry, PDF multiple hits/return/persistence, exam state, noninterrupting collection, bounded audio skip/retry, comparison, complete backups, snapshots and restart. Unit checks include malformed/failed writes, recovery retention, metadata migration and PDF search mapping.

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


## 0.19.0 modules

- safe-json.cjs: atomic writes, five valid snapshots, recovery preserving unreadable originals.
- audio-jobs.cjs: bounded background downloads tied to the originating Store and extraction timestamp.
- backup.cjs: shared archive validation for regular and startup recovery.
- ui/reliability.js: persistent failed-save notice, retry, audio status and snapshot recovery.
- ui/library-tools.js: search, folding, selected-definition navigation, preview and comparison.
- ui/pdf-search.mjs: text-run index with character coordinates for exact occurrence highlights.

The 2026-09-26 v18 timeout below is retained as history and is superseded by TESTING.md current results.

## 0.20.0 About and release notes

`src/release-info.cjs` holds release date and reviewed notes; version comes from Electron app.getVersion(). `src/ui/about.js` opens a settings-only dialog. Existing profiles lacking lastSeenVersion get the upgrade notice; fresh profiles initialize it to the current version. Closing persists acknowledgment before dismissal, with retry on failure. `pnpm test:about` tests isolated old/fresh profiles, upgrade, repeat startup, localization and clipboard. The packaged release suite also runs it.
