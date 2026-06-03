# TSMC Eats

Factory meal ordering platform for TSMC — employees pre-order meals from partnered vendors, solving mealtime fatigue across factory sites.

## Tech Stack

- **Next.js 16** — App Router, Server Components
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **Supabase** — Auth (Google OAuth + Email) · Postgres · RLS · Storage

## Implemented Features

### Employee

- Filter partnered vendors by factory site
- Browse vendor menus with daily remaining quotas
- Customizable meal options (single / multi-select, price adjustments)
- Shopping cart management (grouped by date, remove items)
- Place pre-orders (Postgres trigger for atomic quota deduction, prevents overselling)
- Meal recommendations (trending, nutrition picks, random discovery)
- Profile management (name, factory site)
- Google OAuth / Email login

### Vendor

- Store info editing (name, description, image, open status, operating days)
- Menu management (create / edit / delete / toggle availability)
- Daily quota settings (next 7 days)
- Custom option group management (option groups + individual options)
- Order summary view (aggregated by date with quantity and amount)
- Revenue dashboard (daily / weekly / monthly aggregates with trend + bar charts)
- Image upload (store banner + menu item images, stored in Supabase Storage)

### Infrastructure

- Server / Client Component separation, Server Actions for data mutations
- RLS for data access control
- Every route has a `loading.tsx` skeleton
- Role system (user / vendor / admin, one person can have multiple roles)
- Auth guards (layout + Server Action dual-layer verification)
- Admin dashboard (vendor approval, operations dashboard, multi-factory management, monthly report CSV export)
- Error handling (error.tsx / global-error.tsx / not-found.tsx)
- CI pipeline (GitHub Actions: lint + unit + e2e + build)
- Layered test setup:
  - Vitest for unit tests
  - Vitest + mocks for Server Action / query-flow integration tests
  - Playwright for end-to-end user flows
- Playwright e2e tests (homepage, menu, order flow)

## Not Yet Implemented

| Category | Feature | Priority |
|----------|---------|----------|
| Employee | LLM smart recommendations (natural language preference input) | Advanced |
| Pickup | Delivery label printing (multiple printer formats) | Basic |

## Getting Started

1. Write environment variables to `.env` (see `.env.example`)
2. Install dependencies and run the development server:

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

```bash
bun run test        # Run Vitest first, then Playwright e2e
bun run test:unit   # Run unit tests + mock integration tests with Vitest
bun run test:coverage # Run Vitest with backend coverage report
bun run test:e2e    # Run Playwright e2e tests
bun run test:ui     # Playwright UI mode
```

### Current Test Coverage

Latest local backend unit test run:

```text
bun run test:unit
Test Files  31 passed (31)
Tests       162 passed (162)
```

Latest local backend coverage run:

```text
bun run test:coverage
All files: 88.87% statements, 78.63% branches, 93.38% functions, 94.72% lines
```

Backend coverage includes `lib/**/*.ts`, Server Actions, route handlers, and `proxy.ts`.

Unit and mock-integration coverage currently includes:

- `app/api/pickup/route.test.ts`: QR pickup route permissions, order status checks, picked-up transitions
- `app/auth/callback/route.test.ts`: OAuth callback exchange, safe redirects, profile-name backfill
- `app/cart/actions.test.ts`: mocked Server Action coverage for cart flows
- `app/cart/cart-view.test.ts`: cart grouping, sorting, totals
- `app/login/actions.test.ts`: email login and Google OAuth redirect behavior
- `app/menu/[id]/actions.test.ts`: add-to-order validation, anti-tampering checks, quota errors
- `app/orders/actions.test.ts`: mocked order query + pagination coverage
- `app/orders/order-summary.test.ts`: order summary normalization
- `app/profile/actions.test.ts`: sign-out and employee profile updates
- `app/vendor/menu/actions.test.ts`: menu item, AI metadata, quota, option group, and option actions
- `app/vendor/orders/actions.test.ts`: single and batch pickup actions
- `app/vendor/profile/actions.test.ts`: vendor profile, schedule, and image updates
- `app/vendor/revenue/actions.test.ts`: vendor revenue dashboard query/fallback behavior
- `app/vendor/revenue/revenue-model.test.ts`: revenue aggregation helpers
- `lib/auth.test.ts`: role guard behavior
- `lib/branding.test.ts`: product name and factory-area constants
- `lib/context.test.ts`: weather context mapping and context embedding cache behavior
- `lib/daily-pick.test.ts`: daily pick lookup and normalization
- `lib/filters.test.ts`: search filter parsing, serialization, and active counts
- `lib/impressions.test.ts`: impression deduplication and upsert payloads
- `lib/navigation-rules.test.ts`: role to default-home and header-visibility rules
- `lib/reasons.test.ts`: personalized reason TTL filtering, attachment, and generation trigger
- `lib/recommendation.test.ts`: home ranking RPC mapping and trending item aggregation
- `lib/roulette.test.ts`: random item selection boundaries
- `lib/search.test.ts`: hybrid search, embedding fallback, rerank fallback, filter params
- `lib/utils.test.ts`: class-name merge helper
- `proxy.test.ts`: auth proxy redirects and public auth path behavior
- `e2e/home.spec.ts`, `e2e/menu.spec.ts`, `e2e/order-flow.spec.ts`: real browser flows

