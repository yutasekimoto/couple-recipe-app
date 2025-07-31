-- レシピテーブルの手間レベルを所要時間（分）に変更
-- 夫婦向けレシピ・献立共有アプリ

-- 既存のeffort_level列を削除
ALTER TABLE recipes DROP COLUMN IF EXISTS effort_level;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS check_effort_level;

-- 所要時間列を追加（分単位、15分刻み、最大120分、デフォルト15分）
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooking_time_minutes INTEGER DEFAULT 15;

-- 所要時間の制約を追加（15-120分の範囲、15分刻み）
ALTER TABLE recipes ADD CONSTRAINT check_cooking_time CHECK (cooking_time_minutes >= 15 AND cooking_time_minutes <= 120 AND cooking_time_minutes % 15 = 0);

-- 既存データのデフォルト値設定（必要に応じて）
UPDATE recipes SET cooking_time_minutes = 15 WHERE cooking_time_minutes IS NULL;