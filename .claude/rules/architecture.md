# Architecture

**Update this file immediately when architecture changes so agents always have the latest info.**

## Current Architecture (2026-03-28)

### Tech Stack
- Next.js 16 — App Router
- Tailwind CSS 4
- shadcn/ui (Radix UI primitives)
- Supabase — Auth (Google OAuth) + Postgres + RLS + Storage

### Directory Structure
```
app/
  (user)/           # User routes (/, /menu/[id], /cart, /orders, /profile)
  (vendor)/         # Vendor dashboard (/vendor, /vendor/menu, /vendor/orders, /vendor/profile)
  (admin)/          # Admin dashboard (/admin, /admin/vendors, /admin/reports)
  login/            # Login page
  auth/callback/    # Supabase OAuth callback
  api/pickup/       # QR code pickup endpoint
components/
  ui/               # shadcn/ui components
  header.tsx        # Global header (area selector, cart, user avatar)
  image-upload.tsx  # Image upload with type/size validation
lib/
  auth.ts           # Shared requireRole() helper for Server Action guards
  recommendation.ts # Recommendation engine (trending, nutrition, random)
  supabase/
    client.ts       # Browser client
    server.ts       # Server client (SSR)
  utils.ts
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
- Auth enforced at two layers: layout guards + Server Action `requireRole()` checks

### Slot-Limiting Mechanism
`daily_slots.reserved_qty` is atomically updated by a Postgres trigger. `CHECK (reserved_qty <= max_qty)` prevents overselling.
