-- meal_plansテーブルのRLSポリシー修正
-- 夫婦向けレシピ・献立共有アプリ

-- 既存のRLSポリシーを削除
DROP POLICY IF EXISTS "Users can manage own meal plans and paired user meal plans" ON meal_plans;

-- 修正されたRLSポリシー: meal_plans テーブル
-- 認証済みユーザーがペアリング済みの場合、双方のmeal_plansにアクセス可能
CREATE POLICY "Users can manage meal plans for paired users" ON meal_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.auth_id = auth.uid()::text 
      AND (
        meal_plans.user_id = u.id OR 
        meal_plans.user_id = u.paired_with OR
        u.paired_with IS NOT NULL
      )
    )
  );

-- また、meal_plansテーブルのunique制約を削除して複数メニュー対応
-- 既存の制約を削除
ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_user_id_date_meal_type_key;

-- 新しいカラムを追加（順序管理用）
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_meal_plans_date_type_order ON meal_plans(date, meal_type, sort_order);