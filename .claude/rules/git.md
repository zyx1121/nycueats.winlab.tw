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

使用 Conventional Commits：

```
feat: 新增廠商評分功能
fix: 修正購物車數量溢出
chore: 更新 EXAMPLES.md
```
