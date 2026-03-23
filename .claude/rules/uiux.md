# UI/UX Style Rules

根據現有專案風格整理：

## 設計原則
- **扁平簡潔**：不用陰影，用細邊框（`border`）區分元素
- **圓角統一**：`--radius: 1rem`，所有卡片/輸入框/按鈕用一致圓角
- **間距統一**：容器 `p-4`，元素間距 `gap-3` / `gap-4`
- **結構清晰**：同類內容分組，善用 `flex flex-col gap-*`

## 排版
- 容器最大寬度：`max-w-6xl w-full`（頁面中央對齊）
- 頁面 main：`min-h-[calc(100dvh-4rem)] flex flex-col items-center`
- Grid：商家/餐點列表用 `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

## 顏色
- 主色調：中性（oklch neutral）
- 強調色：只用 `primary`（近黑/白）
- 次要文字：`text-muted-foreground`
- 背景：`bg-muted` 用於佔位 / 圖片未載入

## Loading 狀態
- 使用 `<Skeleton>` 元件做 loading placeholder，**不自己寫** `animate-pulse` div
- import 路徑：`@/components/ui/skeleton`
- 配合頁面結構仿照實際排版的形狀，例如：
  ```tsx
  // 商家卡片 skeleton
  <div className="flex flex-col gap-3">
    <Skeleton className="aspect-video w-full rounded-lg" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-3 w-1/2" />
  </div>
  ```
- 頁面層級 loading 放在對應路由的 `loading.tsx`（Next.js App Router 慣例）

## 互動
- Hover：`hover:scale-[1.02] transition-all duration-200`（細緻，不誇張）
- 按鈕：`w-full` 在 dialog footer；header 用 `variant="outline"`

## 主題
- 預設 `light` mode（`defaultTheme="light"`）
- 支援 system dark mode

## 字型
- Geist Sans（`--font-geist-sans`）
- 標題：`text-4xl font-bold` / `text-xl font-bold`
- 內文：`text-md`
- 次要：`text-sm text-muted-foreground`
