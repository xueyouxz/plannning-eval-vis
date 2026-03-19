# State Management

- Keep global store setup in `src/shared/lib/store.ts`.
- Co-locate slices with the owning feature.
- Promote state to Redux only when it must be shared across routes or distant components.
- Feature selectors should live beside the slice when they become non-trivial.
