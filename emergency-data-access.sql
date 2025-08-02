-- 緊急データアクセス復旧用SQL
-- 既存レシピへのアクセスを復旧するため、一時的にRLSポリシーを緩和

-- recipesテーブルのRLSを一時的に無効化（既存データへのアクセスを許可）
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;

-- recipe_tagsテーブルのRLSを一時的に無効化
ALTER TABLE recipe_tags DISABLE ROW LEVEL SECURITY;

-- recipe_tag_relationsテーブルのRLSを一時的に無効化
ALTER TABLE recipe_tag_relations DISABLE ROW LEVEL SECURITY;

-- meal_plansテーブルのRLSを一時的に無効化
ALTER TABLE meal_plans DISABLE ROW LEVEL SECURITY;

-- 注意: このスクリプトは一時的な措置です
-- データ復旧後は適切なRLSポリシーを再設定する必要があります