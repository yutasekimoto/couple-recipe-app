-- フォルダシステムをタグシステムに変更
-- 夫婦向けレシピ・献立共有アプリ

-- 既存のフォルダ関連テーブルとポリシーを削除
DROP POLICY IF EXISTS "Users can manage own folders and paired user folders" ON recipe_folders;
DROP POLICY IF EXISTS "Users can manage recipe folder relations" ON recipe_folder_relations;

DROP TABLE IF EXISTS recipe_folder_relations;
DROP TABLE IF EXISTS recipe_folders;

-- タグテーブルを作成
CREATE TABLE recipe_tags (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#4F8BE8',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, name)
);

-- レシピとタグの関連テーブル
CREATE TABLE recipe_tag_relations (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES recipe_tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(recipe_id, tag_id)
);

-- RLS有効化
ALTER TABLE recipe_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tag_relations ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: recipe_tags テーブル
CREATE POLICY "Users can manage own tags and paired user tags" ON recipe_tags
  FOR ALL USING (
    user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()::text
      UNION
      SELECT paired_with FROM users WHERE auth_id = auth.uid()::text AND paired_with IS NOT NULL
    )
  )
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid()::text)
  );

-- RLSポリシー: recipe_tag_relations テーブル
CREATE POLICY "Users can manage recipe tag relations" ON recipe_tag_relations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM recipes r
      JOIN users u ON u.auth_id = auth.uid()::text
      WHERE recipe_tag_relations.recipe_id = r.id
      AND (r.user_id = u.id OR r.user_id = u.paired_with)
    )
  );

-- インデックス作成
CREATE INDEX idx_recipe_tags_user_id ON recipe_tags(user_id);
CREATE INDEX idx_recipe_tags_name ON recipe_tags(name);
CREATE INDEX idx_recipe_tag_relations_recipe_id ON recipe_tag_relations(recipe_id);
CREATE INDEX idx_recipe_tag_relations_tag_id ON recipe_tag_relations(tag_id);

-- updated_atトリガー
CREATE TRIGGER update_recipe_tags_updated_at BEFORE UPDATE ON recipe_tags
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 各ユーザーにデフォルトタグを作成
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN SELECT id FROM users LOOP
        -- 簡単うまいタグ
        INSERT INTO recipe_tags (user_id, name, color) 
        VALUES (user_record.id, '簡単うまい', '#4F8BE8')
        ON CONFLICT (user_id, name) DO NOTHING;
        
        -- 定番タグ
        INSERT INTO recipe_tags (user_id, name, color) 
        VALUES (user_record.id, '定番', '#28A745')
        ON CONFLICT (user_id, name) DO NOTHING;
        
        -- 特別タグ
        INSERT INTO recipe_tags (user_id, name, color) 
        VALUES (user_record.id, '特別', '#E85A4F')
        ON CONFLICT (user_id, name) DO NOTHING;
    END LOOP;
END $$;