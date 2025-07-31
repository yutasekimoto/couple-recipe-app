-- レシピテーブルに手間レベル列を追加
-- 夫婦向けレシピ・献立共有アプリ

-- 手間レベル列を追加（1: 簡単, 2: 普通, 3: 手間）
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS effort_level INTEGER DEFAULT 1;

-- 手間レベルの制約を追加（1-3の範囲）
ALTER TABLE recipes ADD CONSTRAINT check_effort_level CHECK (effort_level >= 1 AND effort_level <= 3);

-- 既存データのデフォルト値設定（必要に応じて）
UPDATE recipes SET effort_level = 1 WHERE effort_level IS NULL;