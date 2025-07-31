-- 担当割り振り機能のためのスキーマ更新
-- meal_plansテーブルに担当者フィールドを追加

-- meal_plansテーブルにassigned_toカラムを追加
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS assigned_to UUID;

-- 外部キー制約を追加（担当者はusersテーブルのidを参照）
ALTER TABLE meal_plans 
ADD CONSTRAINT fk_meal_plans_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES users(id) 
ON DELETE SET NULL;

-- インデックス追加（検索用）
CREATE INDEX IF NOT EXISTS idx_meal_plans_assigned_to ON meal_plans(assigned_to);

-- コメント追加
COMMENT ON COLUMN meal_plans.assigned_to IS '献立の担当者（usersテーブルのidを参照）';