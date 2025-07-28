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

-- サンプルデータの挿入（開発用）
-- 注意: 本番環境では削除してください

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