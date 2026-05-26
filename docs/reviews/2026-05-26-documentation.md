# Documentation Review — 2026-05-26

## Summary

審 11 個 root + rules + docs 檔。Documentation drift 集中在三個方向：(1) README 的 「Implemented Features」漏掉 vendor revenue dashboard；(2) `.claude/rules/uiux.md` 跟 `DESIGN.md` 對圓角 token 直接打架，但沒有任何交叉引用；(3) `EXAMPLES.md` / `test-accounts.md` / README 對「測試帳號密碼」三個地方說三套。Main session 已知三 drift（`(user)/(vendor)/(admin)` route groups、CI e2e、slot-limiting DDL）不重複報。

## Critical（誤導 / 找錯地方）

- **README:184 vs EXAMPLES.md:8**：README 寫「all example account passwords are `password123`」，但 EXAMPLES.md 的 admin 帳號密碼是 `Admin1234!` [SOURCE: README.md:184, EXAMPLES.md:8]。測試者照 README 走會登不進 admin。
- **`.claude/rules/uiux.md:7` vs `DESIGN.md:139-150`**：uiux.md 寫「`--radius: 1rem`，所有卡片/輸入框/按鈕用一致圓角」；DESIGN.md 規範七種**不同**具名 token（card 20px、button 8px、input 14px、badge 4px、modal 16px、pill 32px、icon 50%）。兩個都被 CLAUDE.md auto-load 鏈讀進來，agent 看到會困惑優先採哪個 [SOURCE: .claude/rules/uiux.md:7, DESIGN.md:139-150]。
- **`.env` vs `.env.local`**：README:68/97 說 `.env`、`.claude/rules/project.md:23` 跟 `docs/test-accounts.md:35` 說 `.env.local`，repo 實際只有 `.env` + `.env.example`、無 `.env.local` [SOURCE: README.md:68, README.md:97, .claude/rules/project.md:23, docs/test-accounts.md:35, ls /Users/loki/nycueats.winlab.tw/.env*]。
- **README:170-181 「Useful Phrases」未驗證**：`/ship` / `/qa` / `/browse` / `/investigate` / `/design-review` 都來自 `superpowers` / `pr-review-toolkit` plugin（README:144-166），但本機 `~/.claude/plugins/cache/claude-plugins-official/` 沒有 superpowers / pr-review-toolkit 目錄，無從 verify 這些 slash command 是否真實存在於那兩個 plugin [SOURCE: README.md:170-181, ls /Users/loki/.claude/plugins/cache/claude-plugins-official/]。`[UNVERIFIED]` 命令名稱，需對 plugin marketplace 實際 cat command frontmatter 才能確認。

## Important（drift / 缺失）

