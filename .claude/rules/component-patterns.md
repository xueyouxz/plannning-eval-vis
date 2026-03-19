# Component Patterns

## Page Components

- Store page components under `src/features/<feature>/components/`.
- Use `export default function XxxPage()`.
- Keep data loading outside layout components.

## Shared Components

- Place reusable UI in `src/shared/` when it is feature-agnostic.
- Prefer one component per folder only when that component has tests or multiple assets.

## Hooks

- Prefix hooks with `use`.
- Return objects instead of tuples unless React already defines the tuple API.