### E2E Requirements

Playwright global setup logs in with the credentials from `.env` before tests run.

Required environment variables:

```bash
E2E_EMAIL=...
E2E_PASSWORD=...
```

CI runs lint + unit tests + Playwright e2e + build on every PR (see `.github/workflows/ci.yml`). E2E uses the `E2E_EMAIL` / `E2E_PASSWORD` GitHub Actions secrets.

## Directory Structure

```
app/
  page.tsx          # Home: factory-filtered vendor grid + recommendation sections
  cart/             # Employee cart + actions + tests
  orders/           # Employee order list + detail + tests
  menu/[id]/        # Vendor menu detail + add-to-order dialog
  profile/          # Employee profile
  login/            # Login page
  auth/callback/    # Supabase OAuth callback
  api/pickup/       # QR-code pickup endpoint
  vendor/           # Vendor: store info, menu, orders, revenue
  admin/            # Admin: operations, vendor management, reports, users
components/
  ui/               # shadcn/ui primitives
  header.tsx        # Global header
  area-select.tsx   # Factory filter dropdown
  image-upload.tsx  # Image upload with type/size validation
  login-form.tsx    # Email/password + Google OAuth form
  menu-item-card.tsx        # Shared menu item card
  recommendation-section.tsx # Horizontal carousel
lib/
  auth.ts           # requireRole() helper
  recommendation.ts # Recommendation engine
  navigation-rules.ts # Role-based default home + header visibility
  supabase/         # Browser & server client
proxy.ts            # Next.js 16 edge middleware (was middleware.ts)
types/
  supabase.ts       # Auto-generated Supabase DB types
```

## Development with Claude Code

This project is maintained with [Claude Code](https://claude.com/claude-code). The agent automatically reads project rules and conventions on every session.

### Auto-Loaded Rules

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Entry point — references all rule files below |
| `AGENTS.md` | Next.js 16 breaking change warnings |
| `.claude/rules/architecture.md` | Current architecture, directory structure, DB schema |
| `.claude/rules/coding-style.md` | Code style (minimal, type-safe, Server Component first) |
| `.claude/rules/project.md` | Stack versions, doc-lookup rules, conventions |
| `DESIGN.md` | UI/UX design system — tokens, surfaces, typography, brand accent rules |
| `.claude/rules/git.md` | Branch naming, commit format, PR conventions, versioning |

### Recommended Plugins

Plugins used during development and maintenance of this project:

```bash
# Core — DB, hosting, docs
claude plugins install supabase@claude-plugins-official      # Supabase MCP (migrations, SQL, advisors)
claude plugins install vercel@claude-plugins-official         # Vercel deployment & platform skills
claude plugins install context7@claude-plugins-official       # Auto-fetch latest docs for any library

# Code quality
claude plugins install code-review@claude-plugins-official    # Code review agent
claude plugins install pr-review-toolkit@claude-plugins-official  # PR review, type analysis, test coverage
claude plugins install superpowers@claude-plugins-official    # TDD, planning, debugging workflows
claude plugins install commit-commands@claude-plugins-official  # Git commit/PR helpers

# Development
claude plugins install feature-dev@claude-plugins-official    # Guided feature development
claude plugins install frontend-design@claude-plugins-official  # UI design with high design quality
claude plugins install playwright@claude-plugins-official     # Browser automation & e2e testing

# DX
claude plugins install explanatory-output-style@claude-plugins-official  # Educational insights
claude plugins install learning-output-style@claude-plugins-official     # Interactive learning mode
```

### Useful Phrases

| Phrase | What it triggers |
|--------|-----------------|
| `review the project` | Full codebase review (bugs, security, performance) |
| `check Supabase Performance Advisor` | Run DB performance linter via MCP |
| `/ship` | Ship workflow (tests → review → PR) |
| `/qa` | QA test the site and fix bugs found |
| `/browse <url>` | Headless browser for testing |
| `/investigate` | Systematic debugging with root cause analysis |
| `/design-review` | Visual QA and design consistency check |
| `create an issue for ...` | Create GitHub issue via `gh` CLI |
| `fix and merge` | Fix → commit → PR → merge → cleanup |

## Example Accounts

See [EXAMPLES.md](./EXAMPLES.md) for vendor/menu seed data and login addresses, and [docs/test-accounts.md](./docs/test-accounts.md) for the manually-seeded test accounts. Passwords are intentionally not committed — ask the maintainer or reset them in the Supabase Dashboard.

## License

[MIT](LICENSE.md) — Bon appétit.
