# Media External Site Plugins

This module isolates external site enrichment logic from core media service flow.

- `manager.go`: plugin contract and orchestrator
- `sitepluginsfx/`: Fx DI module and grouped plugin registration
- `tmdb/`: TMDB plugin
- `imdb/`: IMDb plugin
- `douban/`: Douban plugin (remote suggest + matching)

Douban plugin notes:

1. It uses a multi-step fallback (`suggest` -> `subject_search` -> `web_search`).
2. If Douban returns anti-bot/login pages (`sec.douban.com`), matcher reports `douban access blocked`.
3. For environments requiring authenticated access, configure:
`media.doubanCookie`, `media.doubanUserAgent`, `media.doubanAcceptLanguage`, `media.doubanReferer`.

`manager.go` normalizes plugin keys, removes duplicates, and executes plugins in stable key order.

Each site plugin should:

1. Implement `siteplugins.Plugin`
2. Be idempotent (`Enrich` can run repeatedly)
3. Write through `content_attributes` / `metadata_sources` only
4. Avoid coupling with HTTP handlers or page-layer logic
