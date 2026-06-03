# TSMC Eats — Design System

**Status:** Draft v0.1
**Last updated:** 2026-05-08
**Author:** Loki (zyx1121)
**Related:** `PROJECT.md`（產品脈絡）

---

## Context

TSMC Eats 是 WinLab 為廠區員工打造的訂餐平台，三種角色（員工 / 商家 / 福委）共用同一個 web app。目前 UI 風格已經有雛形：shadcn/ui + Tailwind v4 + Geist Sans + 中性 oklch 灰階 + 扁平無陰影。但這套規則只規範了「怎麼用 Tailwind class」，沒有規範**為什麼**要這樣用、token 系統、頁面節奏、品牌識別。

當頁面數量擴張到 user / vendor / admin 三套後台、各自又有 list / detail / form / dashboard 多種型態時，沒有 design system 會出現以下症狀：

- 不同頁面的卡片圓角、間距、陰影各寫一套
- Loading 狀態時而 Skeleton、時而 `animate-pulse`、時而空白
- 強調色用法浮濫（每個 CTA 都搶眼 = 沒有 CTA 真的搶眼）
- Photography（餐點、商家照片）跟資訊密度沒有層級規則，照片有時佔滿、有時被壓縮成縮圖

這份文件把 Airbnb 的視覺語言當作參考骨架，重新內化成 TSMC Eats 自己的 design system，讓未來所有頁面 review 都有單一 source of truth。

## Goals

1. **建立 token 系統**：顏色、字體、間距、圓角、陰影都用具名 CSS variable，禁止 inline magic number。
2. **建立 surface 階層**：canvas → card → placeholder → loader 四層 surface，整個 app 用同一套。
3. **單一品牌色心跳**：選一個 accent color 只用在品牌識別點（logo、active state、推薦徽章），其他地方禁用。
4. **Photography-first**：餐點與商家卡片以圖片為主視覺，文字只是說明，不喧賓奪主。
5. **節奏一致**：縱向用 48px 區塊、12px 卡內、8px 元素間距三層節奏；橫向用 max-width 1152px (`max-w-6xl`) 收攏。
6. **支援 dark mode**：所有 token 都要有 light / dark 對應值，預設 light。

## Non-Goals

- 不打造完整的 component library —— shadcn/ui 已經提供，本文件只規範如何**使用**它們。
- 不規範文案（字串、語氣）—— 那是 content design 的範疇。
- 不做 mobile-only design —— 員工主要在桌機 / 手機瀏覽器使用，響應式處理在元件層。
- 不引入 Airbnb Cereal VF —— 保留 Geist Sans，但採用同樣的「單一字體 + 緊湊字距」哲學。

## Design Overview

> 把 TSMC Eats 想像成貼在白色軟木板上的餐點明信片 —— 純白卡片浮在淡灰畫布上，照片做所有的視覺重活，文字安靜地報價，唯一的暖色像一根圖釘把整個 layout 釘住。

四個關鍵特徵：

1. **雙層 near-white surface**：頁面 canvas 微灰（`oklch(0.97 0 0)`），卡片純白（`oklch(1 0 0)`），不靠陰影靠對比建立深度。
2. **Single chromatic heartbeat**：一抹暖色 `oklch(0.65 0.18 35)`（≈ `#E85D3D`，番茄紅橘），只出現在 logo、active nav underline、「熱銷」徽章、加入購物車的成功 toast。其他地方禁用。
3. **照片邊到邊滿出**：餐點 / 商家圖以 16:9 或 1:1 占據卡片頂部，圓角 20px，無 border、無 shadow，圖片佔卡片視覺面積 ≥ 65%。
4. **Geist Sans 全 stack**：字體統一，靠字重（400/500/600/700）跟字距分層級，不靠字體切換。

## Tokens — Colors

採用 oklch，方便控制感知亮度。所有色票都有對應 CSS variable，禁止 hardcode 十六進位。