- **Vendor Revenue Dashboard 文件全漏**：`app/vendor/revenue/` 已實作（commit 4d35d14），且有 spec + plan + unit test，但 README:34-42「Vendor」features 沒列、`.claude/rules/architecture.md:14-25` directory listing 沒寫 [SOURCE: ls app/vendor/revenue/, README.md:34-42, .claude/rules/architecture.md:14-25, git log --oneline]。
- **`/admin/users` 路由漏文件**：`app/admin/users/` 存在（actions.ts + page.tsx + user-role-row.tsx），`.claude/rules/architecture.md:18` 只列 `/admin, /admin/vendors, /admin/reports` [SOURCE: ls app/admin/users/, .claude/rules/architecture.md:18]。
- **`proxy.ts` middleware 零文件**：repo root 有 58 行的 `proxy.ts`（Next.js 16 的 middleware，做未登入 redirect + 已登入 default home routing），是 auth 第三層（不是 architecture.md:55 寫的「兩層」），但 README / architecture.md / project.md 完全沒提 [SOURCE: proxy.ts:1-58, .claude/rules/architecture.md:55]。
- **`lib/navigation-rules.ts` + `.test.ts` 漏 architecture listing**：`.claude/rules/architecture.md:26-31` 的 `lib/` 樹只列 `auth.ts` / `recommendation.ts` / `supabase/` / `utils.ts`，但 repo 有 `navigation-rules.ts` 跟 `navigation-rules.test.ts`（proxy.ts 在用）[SOURCE: ls lib/, .claude/rules/architecture.md:26-31]。
- **README「Current Test Coverage」漏兩個 test**：實際 6 個 `*.test.ts`，README:89-93 只列 4 個（漏 `lib/navigation-rules.test.ts`、`app/vendor/revenue/revenue-model.test.ts`）[SOURCE: find ... -name "*.test.ts", README.md:89-93]。
- **README:113 + architecture.md:24 components 列表不完整**：`components/` 實際有 `area-select.tsx` / `login-form.tsx` / `menu-item-card.tsx` / `recommendation-section.tsx`，architecture.md:24 只列 `header.tsx` + `image-upload.tsx`、README:117-120 只列 `ui/` + `header.tsx` [SOURCE: ls components/, .claude/rules/architecture.md:22-25, README.md:117-120]。
- **DESIGN.md 自我矛盾**：DESIGN.md:29 寫「橫向用 max-width 1280px 收攏」，DESIGN.md:129 寫 `max-w-6xl（72rem = 1152px）`、DESIGN.md:135 又重申 1152px。1280 是 max-w-7xl，1152 才是 max-w-6xl [SOURCE: DESIGN.md:29, DESIGN.md:129, DESIGN.md:135]。
- **`docs/superpowers/specs/2026-03-23-nycueats-mvp-design.md` 全篇 stale，無 Status 標記**：spec:7 還寫「管理員審核商家（後續實作）」、spec:17 寫「admin 後續實作」、spec:138 寫「`/admin` 空殼，後續實作」，但 admin 後台早已實作（commit 50a413f, README:50）。整個 `docs/superpowers/specs/` + `plans/` 沒有任何檔案標 `Status: implemented/superseded`，唯一有 status 標的是 DESIGN.md 跟 docs/highlights/slot-limiting.md [SOURCE: docs/superpowers/specs/2026-03-23-nycueats-mvp-design.md:7, :17, :138, README.md:50, grep "Status:" docs/]。
- **DESIGN.md 不在 auto-load chain**：CLAUDE.md 只 import 5 個 `.claude/rules/*.md`，沒 import DESIGN.md，但 DESIGN.md:360 自稱「single source of truth」。意思是新 session 的 agent 預設看不到 DESIGN.md，只會看到跟它衝突的 uiux.md [SOURCE: CLAUDE.md:5-9, DESIGN.md:360]。
- **README「Auto-Loaded Rules」表沒列 DESIGN.md / PROJECT.md / QUESTIONS.md / EXAMPLES.md**：README:132-141 的表只列 CLAUDE.md / AGENTS.md / 5 rules，沒提其他 root *.md。對 reader 來說「這些 .md 是給誰看的」缺答案 [SOURCE: README.md:132-141]。
- **`.claude/rules/git.md:101-108` 版本規劃 vs 實際 git tags**：git.md 寫 `v0.1.0 已完成` + 列 v0.2.0~v1.0.0 規劃，但 `git tag` 輸出為空（一個 tag 也沒打過）[SOURCE: .claude/rules/git.md:101-108, git tag]。「索引層不抄 source of truth」原則被破壞 — 進度被抄到 git.md 裡。
- **缺 ERD / schema diagram**：11 張表（areas / profiles / vendors / vendor_areas / menu_items / item_option_groups / item_options / daily_slots / orders / order_items / order_item_options）的關係只能讀 `types/supabase.ts` FK metadata 反推 [SOURCE: types/supabase.ts:14-462]。學期專案 demo / 報告通常會要一張圖。
- **缺 deployment / env 文件**：repo 沒有 `DEPLOY.md` / `CONTRIBUTING.md`，README:67-76 只給 `bun install && bun run dev`，沒寫 Supabase project 怎麼接、Vercel deploy、production secrets 哪裡管、Storage bucket 名 [SOURCE: README.md:67-76, ls /Users/loki/nycueats.winlab.tw/*.md]。
- **缺 ADR**：`.claude/rules/architecture.md` 寫「slot-limiting 用 trigger + CHECK」但沒解釋「為什麼不用應用層 lock」，這個決策有 docs/highlights/slot-limiting.md 但屬於「報告亮點」格式不是 ADR — 沒有「Alternatives Considered / Consequences」結構 [SOURCE: docs/highlights/slot-limiting.md:1, .claude/rules/architecture.md:60-61]。

## Nit（typo / terminology）

- **「輔委會」vs「福委會」**：EXAMPLES.md:8-9 跟 docs/test-accounts.md:20 寫「輔委會」（輔助委員會），但 PROJECT.md:11/23/24、DESIGN.md:12/76/315、QUESTIONS.md:10 都寫「福委會」（福利委員會）[SOURCE: EXAMPLES.md:8-9, docs/test-accounts.md:20, PROJECT.md:11]。這是真的別字，「福委會」才對。
- **EXAMPLES.md:11 邏輯漏洞**：寫「密碼欄為『—』的帳號透過 Google OAuth 建立，無 email 密碼登入」，但 EXAMPLES.md:9 同一表中 `morning.bites@nycueats.dev` 密碼欄是「—」，docs/test-accounts.md:20 卻把它列為 `vendor + admin` 角色的測試帳號、暗示可以 email 登入 [SOURCE: EXAMPLES.md:9, EXAMPLES.md:11, docs/test-accounts.md:20]。
- **README:81 commands 行內註解 typo prone**：`bun run test  # Run Vitest first, then Playwright e2e` — 確實 package.json 是 `vitest run && playwright test`，正確；但 `test:unit` 註解寫「Run unit tests + mock integration tests with Vitest」用 + 號讀來像兩個 command [SOURCE: README.md:81-84, package.json:10-13]。Nit，可保留。
- **README:106 typo 在類別層級**（已知 drift 範圍內，提醒）：「CI currently runs lint + build + e2e test」應該砍 「+ e2e test」，因為 commit `5178175 chore(ci): drop e2e job until UI stabilizes` 早把 e2e 拿掉了 [SOURCE: README.md:106, .github/workflows/ci.yml, git log --grep e2e]。
- **README:148 行內註解**：「`supabase@claude-plugins-official` # Supabase MCP (migrations, SQL, advisors)」應該是「supabase plugin」不是「Supabase MCP」（MCP 是底層協定，plugin 是 user-facing 名稱）— 半 nit [SOURCE: README.md:148]。

## What's good（文件做對的部分）

- **DESIGN.md 結構完整**：Status / Last updated / Author / Related / Context / Goals / Non-Goals / Tokens 分區 / Alternatives Considered / Migration Plan / Open Questions — 唯一一份接近 ADR 規格的文件 [SOURCE: DESIGN.md:3-6, 26-36, 306-356]。
- **docs/highlights/slot-limiting.md 來源標註模範**：每個技術 claim 後面附 `[SOURCE: ...]`，包括 line 號跟錯誤代碼，最後段還明確標 `[UNVERIFIED]` 哪些東西沒驗 [SOURCE: docs/highlights/slot-limiting.md:35-71, :130]。其他文件可以模仿這個格式。
- **AGENTS.md ↔ CLAUDE.md 互引邏輯有寫**：CLAUDE.md:3 明確說「Do not reference AGENTS.md here, or the two files will create a cycle」，AGENTS.md:7-9 也說明 `@CLAUDE.md` 是單向 import — 這種防呆註解少見且有用 [SOURCE: CLAUDE.md:1-3, AGENTS.md:7-9]。
- **PROJECT.md 簡潔且 stable**：純需求 spec，跟 code 沒有耦合，不會 drift。Evaluation Criteria 細到百分比，學期專案視角清楚 [SOURCE: PROJECT.md:1-32]。
- **`.claude/rules/git.md` commit scope 表完整**：定義 9 個 scope（orders / cart / menu / vendor / admin / auth / ui / db / deps），跟實際 commit history（git log）吻合 [SOURCE: .claude/rules/git.md:33-50, git log --oneline]。
- **docs/research/2026-03-28-food-recommendation-survey.md 引用完整**：每個業界 / 學術 claim 都附 link 到一手來源（Uber blog、arXiv、PMC 論文），是 source-first 範本 [SOURCE: docs/research/2026-03-28-food-recommendation-survey.md:55, :62, :84]。
