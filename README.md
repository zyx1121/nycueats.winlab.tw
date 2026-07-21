# TSMC Eats

> Pre-order lunch from outside vendors before the noon rush, so quota mix-ups and pickup-line chaos never happen.

`nextjs` · `supabase` · `typescript` · `tailwindcss`

[![CI](https://github.com/zyx1121/tsmceats.winlab.tw/actions/workflows/ci.yml/badge.svg)](https://github.com/zyx1121/tsmceats.winlab.tw/actions) &nbsp;[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

```
Employee → /login → pick a factory site → browse menus (live quotas) → cart → pre-order
                                                                              ↓
Vendor   → /vendor → manage menus & quotas → today's order queue        QR pickup code
                                                                              ↓
Admin    → /admin → approve vendors → multi-factory access → monthly CSV export
```

<sub>One account, three role-gated views: `proxy.ts` redirects each role to its own default home.</sub>

Thousands of factory employees eating the same canteen food every day is a real problem, and manually juggling outside vendors on spreadsheets doesn't scale to that headcount. TSMC Eats lets each vendor run their own storefront (menu, photos, daily quotas) while employees pre-order up to a week ahead and pick up with a QR code, no ops team in the loop.

## Quickstart

```bash
git clone https://github.com/zyx1121/tsmceats.winlab.tw && cd tsmceats.winlab.tw
bun install
cp .env.example .env   # fill in the keys below
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Key | Where it comes from |
|-----|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase dashboard > Settings > API |
| `E2E_EMAIL` / `E2E_PASSWORD` | Test login used by Playwright's global setup (ask maintainer) |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Sentry project settings |
| `SENTRY_AUTH_TOKEN` | Source-map upload only, needs `org:read` + `project:releases` scopes |
| `SENTRY_WEBHOOK_SECRET` | Verifies inbound alerts at `/api/sentry-alert-webhook` |

## What it gives you

- **Browse & pre-order** vendor menus up to 7 days ahead, filtered by factory site, with quotas enforced atomically by a Postgres trigger.
- **Run a storefront** as a vendor: menu items, option groups, daily quotas, image uploads, and a revenue dashboard, no engineering help needed.
- **Pick up with a QR code**: confirming an order generates a scannable code, checked at `/api/pickup`.
- **Get recommended**: weather/time context, taste embeddings, and trending items rank the homepage; hybrid search blends keyword and semantic matching.
- **Oversee as admin**: approve vendors, manage multi-factory access, export monthly settlement CSVs.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| UI | Tailwind CSS 4 + shadcn/ui (Radix UI) |
| Backend | Supabase (Auth · Postgres · RLS · Storage · Edge Functions) |
| AI | OpenAI `gpt-5.4-mini` (offline tagging, embeddings, search rerank) |
| Observability | Sentry (`@sentry/nextjs`) |
| Package manager | Bun |

## Testing

```bash
bun run test          # vitest unit + mock-integration, then Playwright e2e
bun run test:unit      # unit + mock-integration only
bun run test:coverage
```

Latest local run:

```text
Test Files  31 passed (31)
Tests       162 passed (162)
Coverage    88.87% statements · 78.63% branches · 93.38% functions · 94.72% lines
```

Playwright's global setup logs in with `E2E_EMAIL` / `E2E_PASSWORD` before tests run. CI runs lint + unit + e2e + build on every PR (`.github/workflows/ci.yml`), using the same two as GitHub Actions secrets.

## Not yet implemented

| Category | Feature | Priority |
|----------|---------|----------|
| Employee | LLM smart recommendations (natural language preference input) | Advanced |
| Pickup | Delivery label printing (multiple printer formats) | Basic |

## Directory structure

```
app/          # user / vendor / admin routes, Server Actions co-located per route
components/   # shadcn/ui primitives + shared cards, header, image upload
lib/          # auth guards, recommendation engine, search, Supabase clients
proxy.ts      # Next.js 16 edge middleware, role-based redirects
types/        # Supabase-generated DB types
supabase/     # migrations + edge functions
e2e/          # Playwright flows (home, menu, order)
```

## Example accounts

Seeded vendors and menus are in [EXAMPLES.md](EXAMPLES.md); manually-seeded test logins are in [docs/test-accounts.md](docs/test-accounts.md). Passwords aren't committed: ask the maintainer or reset them in the Supabase dashboard.

## Contributing

Dev conventions (branch naming, commit format, coding style) live in `CLAUDE.md` and `.claude/rules/`, auto-loaded by Claude Code. Issues and PRs welcome: start with [CONTRIBUTING.md](https://github.com/zyx1121/.github/blob/main/CONTRIBUTING.md).

## License

[MIT](LICENSE.md) · Bon appétit.
