---
paths:
  - 'src/features/**'
  - 'src/render2d/**'
  - 'src/render3d/**'
  - 'src/app/**'
  - 'src/components/**'
---

# Frontend Rules

## Components

- Functional components only — no class components
- One component per file
- Props typed with TypeScript interfaces
- No prop drilling past 2 levels — use context or a state store

## State management

- Local state: useState / useReducer
- Global state: Zustand (`src/store/`); the project store is the single source of truth
- No business logic in components — extract to hooks

## Performance

- Memoize expensive computations with useMemo
- Stabilise callback references with useCallback
- Lazy-load heavy components with React.lazy

## Accessibility

- All interactive elements keyboard-navigable
- Images have meaningful alt text
- Colour contrast meets WCAG AA minimum