| 角色 | Light | Dark | Token | 用途 |
|------|-------|------|-------|------|
| Canvas | `oklch(0.97 0 0)` | `oklch(0.145 0 0)` | `--surface-canvas` | 頁面底色、footer、disabled 按鈕底 |
| Card | `oklch(1 0 0)` | `oklch(0.205 0 0)` | `--surface-card` | 卡片、header、modal、popover 背景 |
| Placeholder | `oklch(0.92 0 0)` | `oklch(0.30 0 0)` | `--surface-placeholder` | 圖片載入前的佔位塊 |
| Loader | `oklch(0.85 0 0)` | `oklch(0.40 0 0)` | `--surface-loader` | Skeleton 動畫底色 |
| Text Primary | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | `--text-primary` | 標題、價格、主要內文 |
| Text Secondary | `oklch(0.50 0 0)` | `oklch(0.708 0 0)` | `--text-secondary` | 次要說明、metadata、評論數 |
| Text Disabled | `oklch(0.75 0 0)` | `oklch(0.50 0 0)` | `--text-disabled` | 禁用文字、暫停營業標籤 |
| Border | `oklch(0.92 0 0)` | `oklch(1 0 0 / 0.10)` | `--border` | 卡片 / 輸入框邊線 |
| Divider | `oklch(0.94 0 0)` | `oklch(1 0 0 / 0.06)` | `--divider` | 區塊內細分隔線 |
| **Brand Accent** | `oklch(0.65 0.18 35)` | `oklch(0.70 0.18 35)` | `--brand` | Logo、active nav、推薦徽章、成功 toast |
| **Brand Hover** | `oklch(0.58 0.18 32)` | `oklch(0.63 0.18 32)` | `--brand-hover` | Brand 元素 hover 加深 |
| Destructive | `oklch(0.577 0.245 27)` | `oklch(0.704 0.191 22)` | `--destructive` | 刪除、取消訂單、錯誤狀態 |
| Success | `oklch(0.62 0.14 145)` | `oklch(0.70 0.14 145)` | `--success` | 訂單成功、付款完成 |

