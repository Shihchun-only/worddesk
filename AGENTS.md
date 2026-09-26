# AI contributor instructions

Read `docs/REQUIREMENTS.zh-CN.md` and `docs/DEVELOPMENT.md` before changing behavior. The requirements document is the current product contract; earlier release notes can describe obsolete behavior.

- Preserve all personal library data. Tests must use `WORDDESK_TEST_DATA` and temporary directories.
- Do not commit profiles, library JSON, PDFs, recordings, screenshots, secrets, node_modules or dist.
- Keep MW and Cambridge selections independent and saved together; keep dictionary text and user notes untouched by language switching.
- Product requests asking for suggestions require a proposal and user confirmation before implementation. Explicitly approved changes may proceed.
- Run relevant tests and report actual results. Use `pnpm test` for unit coverage and current UI scripts from DEVELOPMENT.md.
- Do not assume old UI/live-probe scripts are current acceptance criteria.
- Keep native website isolation and the narrow preload bridge. Do not add credential capture, cloud sync or external uploads without authorization.
- For releases, bump package.json, package the complete portable folder, verify EXE startup, and update documentation.
