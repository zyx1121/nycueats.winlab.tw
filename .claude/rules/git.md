# Git 工作流程

## Branch & PR 規則

**任何修改，不論大小，都必須：**

1. 從 `main` 開新 branch
2. 在 branch 上進行所有修改與 commit
3. 發 Pull Request 合併回 `main`
4. 不可直接 push 到 `main`

## Branch 命名

```
feat/   - 新功能
fix/    - 修蟲
chore/  - 雜項（設定、文件等）
```

範例：`feat/vendor-rating`、`fix/cart-qty-overflow`

## Commit 格式

使用 Conventional Commits + scope：

```
type(scope): 描述
```

### Type

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修蟲 |
| `chore` | 設定、文件、依賴 |
| `refactor` | 重構（不改行為） |
| `test` | 測試 |

### Scope

| scope | 範圍 |
|-------|------|
| `orders` | 訂單流程（下單、紀錄、狀態） |
| `cart` | 購物車 |
| `menu` | 菜單瀏覽與管理 |
| `vendor` | 商家後台 |
| `admin` | 管理員後台 |
| `auth` | 登入、角色、權限 |
| `ui` | 共用元件、樣式 |
| `db` | DB schema、migration、RLS |
| `deps` | 依賴升級 |

Scope 可省略（如 `chore: update README`），但涉及特定模組時建議加上。

### 範例

```
feat(orders): 新增訂單紀錄頁
fix(cart): 數量為 0 時未阻擋送出
feat(menu): 餐點推薦區塊
chore(deps): 升級 supabase-js
refactor(vendor): 抽出共用的日期選擇器
test(orders): 取消訂單釋放名額
```

## PR 規範

### 標題

同 commit 格式：`type(scope): 描述`

### 描述

```markdown
## Summary
- 做了什麼（1-3 bullet points）

## Test plan
- [ ] 怎麼驗證這個修改是正確的

Closes #issue_number
```

- `Closes #N` 會在 PR merge 時自動關閉對應 issue
- 有截圖 / GIF 的話附上

## 版本號（SemVer）

格式：`vMAJOR.MINOR.PATCH`

| 版本 | 意義 |
|------|------|
| `v0.x.0` | 開發中，每個 minor 版 = 一個功能里程碑 |
| `v1.0.0` | 所有基本需求完成，可交付 |
| `v1.x.0` | 進階功能迭代 |
| `v_._.x` | 修蟲 |

### 目前規劃

```
v0.1.0 — MVP（瀏覽、下單、商家後台）       ← 已完成
v0.2.0 — 訂單流程補完（紀錄、狀態、領餐）
v0.3.0 — 餐點推薦引擎
v0.4.0 — 管理員後台
v0.5.0 — 測試與錯誤處理
v1.0.0 — 基本需求全部完成
```

每個 minor 版對應一個 GitHub Milestone。
