# React Feature Architecture Template

React 19 + Vite 7 + TypeScript template with a feature-based directory structure and AI workflow guardrails.

## Structure

```text
src/
├── app/
├── assets/
├── features/
├── layouts/
├── shared/
└── styles/
```

## AI Workflow Files

- `.claude/`: Claude Code rules, hooks and slash commands
- `.cursorrules`: Cursor rules
- `.windsurfrules`: Windsurf rules
- `.github/copilot-instructions.md`: Copilot repository instructions
- `docs/prompts/`: reusable prompting templates

## Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm build
```
