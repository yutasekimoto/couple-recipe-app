# 夫婦向けレシピ・献立共有アプリ セットアップ手順書

## 概要
このドキュメントでは、夫婦向けレシピ・献立共有アプリのセットアップ手順を説明します。

## 前提条件
- Supabaseアカウント（無料プランで十分）
- モダンなWebブラウザ（Chrome、Firefox、Safari、Edge等）
- テキストエディタ（VS Code推奨）

## 1. Supabaseプロジェクトの作成

### 1.1 Supabaseアカウント作成・ログイン
1. https://supabase.com にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ・ログイン

### 1.2 新しいプロジェクトを作成
1. ダッシュボードで「New project」をクリック
2. 以下の情報を入力：
   - Organization: 既存のものを選択
   - Name: `couple-recipe-app`（任意）
   - Database Password: 強力なパスワードを生成・保存
   - Region: `Northeast Asia (Tokyo)`（日本の場合）
3. 「Create new project」をクリック
4. プロジェクトの初期化完了まで約2-3分待機

## 2. データベースのセットアップ

### 2.1 データベーススキーマの作成
1. Supabaseダッシュボードの左メニューから「SQL Editor」を選択
2. 「New query」をクリック
3. `database-setup.sql`ファイルの内容をコピー&ペーストします：

```sql
-- 夫婦向けレシピ・献立共有アプリ データベースセットアップ

-- 拡張機能の有効化
create extension if not exists "uuid-ossp";

-- ユーザーテーブル
create table users (
  id uuid default uuid_generate_v4() primary key,
  auth_id text unique not null,
  display_name text,
  pair_code text unique,
  paired_with uuid references users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- レシピフォルダテーブル
create table recipe_folders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  color text default '#E85A4F',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- レシピテーブル
create table recipes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) on delete cascade not null,
  title text not null,
  description text,
  recipe_url text,
  cooking_time integer,
  servings integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- レシピとフォルダの関連テーブル
create table recipe_folder_relations (
  id uuid default uuid_generate_v4() primary key,
  recipe_id uuid references recipes(id) on delete cascade not null,
  folder_id uuid references recipe_folders(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(recipe_id, folder_id)
);

-- 献立テーブル
create table meal_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id) on delete cascade not null,
  date date not null,
  meal_type text check (meal_type in ('lunch', 'dinner')) not null,
  recipe_id uuid references recipes(id) on delete cascade,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, date, meal_type)
);

-- Row Level Security (RLS) の有効化
alter table users enable row level security;
alter table recipe_folders enable row level security;
alter table recipes enable row level security;
alter table recipe_folder_relations enable row level security;
alter table meal_plans enable row level security;

-- RLS ポリシー: users テーブル
create policy "Users can read own profile and paired user" on users
  for select using (
    auth_id = auth.uid()::text or 
    id = (select paired_with from users where auth_id = auth.uid()::text)
  );

create policy "Users can update own profile" on users
  for update using (auth_id = auth.uid()::text);

create policy "Users can insert own profile" on users
  for insert with check (auth_id = auth.uid()::text);

-- RLS ポリシー: recipe_folders テーブル
create policy "Users can manage own folders and paired user folders" on recipe_folders
  for all using (
    user_id = (select id from users where auth_id = auth.uid()::text) or
    user_id = (select paired_with from users where auth_id = auth.uid()::text)
  );

-- RLS ポリシー: recipes テーブル
create policy "Users can manage own recipes and paired user recipes" on recipes
  for all using (
    user_id = (select id from users where auth_id = auth.uid()::text) or
    user_id = (select paired_with from users where auth_id = auth.uid()::text)
  );

-- RLS ポリシー: recipe_folder_relations テーブル
create policy "Users can manage recipe folder relations" on recipe_folder_relations
  for all using (
    recipe_id in (
      select id from recipes where 
      user_id = (select id from users where auth_id = auth.uid()::text) or
      user_id = (select paired_with from users where auth_id = auth.uid()::text)
    )
  );

-- RLS ポリシー: meal_plans テーブル
create policy "Users can manage own meal plans and paired user meal plans" on meal_plans
  for all using (
    user_id = (select id from users where auth_id = auth.uid()::text) or
    user_id = (select paired_with from users where auth_id = auth.uid()::text)
  );

-- インデックスの作成（パフォーマンス向上）
create index idx_users_auth_id on users(auth_id);
create index idx_users_pair_code on users(pair_code);
create index idx_recipe_folders_user_id on recipe_folders(user_id);
create index idx_recipes_user_id on recipes(user_id);
create index idx_recipe_folder_relations_recipe_id on recipe_folder_relations(recipe_id);
create index idx_recipe_folder_relations_folder_id on recipe_folder_relations(folder_id);
create index idx_meal_plans_user_id on meal_plans(user_id);
create index idx_meal_plans_date on meal_plans(date);

-- updated_at を自動更新するトリガー関数
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- updated_at トリガーの作成
create trigger update_users_updated_at before update on users
  for each row execute procedure update_updated_at_column();

create trigger update_recipe_folders_updated_at before update on recipe_folders
  for each row execute procedure update_updated_at_column();

create trigger update_recipes_updated_at before update on recipes
  for each row execute procedure update_updated_at_column();

-- ペアリングコード生成関数
create or replace function generate_pair_code()
returns text as $$
declare
  code text;
  exists_check boolean;
begin
  loop
    -- 6桁のランダム数字を生成
    code := lpad((random() * 999999)::int::text, 6, '0');
    
    -- 既存のコードと重複していないかチェック
    select exists(select 1 from users where pair_code = code) into exists_check;
    
    if not exists_check then
      return code;
    end if;
  end loop;
end;
$$ language plpgsql;
```

