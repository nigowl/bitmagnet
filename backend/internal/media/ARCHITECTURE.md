# Media Module Architecture

`internal/media` is organized by responsibility, not by technical layer only.

## Directory layout

- `api/`
  - HTTP adapter (`/api/media` routes)
  - Depends on `media.Service` only
- `mediafx/`
  - Fx module wiring
  - Registers config, service, api, and site plugin module
- `siteplugins/`
  - External site plugin contract and implementations
  - One site = one plugin package
  - `sitepluginsfx/` wires plugins into Fx group `media_site_plugins`
- root `media` package files
  - `service.go`: application orchestration (list/detail/cover flows)
  - `service_lookup.go`: media lookup and lazy rebuild flow
  - `service_mapper.go`: model-to-DTO mapping
  - `service_filters.go`: query filter/sort policy
  - `sync.go`: media aggregate synchronization
  - `metadata_derive.go`: structured metadata derivation
  - `cover_*`: cover cache and sizing
  - `types.go`: API DTOs
  - `config.go`: module configuration

## Boundaries

1. API layer must not call DB directly.
2. External site integrations must be implemented as plugins under `siteplugins/<site>`.
3. Plugin execution is coordinated by `siteplugins.Manager`, then media metadata is refreshed.
4. Service orchestration stays small; heavy logic belongs in dedicated files.

## Adding a new external site plugin

1. Create `internal/media/siteplugins/<site>/plugin.go` implementing `siteplugins.Plugin`.
2. Register in `internal/media/siteplugins/sitepluginsfx/module.go` using Fx group tag `media_site_plugins`.
3. Keep writes idempotent (safe to run repeatedly).
