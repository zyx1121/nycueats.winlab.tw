
-- ==============================
-- AREAS (廠區/區域)
-- ==============================
create table areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  city       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 預設資料
insert into areas (name, city) values
  ('Fab 2', '新竹科學園區（竹科）'),
  ('Fab 3', '新竹科學園區（竹科）'),
  ('Fab 5', '新竹科學園區（竹科）'),
  ('Fab 6', '新竹科學園區（竹科）'),
  ('Fab 8', '新竹科學園區（竹科）'),
  ('Fab 12A', '新竹科學園區（竹科）'),
  ('Fab 12B', '新竹科學園區（竹科）'),
  ('Fab 20', '新竹科學園區（竹科）'),
  ('Fab 14', '台南科學園區（南科）'),
  ('Fab 18', '台南科學園區（南科）'),
  ('Fab 15', '中部科學園區（中科）'),
  ('Fab 22 高雄', '南部科學園區'),
  ('Fab 25 嘉義/台南沙崙', '南部科學園區');

-- ==============================
-- PROFILES (使用者資料)
-- ==============================
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  avatar_url text,
  role       text[] not null default array['user'],
  area_id    uuid references areas(id),
  created_at timestamptz not null default now()
);

-- 登入後自動建立 profile
create function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ==============================
-- VENDORS (商家)
-- ==============================
create table vendors (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references profiles(id) on delete set null,
  name        text not null,
  description text,
  image_url   text,
  tags        text[] not null default '{}',
  is_active   boolean not null default false,
  rating_good int not null default 0,
  rating_bad  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ==============================
-- VENDOR_AREAS (商家服務區域 many-to-many)
-- ==============================
create table vendor_areas (
  vendor_id uuid not null references vendors(id) on delete cascade,
  area_id   uuid not null references areas(id) on delete cascade,
  primary key (vendor_id, area_id)
);

-- ==============================
-- MENU_ITEMS (餐點)
-- ==============================
create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors(id) on delete cascade,
  name         text not null,
  description  text,
  price        numeric(10,2) not null,
  image_url    text,
  calories     int,
  protein      numeric(6,2),
  sodium       numeric(6,2),
  sugar        numeric(6,2),
  is_available boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ==============================
-- DAILY_SLOTS (每日名額 — 限量核心)
-- ==============================
create table daily_slots (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  date         date not null,
  max_qty      int not null check (max_qty > 0),
  reserved_qty int not null default 0,
  created_at   timestamptz not null default now(),
  unique (menu_item_id, date),
  constraint no_oversell check (reserved_qty <= max_qty)
);

-- ==============================
-- ORDERS (預約單)
-- ==============================
create table orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  status     text not null default 'pending'
              check (status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz not null default now()
);

-- ==============================
-- ORDER_ITEMS (預約明細)
-- ==============================
create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  menu_item_id   uuid not null references menu_items(id),
  daily_slot_id  uuid not null references daily_slots(id),
  date           date not null,
  qty            int not null check (qty > 0),
  unit_price     numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ==============================
-- TRIGGER: 原子更新 reserved_qty
-- ==============================
create function update_reserved_qty()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update daily_slots
    set reserved_qty = reserved_qty + new.qty
    where id = new.daily_slot_id;
  elsif TG_OP = 'DELETE' then
    update daily_slots
    set reserved_qty = reserved_qty - old.qty
    where id = old.daily_slot_id;
  elsif TG_OP = 'UPDATE' then
    update daily_slots
    set reserved_qty = reserved_qty - old.qty + new.qty
    where id = new.daily_slot_id;
  end if;
  return null;
end;
$$;

create trigger sync_reserved_qty
  after insert or update or delete on order_items
  for each row execute procedure update_reserved_qty();