4. 「RUN」ボタンをクリックしてスクリプトを実行
5. 「Success. No rows returned」と表示されればOK

### 2.2 サンプルデータの挿入（オプショナル）
開発・テスト用にサンプルデータを挿入する場合：

```sql
-- デモ用ユーザー（認証なしの場合の仮想ユーザー）
insert into users (id, auth_id, display_name, pair_code) values 
  ('550e8400-e29b-41d4-a716-446655440001', 'demo_user_1', 'ユーザー1', '123456'),
  ('550e8400-e29b-41d4-a716-446655440002', 'demo_user_2', 'ユーザー2', '654321');

-- ペアリング設定
update users set paired_with = '550e8400-e29b-41d4-a716-446655440002' 
where id = '550e8400-e29b-41d4-a716-446655440001';

update users set paired_with = '550e8400-e29b-41d4-a716-446655440001' 
where id = '550e8400-e29b-41d4-a716-446655440002';

-- デモ用フォルダ
insert into recipe_folders (user_id, name, color) values 
  ('550e8400-e29b-41d4-a716-446655440001', '簡単で美味い', '#4F8BE8'),
  ('550e8400-e29b-41d4-a716-446655440001', '手間かかるけど美味い', '#E85A4F'),
  ('550e8400-e29b-41d4-a716-446655440001', '平日向け', '#28a745');

-- デモ用レシピ
insert into recipes (user_id, title, description, recipe_url, cooking_time, servings) values 
  ('550e8400-e29b-41d4-a716-446655440001', 'チキンカレー', '簡単で美味しいチキンカレー', 'https://www.instagram.com/p/example1/', 30, 4),
  ('550e8400-e29b-41d4-a716-446655440001', 'パスタ', 'トマトソースパスタ', 'https://www.youtube.com/watch?v=example1', 20, 2),
  ('550e8400-e29b-41d4-a716-446655440002', 'オムライス', 'ふわふわオムライス', 'https://www.instagram.com/p/example2/', 25, 2);
```

## 3. アプリケーションの設定

### 3.1 Supabase認証情報の取得
1. Supabaseダッシュボードの左メニューから「Settings」→「API」を選択
2. 以下の情報をコピーして保存：
   - Project URL
   - anon public key

### 3.2 設定ファイルの更新
`config.js`ファイルの以下の部分を、取得した情報で更新：

```javascript
// Supabase接続設定
const SUPABASE_URL = 'あなたのProject URL';
const SUPABASE_ANON_KEY = 'あなたのanon public key';
```

