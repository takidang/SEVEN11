# CLAUDE.md — 7-Eleven monorepo

Guidance for working in this repo with Claude Code. Read this first; it points to deeper docs.

## What this project is

A **university group project**: a management system for a chain of convenience stores,
inspired by 7-Eleven Vietnam (https://7-eleven.vn). Two faces over one set of data:

- **Cửa hàng online** (storefront) — browse, flash sales by time slot, cart & checkout with
  24-minute delivery, order tracking, phone sign-in, membership tiers (Đồng/Bạc/Vàng/Kim cương, kept month by month) and gold stars redeemed for vouchers.
- **Quản lý** (back office) — POS for cashiers, order board, products, stock by lot & expiry,
  purchasing & suppliers, customers, promotions, staff & shifts, stores, dashboard & reports.
  Roles: `admin` (whole chain), `manager` (one store), `cashier` (POS + orders).

It is a school project **inspired by** 7-Eleven — never present it as the official site; keep
the footer disclaimer and don't use the official logo file.

Default UI language is Vietnamese. Research and business rules:
[`docs/research/7-eleven-vn.md`](docs/research/7-eleven-vn.md).

## Repo layout

```text
7-eleven/
├── apps/
│   ├── frontend/   Next.js 16 app (storefront + back office) with an in-browser mock backend
│   ├── dotnet/     ASP.NET Core 8 MVC + C++ rewrite on SQLite (see apps/dotnet/README.md)
│   └── backend/    not started — the team decides the stack (see docs/architecture.md)
├── docs/           research, architecture, development, roadmap
├── .claude/        agents + skills for Claude Code
└── .github/        CI (frontend)
```

**Frontend first.** Until a backend exists, `apps/frontend/src/stores/db.ts` is the backend:
it holds every collection in IndexedDB (seeded by `src/lib/seed.ts`) and its actions are the
future API endpoints. `apps/frontend/src/types/index.ts` is the data contract.

## Run & verify

```bash
make fe-install   # pnpm install in apps/frontend
make fe-dev       # http://localhost:3711
make fe-check     # type check + lint (the gate)
make fe-build     # production build
```

Demo accounts (password `123456`): `admin@7eleven.demo`, `quanly1006@7eleven.demo`,
`thungan1006@7eleven.demo`. Demo shopper: phone `0901234567`, password `123456` (OTP only on sign-up and password reset; the code shows up in a simulated SMS toast).
Admin menu → "Tạo lại dữ liệu mẫu" resets the demo data.

Before calling UI work done: `make fe-check` is clean **and** the page was opened in a browser
at desktop and mobile width with no console errors, walking the real flow.

## Where to read next

| Topic | Doc |
| --- | --- |
| Frontend conventions, data rules, routes | [`apps/frontend/CLAUDE.md`](apps/frontend/CLAUDE.md) |
| Visual language (tokens, patterns, charts) | [`apps/frontend/docs/design-system.md`](apps/frontend/docs/design-system.md) |
| System architecture + backend handoff | [`docs/architecture.md`](docs/architecture.md) |
| Development workflow | [`docs/development.md`](docs/development.md) |
| What's done / next | [`docs/ROADMAP.md`](docs/ROADMAP.md) |

## Working agreements

- **Repo:** https://github.com/takidang/SEVEN11 (public, branch `main`). The ASP.NET Core 8 MVC (+ C++)
  rewrite lives in `apps/dotnet/`; how to run and test it: `apps/dotnet/README.md`.
- Next.js 16 has breaking changes vs. older versions — read `apps/frontend/AGENTS.md` and the
  bundled docs in `apps/frontend/node_modules/next/dist/docs/` before using Next APIs.
- Keep business rules in `apps/frontend/src/lib` (pure functions) so the backend can port them:
  pricing (`pricing.ts`), membership (`membership.ts`), gold stars (`stars.ts`), permissions (`permissions.ts`),
  statuses (`order-status.ts`).
- Anything that changes the data contract (`src/types`) or a db action's inputs must be noted
  in `docs/architecture.md` → "Backend handoff".
