# NYCU Eats

Campus meal ordering platform for NYCU — employees pre-order meals from partnered vendors, solving mealtime fatigue across campus sites.

## Tech Stack

- **Next.js 16** — App Router, Server Components
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **Supabase** — Auth (Google OAuth + Email) · Postgres · RLS · Storage

## Implemented Features

### Employee

- Filter partnered vendors by campus area
- Browse vendor menus with daily remaining quotas
- Customizable meal options (single / multi-select, price adjustments)
- Shopping cart management (grouped by date, remove items)
- Place pre-orders (Postgres trigger for atomic quota deduction, prevents overselling)
- Meal recommendations (trending, nutrition picks, random discovery)
- Profile management (name, area)
- Google OAuth / Email login

### Vendor

- Store info editing (name, description, image, open status, operating days)
- Menu management (create / edit / delete / toggle availability)
- Daily quota settings (next 7 days)
- Custom option group management (option groups + individual options)
- Order summary view (aggregated by date with quantity and amount)
- Image upload (store banner + menu item images, stored in Supabase Storage)

### Infrastructure

- Server / Client Component separation, Server Actions for data mutations
- RLS for data access control
- Every route has a `loading.tsx` skeleton
- Role system (user / vendor / admin, one person can have multiple roles)
- Auth guards (layout + Server Action dual-layer verification)
- Admin dashboard (vendor approval, operations dashboard, multi-area management, monthly report CSV export)
- Error handling (error.tsx / global-error.tsx / not-found.tsx)
- CI pipeline (GitHub Actions: lint + build + e2e test)
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

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

See `.env.example` for required environment variables (Supabase project config).

## Testing

```bash
bun run test        # Run Vitest first, then Playwright e2e
bun run test:unit   # Run unit tests + mock integration tests with Vitest
bun run test:e2e    # Run Playwright e2e tests
bun run test:ui     # Playwright UI mode
```

### Current Test Coverage

- `app/cart/cart-view.test.ts`: cart grouping, sorting, totals
- `app/orders/order-summary.test.ts`: order summary normalization
- `app/cart/actions.test.ts`: mocked Server Action coverage for cart flows
- `app/orders/actions.test.ts`: mocked order query + pagination coverage
- `e2e/home.spec.ts`, `e2e/menu.spec.ts`, `e2e/order-flow.spec.ts`: real browser flows

### E2E Requirements

Playwright global setup logs in with the credentials from `.env` before tests run.

Required environment variables:

```bash
E2E_EMAIL=...
E2E_PASSWORD=...
```

CI currently runs lint + build + e2e test on every PR (see `.github/workflows/ci.yml`).

## Directory Structure

```
app/
  (user)/           # Employee: homepage, menu, cart, profile
  (vendor)/         # Vendor dashboard: store info, menu management, orders
  (admin)/          # Admin dashboard: operations overview, vendor management
  login/            # Login page
  auth/callback/    # Supabase OAuth callback
components/
  ui/               # shadcn/ui components
  header.tsx        # Global header
lib/
  supabase/         # Browser & server client
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
| `.claude/rules/uiux.md` | UI/UX design system (spacing, colors, loading states) |
| `.claude/rules/git.md` | Branch naming, commit format, PR conventions, versioning |

### Recommended Plugins

Plugins used during development and maintenance of this project:

```bash
# Core — DB, hosting, docs
claude plugins add supabase@claude-plugins-official      # Supabase MCP (migrations, SQL, advisors)
claude plugins add vercel@claude-plugins-official         # Vercel deployment & platform skills
claude plugins add context7@claude-plugins-official       # Auto-fetch latest docs for any library

# Code quality
claude plugins add code-review@claude-plugins-official    # Code review agent
claude plugins add pr-review-toolkit@claude-plugins-official  # PR review, type analysis, test coverage
claude plugins add superpowers@claude-plugins-official    # TDD, planning, debugging workflows
claude plugins add commit-commands@claude-plugins-official  # Git commit/PR helpers

# Development
claude plugins add feature-dev@claude-plugins-official    # Guided feature development
claude plugins add frontend-design@claude-plugins-official  # UI design with high design quality
claude plugins add playwright@claude-plugins-official     # Browser automation & e2e testing

# DX
claude plugins add explanatory-output-style@claude-plugins-official  # Educational insights
claude plugins add learning-output-style@claude-plugins-official     # Interactive learning mode
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

See [EXAMPLES.md](./EXAMPLES.md) — all example account passwords are `password123`.
