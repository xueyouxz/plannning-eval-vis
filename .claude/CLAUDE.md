# Project Rules

Run these after changes:
- `pnpm lint`
- `pnpm build`

## Code Style

- Use ES modules only.
- Use functional React components and hooks.
- Default export page components for `React.lazy()`.
- Keep TypeScript strict and avoid `any`.
- Use `@/` for imports under `src/`.
- Prefer CSS Modules for component styles. Reserve `src/styles/` for app-wide tokens and resets.

## Architecture

- `src/app/`: application entry, router and providers.
- `src/features/`: business modules. Each feature owns its `components/`, `hooks/`, `api/`, `store/`, `types/` and `index.ts`.
- `src/shared/`: reusable constants, libraries, hooks and shared types.
- `src/layouts/`: route shells and layout-only UI.
- `src/styles/`: global variables and resets.
- `public/`: static files that should not be imported through Vite.

## Dependency Direction

- `app` can import from `features`, `layouts`, `shared`.
- `features` can import from `shared`.
- `shared` must not import from `features`.
- Do not import one feature directly from another feature.

## Working Rules

- New user-facing functionality belongs in a dedicated feature module under `src/features/`.
- Add a barrel file for every feature and export only its public API.
- Co-locate Redux slices with the feature that owns the state.
- Keep route definitions in `src/app/routes.tsx`.
- If you introduce reusable HTTP utilities, place them in `src/shared/lib/`.
- Update docs or command templates when architecture conventions change.

See:
- `.claude/rules/code-style.md`
- `.claude/rules/component-patterns.md`
- `.claude/rules/state-management.md`
- `.claude/rules/testing.md`
