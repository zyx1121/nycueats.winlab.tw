# 測試帳號

本文件記錄在 Supabase staging/prod DB 上手動建立的測試帳號，供開發與 QA 驗証使用。

> **注意**：測試帳號密碼不應出現在 git 歷史中。若需要密碼請向專案維護者索取，或自行在 Supabase Dashboard 重設。

---

## 登入方式

專案使用 Supabase Email/Password 驗証（以及 Google OAuth）。
Email 登入的測試帳號可直接在登入頁輸入 email + 密碼。

---

## 帳號列表

| 角色 | Email | 名稱 | 備註 |
|------|-------|------|------|
| `user` + `admin` | `admin.test@nycueats.dev` | 輔委會管理員 | 手動建立於 2026-04-15，供 /admin 功能測試 |
| `vendor` + `admin` | `morning.bites@nycueats.dev` | 晨光早餐 | 同時具有商家與管理員權限 |
| `admin` | `test.admin@nycueats.dev` | （未設定） | 舊測試帳號，名稱未設定 |

---

## E2E 自動化帳號

E2E 測試（Playwright）使用的帳號由 GitHub Actions Secrets 管理：

| Secret 名稱 | 說明 |
|------------|------|
| `E2E_EMAIL` | E2E 測試登入 email |
| `E2E_PASSWORD` | E2E 測試登入密碼 |

本地執行 E2E 時需在 `.env.local` 加上：

```env
E2E_EMAIL=<email>
E2E_PASSWORD=<password>
```

---

## 建立新測試帳號

可透過 Supabase MCP 執行以下 SQL（在 DO block 裡自動 trigger 建立 profile）：

```sql
DO $$
DECLARE
  new_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    role, aud,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new
  ) VALUES (
    new_uid,
    '00000000-0000-0000-0000-000000000000',
    '<email>',
    crypt('<password>', gen_salt('bf')),
    now(), now(), now(),
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}',
    '{"name":"<顯示名稱>"}',
    '', '', ''
  );

  UPDATE profiles
  SET role = ARRAY['user', '<role>'], name = '<顯示名稱>'
  WHERE id = new_uid;
END $$;
```
