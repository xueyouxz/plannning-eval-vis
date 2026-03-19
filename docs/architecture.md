# Architecture

This template uses a feature-based front-end structure.

## Layers

- `src/app/`: app bootstrap, providers and route wiring
- `src/features/`: business modules grouped by domain
- `src/shared/`: cross-feature primitives
- `src/layouts/`: route shells
- `src/styles/`: global variables and resets
- `public/`: static assets served as-is

## Dependency Direction

`shared -> features -> app`

- `shared` must remain independent
- `features` can depend on `shared`
- `app` composes features and layouts

## Migration Notes

- Avoid new `pages/`, `types/`, `constants/` or `store/` root buckets.
- Move feature-specific state, API and types beside the feature.
- Keep only truly global types and constants in `src/shared/`.