## 4. アプリケーションの起動

### 4.1 ローカルサーバーの起動
以下のいずれかの方法でローカルサーバーを起動：

#### 方法1: Python（推奨）
```bash
# プロジェクトディレクトリに移動
cd couple-recipe-app

# Pythonサーバーを起動
python -m http.server 8000
```

#### 方法2: Node.js (Live Server)
```bash
# 必要であればlive-serverをインストール
npm install -g live-server

# プロジェクトディレクトリに移動
cd couple-recipe-app

# Live Serverを起動
live-server
```

#### 方法3: VS Code Live Server拡張機能
1. VS Codeで「Live Server」拡張機能をインストール
2. `index.html`を右クリック
3. 「Open with Live Server」を選択

### 4.2 ブラウザでアクセス
1. ブラウザで `http://localhost:8000` にアクセス
2. アプリケーションが正常に表示されることを確認

## 5. アプリケーションの使用方法

### 5.1 初回セットアップ
1. アプリを開くと自動的に匿名認証が実行されます
2. ペアリング画面が表示されます

### 5.2 ペアリング（夫婦間連携）
**パートナー1（コード生成側）:**
1. 「コードを生成する」ボタンをクリック
2. 6桁のペアリングコードが表示されます
3. このコードをパートナーに伝えます

**パートナー2（コード入力側）:**
1. 「コードを入力する」ボタンをクリック
2. 伝えられた6桁のコードを入力
3. 「ペアリング」ボタンをクリック

### 5.3 基本的な使い方
1. **レシピ追加**: 「レシピ追加」ボタンからInstagram/YouTubeのURLと共にレシピを登録
2. **フォルダ分類**: 「簡単で美味い」「手間かかるけど美味い」などでレシピを分類
3. **献立計画**: カレンダータブで日付ごとに昼・夜の献立を計画
4. **検索**: レシピ検索バーでタイトルや説明で検索可能

## 6. トラブルシューティング

### 6.1 よくある問題

#### ペアリングができない
- **原因**: ネットワーク接続の問題、またはSupabaseサービスの一時的な障害
- **解決策**: 
  1. インターネット接続を確認
  2. ブラウザを再読み込み（F5）
  3. 別のブラウザで試行

#### レシピが保存されない
- **原因**: Supabaseの設定ミス、またはRLSポリシーの問題
- **解決策**:
  1. Supabaseダッシュボードでテーブルが正しく作成されているか確認
  2. `config.js`のSupabase設定を再確認
  3. ブラウザの開発者ツール（F12）でエラーメッセージを確認

#### 画面が表示されない
- **原因**: JavaScriptエラー、またはファイルパスの問題
- **解決策**:
  1. ブラウザの開発者ツール（F12）でコンソールエラーを確認
  2. ローカルサーバーが正しく起動しているか確認
  3. ファイル構成が正しいか確認

### 6.2 開発者向けデバッグ
1. ブラウザの開発者ツール（F12）を開く
2. Consoleタブでエラーメッセージを確認
3. Networkタブでサーバーとの通信状況を監視
4. 必要に応じてSupabaseダッシュボードでデータベースの状態を確認

## 7. 本番環境へのデプロイ（オプション）

### 7.1 Netlify（推奨）
1. GitHubにコードをプッシュ
2. Netlifyアカウントを作成
3. 「New site from Git」でリポジトリを連携
4. 自動デプロイ設定完了

### 7.2 Vercel
1. GitHubにコードをプッシュ
2. Vercelアカウントを作成
3. プロジェクトをインポート
4. 自動デプロイ設定完了

## 8. 今後の機能拡張

このアプリは以下の機能拡張が可能です：
- 買い物メモ機能
- レシピの共有機能（SNS連携）
- 栄養価計算機能
- 予算管理機能
- レシピレコメンド機能
- 音声入力対応

## サポート

問題が解決しない場合は、以下の情報と共にお問い合わせください：
- 使用ブラウザとバージョン
- エラーメッセージの内容
- 実行した操作の詳細
- 開発者ツールのコンソールログ