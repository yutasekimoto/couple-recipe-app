-- 重複タグの修正とRLSポリシー再設定

-- まず、重複タグをクリーンアップ
-- 同じ名前のタグが複数ある場合、最初のものを残して削除
WITH duplicate_tags AS (
  SELECT name, MIN(id) as keep_id, ARRAY_AGG(id) as all_ids
  FROM recipe_tags 
  GROUP BY name 
  HAVING COUNT(*) > 1
)
DELETE FROM recipe_tags 
WHERE id IN (
  SELECT unnest(all_ids) 
  FROM duplicate_tags 
  WHERE unnest(all_ids) NOT IN (SELECT keep_id FROM duplicate_tags)
);

-- RLSポリシーの再設定
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tag_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can view own and paired recipes" ON recipes;
DROP POLICY IF EXISTS "Users can view own and paired tags" ON recipe_tags;
DROP POLICY IF EXISTS "Users can manage own and paired tag relations" ON recipe_tag_relations;
DROP POLICY IF EXISTS "Users can view own and paired meal plans" ON meal_plans;

-- シンプルなアクセスポリシーを設定（すべてのユーザーが読み書き可能）
CREATE POLICY "Allow all access to recipes" ON recipes FOR ALL USING (true);
CREATE POLICY "Allow all access to recipe_tags" ON recipe_tags FOR ALL USING (true);
CREATE POLICY "Allow all access to recipe_tag_relations" ON recipe_tag_relations FOR ALL USING (true);
CREATE POLICY "Allow all access to meal_plans" ON meal_plans FOR ALL USING (true);