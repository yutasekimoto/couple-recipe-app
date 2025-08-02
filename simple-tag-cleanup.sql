-- シンプルなタグクリーンアップ

-- 現在のタグ状況を確認
SELECT name, COUNT(*) as count, STRING_AGG(id::text, ', ') as ids
FROM recipe_tags 
GROUP BY name 
ORDER BY count DESC;

-- 手動で重複を削除（必要に応じて以下を実行）
-- 例: 「特別」タグが複数ある場合、最初の1つ以外を削除
-- DELETE FROM recipe_tag_relations WHERE tag_id IN (選択したID);
-- DELETE FROM recipe_tags WHERE id IN (選択したID);