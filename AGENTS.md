# Repository Guidelines

## Project Description

This is a Bun-powered SvelteKit application for users to upload, view and share MangoHud and CapFrameX benchmark data.

## Lint Guidance

- Treat anti-slop warnings as review prompts, not automatic refactoring instructions. Confirm that a suggested change improves this project before applying it.

## Implementation Preferences

- Use Valibot when appropriate to define and verify data schemas.
- Tests should protect meaningful user-facing behavior, domain rules, security properties, or difficult edge cases. Avoid redundant API smoke tests, tests of TypeScript’s type system, and tests that only preserve removed behavior.
- Be idiomatic. If your TS code looks like a Python dev wrote it then it's bad TS code.
- Use Svelte 5 principles and conventions.

## Validation and Type Safety

- Treat `unknown` as a boundary type. Parse it immediately with Valibot before passing it into application logic.
- Prefer exported Valibot schemas or `parseX(value): X | null` functions over handwritten `isX` type guards.
- Do not manually validate object shapes with chains of `typeof`, property-in-object checks, or type assertions.
- Infer types from Valibot schemas where practical so runtime validation and TypeScript types cannot drift apart.
- Runtime checks such as `typeof`, `instanceof`, `Number.isFinite`, feature detection, and semantic predicates are legitimate when they are not being used as substitutes for boundary schema validation.
- Do not force business predicates into Valibot. Use descriptive names such as `hasX`, `matchesX`, or `shouldX` for semantic decisions.