> Brand accent 的計算：oklch chroma 0.18 比 Airbnb coral (#ff385c, oklch 0.66 0.27 16) 飽和度低、色相往橘移，避開「Airbnb cosplay」嫌疑，落在「番茄紅 / 蛋包飯紅橘」區間，跟訂餐情境契合。

### Primary Action（CTA）色

CTA 沿用 shadcn 的 `--primary`（近黑 `oklch(0.205 0 0)`），不使用 brand accent。理由：
- Airbnb 的 primary CTA 也是黑底白字（"Continue", "Reserve"），coral 只給 search trigger。
- 我們的角色多（員工 / 商家 / 福委），暖色 CTA 在後台會干擾資訊密度。
- 黑色 CTA 在密集照片畫面中辨識度反而最高。

## Tokens — Typography

### 字體

**Geist Sans** 為唯一字體，不引入第二套。已在 `app/layout.tsx` 透過 `next/font/google` 載入。

字重只用四個：`400` regular / `500` medium / `600` semibold / `700` bold。禁止使用 800/900。

### Type Scale

| 角色 | Size | Weight | Line Height | Letter Spacing | Token |
|------|------|--------|-------------|----------------|-------|
| caption | 11px | 500 | 1.30 | +0.02em | `--text-caption` |
| meta | 12px | 400 | 1.40 | -0.005em | `--text-meta` |
| body | 14px | 400 | 1.45 | -0.009em | `--text-body` |
| body-strong | 14px | 600 | 1.45 | -0.009em | `--text-body-strong` |
| heading-sm | 16px | 600 | 1.35 | -0.012em | `--text-heading-sm` |
| heading | 20px | 600 | 1.25 | -0.015em | `--text-heading` |
| display | 28px | 700 | 1.18 | -0.020em | `--text-display` |

**規則：**
- 大字（≥ 20px）字距負值收緊，避免 Geist 在大尺寸下顯得鬆散
- 小字（≤ 12px）字距微正，提升 caption 易讀性
- 區塊標題（如「🔥 熱銷排行」）固定用 `heading`（20px / 600）
- 餐點 / 商家名稱用 `heading-sm`（16px / 600）
- 價格用 `body-strong`（14px / 600），不放大成 heading —— Airbnb 也是這樣處理
- Display（28px）只給 hero 標題或大型 dashboard 數字，菜單頁不要用

## Tokens — Spacing & Layout

### Spacing Scale

沿用 Tailwind v4 預設（每階 0.25rem = 4px）。常用節奏：

| 用途 | 值 | Tailwind |
|------|-----|----------|
| 元素間 | 8px | `gap-2` |
| 元素群組間 | 12px | `gap-3` |
| 卡內 padding | 12px–16px | `p-3` / `p-4` |
| 卡片之間 | 16px | `gap-4` |
| 區塊之間（推薦區、商家列表） | 32–48px | `gap-8` / `gap-12` |
| 頁面 padding（mobile） | 16px | `p-4` |
| 頁面 padding（desktop） | 24px | `md:px-6` |

**節奏規則：8 → 12 → 16 → 32 → 48**，不在這個 scale 上的數字（10、20、24px）禁止用於垂直節奏。

### Layout

| 屬性 | 值 |
|------|-----|
| Page max-width | `max-w-6xl`（72rem = 1152px） |
| Header height | 64px (`h-16`) |
| Main min-height | `calc(100dvh - 4rem)` |
| Section gap | 32–48px |
| Card padding | 12–16px |

> 目前 max-w-6xl（1152px）比 Airbnb 的 1760px 窄。員工訂餐情境資訊密度需求低、手機瀏覽佔比高，1152 的舒適區比 1760 更合適 —— 不照搬。

## Tokens — Border Radius

| 元素 | 值 | Token |
|------|-----|-------|
| Cards（餐點、商家、訂單卡） | 20px | `--radius-card` |
| Pills / Chips（區域選擇、tag） | 32px | `--radius-pill` |
| Badges（暫停營業、guest favorite） | 4px | `--radius-badge` |
| Inputs / Selects | 14px | `--radius-input` |
| Buttons | 8px | `--radius-button` |
| Icon Buttons | 50% | `--radius-icon` |
| Modals / Dialogs | 16px | `--radius-modal` |
| Skeleton | 跟所代理元件一致 | — |

**禁用值**：6px、10px、12px、24px。混用會破壞節奏。

> 目前 `globals.css` 的 `--radius: 1rem`（16px）作為 base 保留，shadcn 內建的 `--radius-sm/md/lg/xl/2xl` 計算式也保留，但**新元件優先用上表的具名 token**。

## Tokens — Shadows & Elevation

TSMC Eats 維持「扁平 + border 區分」的精神，但 elevated container 允許用 layered shadow。

| 用途 | 值 | Token |
|------|-----|-------|
| Cards（預設） | 無 | — |
| Sticky header（scroll 後） | `0 1px 0 rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)` | `--shadow-sticky` |
| Floating（modal、popover、dropdown） | `0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.10)` | `--shadow-floating` |
| Icon button on photo | `0 0 0 1px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.16)` | `--shadow-on-photo` |
| Badge on photo | `drop-shadow(0 2px 6px rgba(0,0,0,0.25))` | `--shadow-badge` |

**規則：**
- 卡片**永遠不用 shadow**，靠 `border` + `--surface-card` 與 canvas 對比建立層級
- 圖片之上的元素（badge、按鈕）才用 shadow，目的是把元素從照片裡「拉出來」
- Modal / popover 用 floating shadow，這是唯一允許「飄起來」的場景

## Surfaces & Elevation 階層

| Level | Surface | Token | Shadow | 例 |
|-------|---------|-------|--------|----|
| 0 | Canvas | `--surface-canvas` | none | `<body>`、footer |
| 1 | Card | `--surface-card` | none | 餐點卡、商家卡、訂單列、表單區塊 |
| 2 | Sticky Header | `--surface-card` | `--shadow-sticky`（scroll 後） | `<Header>` |
| 3 | Floating | `--surface-card` | `--shadow-floating` | Dialog、Select dropdown、Toast |
| 4 | On Photo | `--surface-card` | `--shadow-on-photo` / `--shadow-badge` | 「熱銷」徽章、收藏按鈕 |

## Components

shadcn/ui 提供的元件保留，套用 design system 規範：

### 已存在 component 對齊規則

| Component | 對齊規則 |
|-----------|---------|
| `Button` (default) | 黑底白字，`rounded-button`，hover `bg-primary/80`，**不用 brand 色** |
| `Button` (outline) | header utility，`rounded-button`，`border-border`，hover `bg-muted` |
| `Button` (ghost) | nav link 用，無底色，hover `bg-muted` |
| `Card`（自製 div） | `bg-surface-card`、`border`、`rounded-card`、無 shadow、padding 12–16px |
| `Input` / `Select` | `rounded-input`（14px）、`border` |
| `Dialog` | `rounded-modal`（16px）、`shadow-floating`、backdrop `bg-black/40` |
| `Skeleton` | 對應實際元件形狀，`bg-surface-loader` |
| `Avatar` | 圓形，無 border |

### 新規元件指引

#### Vendor Card / Menu Item Card

```
[ 圖片 16:9，bg-surface-placeholder，rounded-t-card ]
[ 12px padding ]
  [ Title ] heading-sm / 600
  [ Tag chips + 評分 ] meta / 400 / text-secondary
  [ Price（如為菜單） ] body-strong
```

- **無 shadow**、無 border 在外圈，內部圖片下用 `bg-card` 接續
- Hover：`hover:scale-[1.02] transition duration-200`
- 圖片佔卡片視覺面積 ≥ 65%

#### Recommendation Section

```
[ 區塊標題 emoji + 文字 ] heading 20px/600
[ 12px gap ]
[ 橫向 carousel，gap-3，scrollbar 隱藏 ]
```

- 標題用一個 emoji（🔥 / 💪 / 🎲）作 visual anchor，但**不取代** brand color heartbeat
- 卡片寬度固定 `w-48`，避免響應式造成卡片忽大忽小

#### Brand Accent Badge（如「熱銷」「新上架」）

```
背景 bg-brand
文字 text-white / 11px / 600 / +0.02em
padding 4px 8px
rounded-badge（4px）
```

只能出現在以下情境：
1. 「熱銷」「新上架」標籤
2. 訂單成功 toast 的 accent stripe
3. 推薦區的 active dot
4. Logo 中 "Eats" 字樣（如未來重做 logo）

## Imagery

- 餐點 / 商家照片**邊到邊**進入卡片，無內邊距
- 預設 aspect ratio：商家 `16/9`、餐點 `1/1`
- 載入前用 `--surface-placeholder` 純色塊，**不用 spinner**
- 載入完成淡入 200ms
- 不套濾鏡、不調飽和度、不加暗角 —— 商家上傳什麼樣就什麼樣
- Icon 統一用 `lucide-react`，stroke 1.5，色用 `--text-primary` 或 `--text-secondary`，**不染 brand 色**

## Layout 節奏

```
┌──────────────────────────────────────┐  ← header 64px sticky，scroll 後加 shadow-sticky
│  TSMC Eats     [區域]   [後台][單][車][頭] │
├──────────────────────────────────────┤
│                                       │  ← 24px top padding
│  🔥 熱銷排行           →              │  ← heading 20/600
│  [□][□][□][□][□][□]                  │  ← 卡片 carousel，gap-3
│                                       │  ← 32–48px section gap
│  💪 營養推薦           →              │
│  [□][□][□][□][□][□]                  │
│                                       │
│  ─────────────────────────────────   │  ← divider（divider color）
│                                       │
│  [商家 grid 1/2/3 col]                │  ← gap-4
│  □  □  □                              │
│  □  □  □                              │
│                                       │
└──────────────────────────────────────┘
```

## Motion

- **State transition**：`transition-all duration-200 ease-out`
- **Hover scale**：`hover:scale-[1.02]`，僅卡片 / 圖片元素
- **Active press**：`active:translate-y-px`（已在 button.tsx）
- **Page transition**：`page-transition` keyframe（已在 globals.css），`opacity + translateY 6px`，200ms
- **Skeleton pulse**：shadcn 預設 `animate-pulse`，禁止自寫
- **Reduced motion**：所有非必要動畫在 `prefers-reduced-motion: reduce` 下關閉（已在 globals.css 處理 page-transition）

不要做的事：
- 不用 spring / bounce 曲線
- 不用 fade out + slide 組合（太花）
- 不用 stagger 動畫（除非 hero）

## Do / Don't

### Do
- 用 `--surface-canvas` 跟 `--surface-card` 對比建立層級，不靠 shadow
- 圓角嚴格用 `card / pill / badge / input / button / icon / modal` 七種具名 token
- Brand accent 只在 logo / active state / 推薦徽章 / 成功 toast 出現
- CTA 一律黑底白字（`Button variant="default"`）
- 商家 / 餐點卡片以圖片為主視覺，文字 padding 12–16px
- Loading 一律 `<Skeleton>`，仿照真實排版形狀
- 區塊標題用 `heading`（20px/600），名稱用 `heading-sm`（16px/600）

### Don't
- 不用 brand 色染 body text、icon、border、CTA 底色
- 不在卡片加 shadow（除非是 modal/popover/sticky header）
- 不用 6 / 10 / 12 / 24px 圓角（破壞 radius 詞彙）
- 不用 weight 800/900
- 不寫 `animate-pulse` div，永遠用 `<Skeleton>`
- 不在 photo 上直接放裸文字 —— 必須先有 badge / scrim
- 不為了「視覺豐富」加裝飾性圖案、漸層背景、霓虹邊框

## Alternatives Considered

### A. 完全照搬 Airbnb（保留 #ff385c coral + Cereal VF）
- ❌ 視覺上會被誤認為 Airbnb 競品 / cosplay
- ❌ Cereal VF 是商業字體，授權成本高
- ❌ Coral 在訂餐情境太搶眼，會跟食物照片打架

### B. 使用 NYCU 校徽紅作為 brand accent
- ⚠️ 校徽紅（#9F1B1F 暗紅）飽和度低，做 brand heartbeat 力道不足
- ⚠️ 員工會把它聯想成「校方公告」而非「app 品牌」
- ✅ 但在 admin（福委會）後台可考慮用作 accent secondary

### C. 不引入 brand accent，整套純黑白灰
- ✅ 最保守，視覺最一致
- ❌ 失去「single chromatic heartbeat」，logo 無辨識度
- ❌ 推薦區、訂單成功等情緒節點缺少視覺錨點

### D. 改成 Inter Variable
- ⚠️ Inter 是 Geist 的近親但更通用
- ❌ Geist 已經接入，切換成本與收益不成比例
- ✅ 維持 Geist Sans，套用 Airbnb 的字距 / 字重哲學就好

**選定 (D + 自定 brand)**：保留 Geist Sans，引入 `oklch(0.65 0.18 35)` 番茄紅橘作 brand accent，scarcity 嚴格控管。

## Migration Plan

分四階段，每階段獨立 PR：

1. **Tokens 落地**（PR 1）
   - `app/globals.css` 新增上述 CSS variable
   - 不動任何元件，僅建立 token
   - Risk: 0
2. **Surface 階層調整**（PR 2）
   - `--background` 從 `oklch(1 0 0)` 改為 `oklch(0.97 0 0)`
   - `--card` 維持 `oklch(1 0 0)`
   - 確認所有頁面在新 canvas 下視覺正常
   - Risk: 中（可能露出原本以為「白底」的元件問題）
3. **Component 對齊**（PR 3+）
   - 逐一檢查 `header.tsx` / `menu-item-card.tsx` / `recommendation-section.tsx` / `app/page.tsx`
   - 套用 spacing / radius / typography token
   - 不改變元件邏輯
4. **Brand accent 接入**（PR 4）
   - Logo "Eats" 改成 brand 色
   - 推薦區「熱銷」改成 badge with brand 底
   - Toast 成功狀態加 brand stripe

## Open Questions

1. Brand accent 番茄紅橘 `oklch(0.65 0.18 35)` 跟 NYCU 校徽紅是否需要 family 一致？要不要稍微往暗紅靠（chroma 提到 0.20、hue 28）？
2. Vendor 後台（管理介面）是否要走「資訊密度更高、photography 更弱」的子主題？還是統一一套？
3. Admin（福委會）的 dashboard 大數字要不要用 `--text-display`（28px），還是另開一個 `--text-stat`（40px+）？
4. Dark mode 的 brand accent 飽和度要不要進一步調整？目前 dark 用 `oklch(0.70 0.18 35)`，可能要實測才知道對不對。

---

> **下一步**：本文件 merge 後，依序開 PR 對齊 codebase。每次 review UI 都以本文件為準繩 —— DESIGN.md 是 single source of truth，跟它牴觸的任何 inline 寫法都要回來改。
