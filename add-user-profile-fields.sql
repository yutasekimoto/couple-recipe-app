-- ユーザープロフィール機能のためのスキーマ更新
-- ニックネームと役割（夫/妻）フィールドを追加

-- usersテーブルにnicknameとroleカラムを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(10) CHECK (role IN ('husband', 'wife'));

-- 既存のdisplay_nameをnicknameにマイグレーション（既存データがある場合）
UPDATE users SET nickname = display_name WHERE nickname IS NULL AND display_name IS NOT NULL;

-- インデックス追加（検索用）
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- コメント追加
COMMENT ON COLUMN users.nickname IS 'ユーザーのニックネーム';
COMMENT ON COLUMN users.role IS 'ユーザーの役割（husband: 夫, wife: 妻）';