# Regression fixtures

These files are static dictionary regression inputs used by automated tests. They are not a personal vocabulary library. Dictionary text remains attributed to Merriam-Webster / Cambridge (source URLs in JSON); no ownership or third-party license is claimed.

Only selected parsed JSON and sanitized offline HTML fragments are tracked. HTML excludes scripts, forms, styles, tracking attributes, hidden content, external resources and unrelated page sections. Generated screenshots, PDF/Excel outputs, live-page captures and collection exports remain ignored.

Current unit/UI suites primarily use `go-mw-v3.json`, `go-cambridge-v3.json` and `plum-mw.html`. Older parser probes may need additional snapshots fetched locally; do not commit authenticated webpage captures.
