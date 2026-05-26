# Architecture

**Update this file immediately when architecture changes so agents always have the latest info.**

## Current Architecture (2026-05-26)

### Tech Stack
- Next.js 16 — App Router
- Tailwind CSS 4
- shadcn/ui (Radix UI primitives)
- Supabase — Auth (Google OAuth + Email) + Postgres + RLS + Storage

### Directory Structure
```
app/
  page.tsx          # Home — area-filtered vendor grid + recommendation sections
  layout.tsx        # Root layout (Geist Sans, ThemeProvider, Header)
  globals.css       # Tokens (surface/brand/radius/shadow/type scale), light/dark
  cart/             # Employee cart (/cart) + actions, view-model, tests
  orders/[id]/      # Order detail + QR code component
  orders/           # Employee orders list (/orders) + actions, summary, tests
  menu/[id]/        # Vendor menu detail (/menu/[id]) + add-to-order dialog
  profile/          # Employee profile (/profile)
  login/            # Login page (/login) + actions
  auth/callback/    # Supabase OAuth callback
  api/pickup/       # QR code pickup endpoint (route handler)
  vendor/           # /vendor, /vendor/{menu,orders,profile,revenue}
  admin/            # /admin, /admin/{vendors,reports,users}
components/
  ui/               # shadcn/ui primitives
  header.tsx        # Global header (area selector, cart, user avatar)
  area-select.tsx   # Area filter dropdown
  image-upload.tsx  # Image upload with type/size validation
  login-form.tsx    # Email/password + Google OAuth form
  menu-item-card.tsx # Shared menu item card (user + vendor view)
  recommendation-section.tsx # Horizontal carousel for trending/nutrition/random
lib/
  auth.ts           # requireRole() helper for Server Action guards
  recommendation.ts # Recommendation engine (trending, nutrition, random)
  navigation-rules.ts # Role-based default home + header visibility rules
  supabase/{client,server}.ts  # Browser / SSR clients
  utils.ts
proxy.ts            # Next.js 16 edge middleware (renamed from middleware.ts)
types/
  supabase.ts       # Auto-generated DB types
```

### DB Tables
- `areas` — Campus areas (e.g. Hsinchu Guangfu)
- `profiles` — User profiles (role: text[])
- `vendors` — Vendor stores
- `vendor_areas` — Vendor-area mapping (many-to-many)
- `menu_items` — Menu items
- `item_option_groups` — Option groups per menu item
- `item_options` — Individual options within a group
- `daily_slots` — Daily quotas (core slot-limiting mechanism, has CHECK constraint)
- `orders` — Orders
- `order_items` — Order line items
- `order_item_options` — Selected options per order item

### Roles
- `user` — Employee
- `vendor` — Vendor owner
- `admin` — Welfare committee
- One person can have multiple roles (profiles.role: text[])
- Auth enforced at three layers:
  - `proxy.ts` redirects unauthenticated requests to `/login` and routes
    authenticated users to their default home by role
  - Layout guards in `app/{admin,vendor}/layout.tsx` re-check role
    before rendering protected subtrees
  - Server Actions call `lib/auth.ts` `requireRole()` for mutation-time
    verification

### Slot-Limiting Mechanism
`daily_slots.reserved_qty` is atomically updated by a Postgres trigger. `CHECK (reserved_qty <= max_qty)` prevents overselling.
