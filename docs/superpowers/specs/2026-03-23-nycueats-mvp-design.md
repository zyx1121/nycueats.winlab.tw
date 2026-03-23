# NYCU Eats MVP Design

Date: 2026-03-23

## Overview

企業訂餐預約系統。員工可預約未來 7 天（從明天起）的外送便當，限量供應，商家可自行管理菜單與每日名額，管理員審核商家。

## Roles

`profiles.role: text[]` — 允許一人多角色。

| Role    | 說明                     |
| ------- | ------------------------ |
| user    | 一般員工，預約便當         |
| vendor  | 商家，管理菜單與查看訂單   |
| admin   | 福委會，審核商家（後續實作）|

## Database Schema

### `areas` (區域)
| Column     | Type    | Notes                    |
| ---------- | ------- | ------------------------ |
| id         | uuid PK |                          |
| name       | text    | e.g. "新竹光復校區"       |
| city       | text    | e.g. "新竹"              |
| is_active  | boolean | default true             |
| created_at | timestamptz |                      |

### `profiles`
| Column     | Type      | Notes                        |
| ---------- | --------- | ---------------------------- |
| id         | uuid PK   | FK → auth.users.id            |
| name       | text      |                              |
| email      | text      |                              |
| avatar_url | text      |                              |
| role       | text[]    | ['user'], ['vendor'], etc.   |
| area_id    | uuid      | FK → areas (使用者所屬區域)   |
| created_at | timestamptz |                            |

### `vendors` (商家)
| Column      | Type    | Notes                      |
| ----------- | ------- | -------------------------- |
| id          | uuid PK |                            |
| owner_id    | uuid    | FK → profiles              |
| name        | text    |                            |
| description | text    |                            |
| image_url   | text    |                            |
| tags        | text[]  | e.g. ['餃子', '麵食']      |
| is_active   | boolean | default false (待審核)      |
| rating_good | int     | default 0                  |
| rating_bad  | int     | default 0                  |
| created_at  | timestamptz |                        |

### `vendor_areas` (商家服務區域, many-to-many)
| Column    | Type | Notes              |
| --------- | ---- | ------------------ |
| vendor_id | uuid | FK → vendors       |
| area_id   | uuid | FK → areas         |
| PK        |      | (vendor_id, area_id) |

### `menu_items` (餐點)
| Column       | Type    | Notes           |
| ------------ | ------- | --------------- |
| id           | uuid PK |                 |
| vendor_id    | uuid    | FK → vendors    |
| name         | text    |                 |
| description  | text    |                 |
| price        | numeric |                 |
| image_url    | text    |                 |
| calories     | int     | kcal            |
| protein      | numeric | g               |
| sodium       | numeric | mg              |
| sugar        | numeric | g               |
| is_available | boolean | default true    |
| created_at   | timestamptz |             |

### `daily_slots` (每日名額，限量核心)
| Column       | Type    | Notes                             |
| ------------ | ------- | --------------------------------- |
| id           | uuid PK |                                   |
| menu_item_id | uuid    | FK → menu_items                   |
| date         | date    |                                   |
| max_qty      | int     |                                   |
| reserved_qty | int     | default 0, managed by trigger     |
| UNIQUE       |         | (menu_item_id, date)              |
| CHECK        |         | reserved_qty <= max_qty           |

`reserved_qty` 由 Postgres trigger 在 `order_items` insert/delete 時原子更新，`CHECK` 約束保證不超量。並發時資料庫報錯，前端顯示「已售完」提示。

### `orders` (預約單)
| Column     | Type    | Notes                                         |
| ---------- | ------- | --------------------------------------------- |
| id         | uuid PK |                                               |
| user_id    | uuid    | FK → profiles                                 |
| status     | text    | pending / confirmed / cancelled / completed   |
| created_at | timestamptz |                                           |

### `order_items` (預約明細)
| Column        | Type    | Notes                        |
| ------------- | ------- | ---------------------------- |
| id            | uuid PK |                              |
| order_id      | uuid    | FK → orders                  |
| menu_item_id  | uuid    | FK → menu_items              |
| daily_slot_id | uuid    | FK → daily_slots             |
| date          | date    | 預約日期                      |
| qty           | int     |                              |
| unit_price    | numeric | snapshot at time of order    |
| created_at    | timestamptz |                          |

## Reservation Rules

- 可預約範圍：明天起 ~ 7 天內
- 今天的便當**不可**預約（截止為昨天 23:59）
- 名額用完 → 前端 disabled，無法加入

## Route Architecture

### User
| Route         | 說明                              |
| ------------- | --------------------------------- |
| `/`           | 首頁，依區域顯示商家列表            |
| `/menu/[id]`  | 商家頁，菜單 + 加入預約單 (with 日期選擇) |
| `/cart`       | 預約單，依日期分組，可取消          |
| `/orders`     | 歷史訂單                          |
| `/login`      | Google OAuth 登入                 |

### Vendor
| Route           | 說明                    |
| --------------- | ----------------------- |
| `/vendor`       | 商家後台首頁             |
| `/vendor/menu`  | 菜單 CRUD + 每日名額設定 |
| `/vendor/orders`| 訂單彙整                |

### Admin
| Route    | 說明           |
| -------- | -------------- |
| `/admin` | 空殼，後續實作  |

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- shadcn/ui (Radix UI)
- Supabase (Auth + Postgres + RLS)
