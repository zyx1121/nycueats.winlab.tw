# 餐點推薦系統 — 文獻調查

> 調查日期：2026-03-28
> 對應 Issue：#6 feat(menu): 餐點推薦引擎

## 背景

為 NYCU Eats 訂餐平台設計推薦引擎，需調查業界做法與學術研究，決定適合的技術方案。

---

## 一、經典推薦方法

### 1. Content-Based Filtering（基於內容）

根據品項屬性（標籤、營養、價格、描述）計算相似度，推薦與用戶歷史偏好相似的品項。

- **技術**：TF-IDF + Cosine Similarity
- **優點**：不需要其他用戶資料，新品項馬上能推薦
- **缺點**：推薦範圍窄，只推用戶吃過的類型（filter bubble）
- **適用場景**：品項有豐富屬性標註時

### 2. Collaborative Filtering（協同過濾）

分析「相似用戶的行為」推薦品項（如：吃過 A 的人也愛 B）。

- **技術**：KNN、SVD（矩陣分解）、ALS
- **優點**：能發現意外驚喜，不需要品項屬性
- **缺點**：冷啟動問題（新用戶 / 新品項沒有互動資料）
- **適用場景**：有大量用戶行為資料時

### 3. Hybrid（混合式）

結合 Content-Based 與 Collaborative Filtering，互補缺點。

- **實作方式**：
  - Feature Combination：將 CF 結果作為 CB 的額外特徵
  - Cascade：先粗篩再精排
  - Mixed：並行產生推薦後合併
- **文獻**：Hybrid 模型在處理冷啟動問題上優於純 CBF 和 CF（[Tandfonline 2024](https://www.tandfonline.com/doi/full/10.1080/23311916.2024.2436125)）

---

## 二、業界實務

### Uber Eats — Two-Tower Embeddings

- **架構**：候選檢索（Candidate Retrieval）→ 候選排序（Candidate Ranking）
- **核心**：Two-Tower Model
  - Query Tower：編碼用戶（歷史訂單、位置、時段）
  - Item Tower：編碼餐廳（菜單、價位、評價）
  - 推薦 = 兩個向量的 cosine similarity
- **額外技術**：Graph Learning（挖掘食物關聯網路）、Multi-Objective Optimization（平衡用戶 vs 商家 vs 多樣性）
- **規模**：數億用戶、數百萬餐廳
- **來源**：[Uber Engineering Blog](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/)

### iFood — Embedding + LightGBM

- **架構**：Two-Tower 產生 item embedding → LightGBM 排序
- **特色**：可複用 item embedding（搜尋和推薦共用）
- **規模**：拉丁美洲最大外送平台
- **來源**：[arXiv 2025](https://arxiv.org/html/2508.03670v1)

### 中小平台常見做法

- TF-IDF + Cosine Similarity（基於菜單描述）
- KNN + SVD Hybrid（基於用戶評分）
- 規則引擎（銷量、時段、天氣）

---

## 三、2024-2025 新趨勢

### LLM 整合推薦

- 用 LLM（ChatGPT/Claude）理解自然語言偏好，結合 API 動態取資料
- 優勢：不需要 feature engineering，語意理解能力強
- 論文：[An Integrated Framework for Contextual Personalized LLM-based Recommendation](https://arxiv.org/pdf/2504.20092)（UCI, 2025）

### 營養導向推薦

- AI 飲食推薦論文在 2023-2024 爆發（7/11 篇發表於此期間）
- 結合用戶健康目標（減重、增肌、控糖）推薦餐點
- 綜述：[AI Applications to Personalized Dietary Recommendations](https://pmc.ncbi.nlm.nih.gov/articles/PMC12193492/)

### 強化學習

- 用 SARSA、DQN 等演算法做長期飲食均衡優化
- 不只推薦當下好吃的，還考慮整週營養攝取
- 論文：[Population-Level Analysis Using Reinforcement Learning](https://www.mdpi.com/2304-8158/14/21/3770)

---

## 四、我們的技術方案

### 系統規模

- 用戶：數百～數千人（單一企業）
- 商家：5-20 家
- 餐點：50-200 道

### 建議方案：Content-Based + Rule-Based + LLM

#### 階段一：Rule-Based + Content-Based（零成本）

| 推薦類型 | 資料來源 | 邏輯 |
|----------|----------|------|
| 熱銷排行 | `order_items` 訂單量 | 近 7 天銷量 Top N |
| 營養推薦 | `menu_items` 營養欄位 | 依卡路里 / 蛋白質 / 鈉含量排序 |
| 隨機探索 | `menu_items` 全量 | 每日隨機推薦，避免 filter bubble |
| 標籤匹配 | `menu_items.tags` | 基於用戶歷史訂單的 tags 頻率 |

#### 階段二：LLM 智慧推薦（展示亮點）

- 用戶輸入自然語言偏好（「我想吃清淡的」「高蛋白低鈉」「不要太貴」）
- LLM 解析意圖 → 轉成 tag/營養 filter
- 回傳推薦列表 + 推薦理由
- 一次 API call，成本低

### 需要的 DB 變更

- `menu_items` 新增 `tags: text[]`（自由標籤，AI 可理解語意）
- 商家後台需要編輯 tags 的 UI

### 方案優勢

1. **學術基礎**：Content-Based + Hybrid 是經典方法，有大量文獻支撐
2. **AI 亮點**：LLM 自然語言推薦，demo 效果好
3. **務實可行**：不需要 ML pipeline、不需要大量訓練資料
4. **可擴充**：未來可加入 collaborative filtering（當用戶量足夠時）

---

## 五、參考文獻

### 業界

- [Innovative Recommendation Applications Using Two Tower Embeddings at Uber](https://www.uber.com/blog/innovative-recommendation-applications-using-two-tower-embeddings/) — Uber Engineering Blog
- [Food Discovery with Uber Eats: Using Graph Learning](https://www.uber.com/blog/uber-eats-graph-learning/) — Uber Engineering Blog
- [Improving Uber Eats Home Feed Recommendations](https://www.uber.com/blog/improving-uber-eats-home-feed-recommendations/) — Uber Engineering Blog
- [Personalized Recommendation of Dish and Restaurant Collections on iFood](https://arxiv.org/html/2508.03670v1) — arXiv 2025

### 學術論文

- [An Integrated Framework for Contextual Personalized LLM-based Recommendation](https://arxiv.org/pdf/2504.20092) — UCI, 2025
- [Hybrid-based Food Recommender System Utilizing KNN and SVD](https://www.tandfonline.com/doi/full/10.1080/23311916.2024.2436125) — Cogent Engineering, 2024
- [AI Applications to Personalized Dietary Recommendations: A Systematic Review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12193492/) — PMC, 2024
- [Population-Level Analysis of Personalized Food Recommendation Using RL](https://www.mdpi.com/2304-8158/14/21/3770) — MDPI Foods, 2024
- [In-depth Survey: Deep Learning in Recommender Systems](https://link.springer.com/article/10.1007/s00521-024-10866-z) — Springer, 2024
- [Food Delivery with Recommendation System](https://ijarcce.com/wp-content/uploads/2025/05/IJARCCE.2025.14596.pdf) — IJARCCE, 2025
- [Food Ordering System in University Campus - YuvEats](https://www.ijnrd.org/papers/IJNRD2405668.pdf) — IJNRD

### 相關開源專案

- [llm-food-delivery](https://github.com/lucastononro/llm-food-delivery) — LLM-based food delivery recommendation
- [Hybrid-Restaurant-Recommender](https://github.com/poolkit/Hybrid-Restaurant-Recommender) — KNN + SVD hybrid approach
