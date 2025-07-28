-- RLSポリシー修正スクリプト
-- 夫婦向けレシピ・献立共有アプリ

-- 既存のRLSポリシーを削除
drop policy if exists "Users can read own profile and paired user" on users;
drop policy if exists "Users can update own profile" on users;
drop policy if exists "Users can insert own profile" on users;
drop policy if exists "Users can manage own folders and paired user folders" on recipe_folders;
drop policy if exists "Users can manage own recipes and paired user recipes" on recipes;
drop policy if exists "Users can manage recipe folder relations" on recipe_folder_relations;
drop policy if exists "Users can manage own meal plans and paired user meal plans" on meal_plans;

-- 修正されたRLSポリシー: users テーブル
create policy "Enable all access for authenticated users" on users
  for all using (auth.role() = 'authenticated');

-- 修正されたRLSポリシー: recipe_folders テーブル
create policy "Users can manage own folders and paired user folders" on recipe_folders
  for all using (
    exists (
      select 1 from users u 
      where u.auth_id = auth.uid()::text 
      and (recipe_folders.user_id = u.id or recipe_folders.user_id = u.paired_with)
    )
  );

-- 修正されたRLSポリシー: recipes テーブル
create policy "Users can manage own recipes and paired user recipes" on recipes
  for all using (
    exists (
      select 1 from users u 
      where u.auth_id = auth.uid()::text 
      and (recipes.user_id = u.id or recipes.user_id = u.paired_with)
    )
  );

-- 修正されたRLSポリシー: recipe_folder_relations テーブル
create policy "Users can manage recipe folder relations" on recipe_folder_relations
  for all using (
    exists (
      select 1 from recipes r
      join users u on u.auth_id = auth.uid()::text
      where recipe_folder_relations.recipe_id = r.id
      and (r.user_id = u.id or r.user_id = u.paired_with)
    )
  );

-- 修正されたRLSポリシー: meal_plans テーブル
create policy "Users can manage own meal plans and paired user meal plans" on meal_plans
  for all using (
    exists (
      select 1 from users u 
      where u.auth_id = auth.uid()::text 
      and (meal_plans.user_id = u.id or meal_plans.user_id = u.paired_with)
    )
  );