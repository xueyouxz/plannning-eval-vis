## Project Context

This repository uses React 19, Vite 7 and TypeScript strict mode.

### Architecture

- `src/app/`: app bootstrap, routes, providers
- `src/features/`: business modules with barrel files
- `src/shared/`: reusable libraries, hooks, constants and types
- `src/layouts/`: route shell components
- `src/styles/`: global tokens and resets

### Conventions

- Use `@/` alias imports
- Default-export route page components
- Keep features isolated from each other
- Prefer CSS Modules for styling
- Use functional components only
- Run lint after edits
