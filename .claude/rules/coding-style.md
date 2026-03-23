# Coding Style

- **整潔小巧**：每個函式/元件只做一件事，檔案不超過 200 行
- **不冗餘**：不寫重複邏輯，不加未來用不到的彈性，不留無用的 import/變數
- **資料型態完整**：所有 TypeScript 型別明確定義，不用 `any`；DB 型別從 Supabase 自動生成的 `types.ts` 引用
- **命名清楚**：變數/函式用英文，中文只出現在 UI 字串
- **Server Component 優先**：只在需要 interactivity 或 browser API 時加 `'use client'`
