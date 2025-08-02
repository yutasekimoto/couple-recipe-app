-- 最終的な重複タグクリーンアップ
-- より確実な方法で重複タグを削除

-- ステップ1: 重複タグを特定
WITH duplicate_tags AS (
  SELECT 
    name,
    MIN(id) as keep_id,
    COUNT(*) as duplicate_count
  FROM recipe_tags 
  GROUP BY name 
  HAVING COUNT(*) > 1
),
-- ステップ2: 削除すべきタグIDを特定
tags_to_delete AS (
  SELECT rt.id
  FROM recipe_tags rt
  JOIN duplicate_tags dt ON rt.name = dt.name
  WHERE rt.id != dt.keep_id
)
-- ステップ3: 関連するタグリレーションを削除
DELETE FROM recipe_tag_relations 
WHERE tag_id IN (SELECT id FROM tags_to_delete);

-- ステップ4: 重複タグを削除
WITH duplicate_tags AS (
  SELECT 
    name,
    MIN(id) as keep_id
  FROM recipe_tags 
  GROUP BY name 
  HAVING COUNT(*) > 1
)
DELETE FROM recipe_tags 
WHERE id NOT IN (
  SELECT DISTINCT
    CASE 
      WHEN rt.id = dt.keep_id THEN rt.id
      ELSE NULL
    END
  FROM recipe_tags rt
  LEFT JOIN duplicate_tags dt ON rt.name = dt.name AND rt.id = dt.keep_id
  WHERE rt.id = dt.keep_id OR dt.keep_id IS NULL
);

-- 確認用クエリ
SELECT name, COUNT(*) as count 
FROM recipe_tags 
GROUP BY name 
ORDER BY count DESC, name;