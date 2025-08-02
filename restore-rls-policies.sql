-- RLSポリシーの再設定
-- データアクセス復旧後、適切なセキュリティポリシーを再設定

-- recipesテーブルのRLS再有効化とポリシー設定
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- 自分または自分とペアの相手が作成したレシピのみ表示・編集可能
CREATE POLICY "Users can view own and paired recipes" ON recipes
FOR ALL USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR 
  user_id IN (
    SELECT paired_with FROM users WHERE auth_id = auth.uid()
    UNION
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
);

-- recipe_tagsテーブルのRLS再有効化とポリシー設定
ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and paired tags" ON recipe_tags
FOR ALL USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR 
  user_id IN (
    SELECT paired_with FROM users WHERE auth_id = auth.uid()
    UNION
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
);

-- recipe_tag_relationsテーブルのRLS再有効化とポリシー設定
ALTER TABLE recipe_tag_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own and paired tag relations" ON recipe_tag_relations
FOR ALL USING (
  recipe_id IN (
    SELECT id FROM recipes WHERE 
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    OR 
    user_id IN (
      SELECT paired_with FROM users WHERE auth_id = auth.uid()
      UNION
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  )
);

-- meal_plansテーブルのRLS再有効化とポリシー設定
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own and paired meal plans" ON meal_plans
FOR ALL USING (
  user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  OR 
  user_id IN (
    SELECT paired_with FROM users WHERE auth_id = auth.uid()
    UNION
    SELECT id FROM users WHERE auth_id = auth.uid()
  )
);