# Slot-limiting — DB-enforced 防超賣

> 報告亮點 #1 — 為什麼把「每日限量」這件事下推到 DB 層做，而不是寫在應用層。

## 為什麼這是亮點

訂餐系統最古典的 concurrency bug：兩個員工**同時**點最後一份雞腿便當。

**單純的應用層寫法**會踩雷：

```ts
const slot = await db.from("daily_slots").select().eq(...).single();
if (slot.reserved_qty < slot.max_qty) {
  await db.from("order_items").insert(...);
  await db.from("daily_slots").update({ reserved_qty: slot.reserved_qty + 1 }).eq(...);
}
```

兩個 request 同時跑進 `if` → 兩個都 insert → reserved_qty 變成 `max_qty + 1` → 超賣，商家備不出餐。Read-then-write 在沒有顯式 lock 的情況下不是 atomic。

## 怎麼解

**把限量檢查下推到 DB 層**，由 PostgreSQL 用 transaction + CHECK constraint 保證 atomicity，應用層完全不碰 `reserved_qty`：

### Schema 設計

`daily_slots` 表兩個關鍵欄位：

```
daily_slots.max_qty       -- 商家設定每日上限
daily_slots.reserved_qty  -- 系統自動累計
+ CHECK (reserved_qty <= max_qty)
```

`[SOURCE: types/supabase.ts:39-73]`

### 兩段機制

| 元件 | 角色 |
|---|---|
| **Postgres Trigger** on `order_items` (AFTER INSERT/DELETE) | 自動 +1 / -1 更新對應 `daily_slots.reserved_qty` |
| **CHECK constraint** `reserved_qty <= max_qty` | 超過上限時 raise 錯誤，**整個 transaction rollback** |

### 應用層只做一件事

下單 server action 只 INSERT `order_items`，**從不手動更新 `reserved_qty`**：

```ts
// app/menu/[id]/actions.ts:46-62
const { data: orderItem, error } = await supabase
  .from("order_items")
  .insert({
    order_id: orderId,
    menu_item_id: menuItemId,
    daily_slot_id: dailySlotId,
    date,
    qty,
    unit_price: unitPrice,
  })
  .select("id")
  .single();

if (error) {
  if (error.code === "23514") return { error: "此日期已售完" };
  return { error: "加入失敗，請稍後再試" };
}
```

`23514` = PostgreSQL `check_violation` SQLSTATE。Trigger 在 INSERT 時試圖把 `reserved_qty` 推過 `max_qty` → CHECK fail → transaction rollback → 應用層收到 23514 → 翻譯為「此日期已售完」。

`[SOURCE: app/menu/[id]/actions.ts:46-62]`

## 為什麼這比應用層鎖好

| 維度 | 應用層 lock | DB-enforced |
|---|---|---|
| Race condition | 要寫對 SELECT FOR UPDATE / advisory lock | 不可能發生 — atomicity 由 PostgreSQL 保證 |
| Retry 邏輯 | 失敗時要手動 retry / backoff | 不需要 — transaction rollback 自動失敗 |
| Bug surface | 每個下單路徑都要寫對 | 唯一檢查點在 schema constraint，繞不過去 |
| 直接 SQL 改也安全 | ❌（應用層 lock 繞過了） | ✅（CHECK 對任何 INSERT 都生效） |
| 程式碼複雜度 | 高（要處理 deadlock / timeout） | 低（INSERT + catch 一個 error code） |

關鍵 insight：**正確性內建在 schema，不靠應用層紀律**。新人/AI agent 寫新的下單路徑時也不會破壞這個保證。

## UX 層怎麼搭配

UI 並不是完全靠這條 constraint 處理 — 為了給使用者好的體驗，前端先做 best-effort 提示：

```ts
// app/menu/[id]/page.tsx:81
const hasAvailable = slots.some((s) => s.max_qty - s.reserved_qty > 0);

// app/menu/[id]/add-to-order-dialog.tsx:46-47
const remaining = slot ? slot.max_qty - slot.reserved_qty : 0;
const availableDates = slots.filter((s) => s.max_qty - s.reserved_qty > 0);
```

但這只是 hint — 即使前端算錯、或網路延遲讓 UI 顯示「還有 1 份」實際已售完，最後仍會被 DB CHECK 擋下，使用者看到「此日期已售完」訊息。**前端優化體驗、後端守正確性**，分工清楚。

`[SOURCE: app/menu/[id]/page.tsx:81, app/menu/[id]/add-to-order-dialog.tsx:46-47]`

## 報告時可以強調的點

1. **沒有應用層 lock** — 沒寫 `SELECT FOR UPDATE`、沒用 Redis 鎖、沒做 retry 迴圈
2. **沒有手動 update `reserved_qty`** — 整個 codebase grep 不到，全交給 trigger
3. **錯誤翻譯只在一個地方** — `error.code === "23514"` 出現在唯一的下單入口
4. **任何繞過應用層的人也擋不了超賣** — 直接連 DB 跑 SQL 也會撞 CHECK

## 實際 DDL（從 production 拉回後落版）

完整 DDL 已落到 `supabase/migrations/20260526120000_slot_limiting_baseline_doc.sql`。報告投影片可直接秀以下 snippet：

### Trigger function

```sql
CREATE OR REPLACE FUNCTION public.update_reserved_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty + NEW.qty
    WHERE id = NEW.daily_slot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty
    WHERE id = OLD.daily_slot_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty + NEW.qty
    WHERE id = NEW.daily_slot_id;
  END IF;
  RETURN NULL;
END;
$function$;
```

### Trigger

```sql
CREATE TRIGGER sync_reserved_qty
AFTER INSERT OR DELETE OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.update_reserved_qty();
```

### CHECK constraints

```sql
ALTER TABLE public.daily_slots
  ADD CONSTRAINT no_oversell CHECK (reserved_qty <= max_qty);

ALTER TABLE public.daily_slots
  ADD CONSTRAINT daily_slots_max_qty_check CHECK (max_qty > 0);
```

### 報告時可以特別點出的細節

- **`SECURITY DEFINER` + `SET search_path TO 'public'`** — function 用 owner 權限執行（繞過 RLS），search_path 鎖定避免 schema 攔截攻擊。Production migration history 有一條 `20260323042727_fix_update_reserved_qty_security_definer` 顯示這是後來補的硬化（不是一開始就寫對）。
- **`AFTER` 而非 `BEFORE`** — 讓 INSERT 先寫進 order_items，再由 trigger update daily_slots → CHECK 失敗時整個 transaction（含原 INSERT）一起 rollback。語意乾淨。
- **`UPDATE` 分支處理 qty 變動**：`reserved_qty - OLD.qty + NEW.qty`，支援使用者修改數量場景（雖然目前 UI 不允許 update，但 trigger 已 future-proof）。
- **`RETURN NULL`**：AFTER trigger 的回傳值會被忽略，按 PG 慣例 return NULL。
