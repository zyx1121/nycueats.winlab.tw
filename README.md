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
bun run test        # Run e2e tests (Playwright)
bun run test:ui     # Playwright UI mode
```

CI runs lint + build + e2e test on every PR (see `.github/workflows/ci.yml`).

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

## Example Accounts

See [EXAMPLES.md](./EXAMPLES.md) — all example account passwords are `password123`.
