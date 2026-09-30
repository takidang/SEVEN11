---
name: frontend-context
description: Use when reading or editing files under apps/frontend (the Next.js 16 app) — frontend conventions, mock-DB data rules, design system and gotchas.
user-invocable: false
paths: apps/frontend/**
---

# Frontend context (apps/frontend)

Next.js 16.3 App Router + TypeScript + Tailwind v4 + shadcn/ui. Full guide:
`apps/frontend/CLAUDE.md`; visual rules: `apps/frontend/docs/design-system.md`.

Keep in mind while working here:

- **Two areas, one app:** storefront in `src/app/(shop)`, back office in `src/app/quan-ly/(panel)`
  (sidebar shell + `<StaffGate>`), POS in `src/app/quan-ly/ban-hang` (full screen).
- **Mock backend:** `src/stores/db.ts` (zustand → IndexedDB, synced across tabs), seeded by
  `src/lib/seed.ts`. Its actions are the future API; the contract is `src/types/index.ts`.
- **Business rules are pure functions in `src/lib`:** `pricing.ts` (flash sale, buy X get Y,
  member drink voucher, codes, shipping), `membership.ts`, `permissions.ts`, `order-status.ts`.
  Never recompute totals by hand.
- **Readiness:** dynamic collections are empty until `useDbReady()`; session/cart until
  `useHydrated()`. Use `useNow()` instead of `new Date()` during render.
- **Back office:** every list respects `useStoreScope()` (`null` = whole chain) and hides edit
  actions via `canManage(role, module)`.
- **Next 16:** `params`/`searchParams` are Promises in server components; `middleware` is now
  `proxy`; read `node_modules/next/dist/docs/` when unsure.
- **Verify:** `pnpm check-types` + `pnpm lint`, then open the page (desktop + mobile, right role).
- **Copy:** Vietnamese with diacritics; no emoji icons; no hard-coded hex colours.
