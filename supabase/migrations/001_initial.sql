-- ============================================================================
-- TikTok AI動画メディア管理アプリ 初期マイグレーション
-- planning/mvp-plan.md 「5. データベース設計」に基づく
-- 全テーブルに user_id (FK -> auth.users.id) を持たせ、RLSでユーザー単位に分離する
-- ============================================================================

-- 拡張機能: gen_random_uuid() を使用するため
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- accounts（SNSアカウント管理）
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'youtube_shorts', 'instagram_reels', 'youtube', 'instagram', 'twitter', 'note')),
  account_name text not null,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_user_id on public.accounts(user_id);

-- ----------------------------------------------------------------------------
-- genres（ジャンル）
-- ----------------------------------------------------------------------------
create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_genres_user_id on public.genres(user_id);

-- ----------------------------------------------------------------------------
-- ideas（動画ネタ）
-- ----------------------------------------------------------------------------
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  genre_id uuid references public.genres(id) on delete set null,
  title text not null,
  description text,
  score int check (score is null or (score >= 0 and score <= 100)),
  score_reason text,
  duplicate_flag boolean not null default false,
  status text not null default 'candidate' check (status in ('candidate', 'selected', 'approved', 'rejected')),
  source text check (source is null or source in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ideas_user_id on public.ideas(user_id);
create index if not exists idx_ideas_genre_id on public.ideas(genre_id);

-- ----------------------------------------------------------------------------
-- scripts（台本）
-- ----------------------------------------------------------------------------
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  version int not null default 1,
  hook text,
  narration text,
  structure jsonb,
  video_prompt text,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  is_approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_scripts_user_id on public.scripts(user_id);
create index if not exists idx_scripts_idea_id on public.scripts(idea_id);

-- ----------------------------------------------------------------------------
-- production_tasks（制作ボード）
-- ----------------------------------------------------------------------------
create table if not exists public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  status text not null default 'planning' check (status in ('planning', 'script', 'producing', 'review', 'done')),
  assignee_memo text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_tasks_user_id on public.production_tasks(user_id);
create index if not exists idx_production_tasks_idea_id on public.production_tasks(idea_id);

-- ----------------------------------------------------------------------------
-- schedules（投稿カレンダー）
-- ----------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'published', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_schedules_user_id on public.schedules(user_id);
create index if not exists idx_schedules_idea_id on public.schedules(idea_id);
create index if not exists idx_schedules_account_id on public.schedules(account_id);

-- ----------------------------------------------------------------------------
-- assets（動画・素材管理）
-- ----------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  video_url text,
  thumbnail_url text,
  audio_url text,
  image_urls jsonb,
  subtitle_text text,
  rights_checked boolean not null default false,
  is_approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_user_id on public.assets(user_id);
create index if not exists idx_assets_idea_id on public.assets(idea_id);

-- ----------------------------------------------------------------------------
-- posts（投稿実績）
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  posted_at timestamptz,
  views int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  saves int not null default 0,
  data_source text check (data_source is null or data_source in ('manual', 'csv')),
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_idea_id on public.posts(idea_id);
create index if not exists idx_posts_account_id on public.posts(account_id);

-- ----------------------------------------------------------------------------
-- revenues（収益管理）
-- ----------------------------------------------------------------------------
create table if not exists public.revenues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  source_type text not null check (source_type in ('ad_revenue', 'affiliate', 'sponsorship', 'other')),
  amount numeric(12, 2) not null,
  expense numeric(12, 2) not null default 0,
  record_date date not null,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_revenues_user_id on public.revenues(user_id);
create index if not exists idx_revenues_post_id on public.revenues(post_id);
create index if not exists idx_revenues_account_id on public.revenues(account_id);

-- ----------------------------------------------------------------------------
-- ai_suggestions（AI提案）
-- ----------------------------------------------------------------------------
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('next_idea', 'pattern_analysis', 'improvement')),
  content jsonb not null,
  basis_confidence text not null default 'low' check (basis_confidence in ('low', 'high')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_suggestions_user_id on public.ai_suggestions(user_id);

-- ----------------------------------------------------------------------------
-- ai_workflow_logs（AIワークフロー実行履歴・手動トリガー記録）
-- ----------------------------------------------------------------------------
create table if not exists public.ai_workflow_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_type text not null check (workflow_type in ('daily_candidates', 'daily_script', 'daily_summary', 'weekly_analysis')),
  triggered_at timestamptz not null default now(),
  result_summary jsonb
);

create index if not exists idx_ai_workflow_logs_user_id on public.ai_workflow_logs(user_id);

-- ----------------------------------------------------------------------------
-- settings（設定）
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  ai_enabled boolean not null default true,
  timezone text not null default 'Asia/Tokyo',
  updated_at timestamptz not null default now()
);

create index if not exists idx_settings_user_id on public.settings(user_id);

-- ----------------------------------------------------------------------------
-- note_articles（note記事管理・mvp-plan.mdの設計書には無いが本アプリのnote連携機能用に追加）
-- ----------------------------------------------------------------------------
create table if not exists public.note_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  title text not null,
  body text not null,
  hashtags jsonb not null default '[]'::jsonb,
  eye_catch_prompt text,
  is_generated boolean not null default false,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_note_articles_user_id on public.note_articles(user_id);
create index if not exists idx_note_articles_idea_id on public.note_articles(idea_id);

-- ============================================================================
-- Row Level Security（RLS）
-- 全テーブルで auth.uid() = user_id のみアクセスを許可する
-- ============================================================================

alter table public.accounts enable row level security;
alter table public.genres enable row level security;
alter table public.ideas enable row level security;
alter table public.scripts enable row level security;
alter table public.production_tasks enable row level security;
alter table public.schedules enable row level security;
alter table public.assets enable row level security;
alter table public.posts enable row level security;
alter table public.revenues enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_workflow_logs enable row level security;
alter table public.settings enable row level security;
alter table public.note_articles enable row level security;

-- accounts
create policy "accounts_select_own" on public.accounts for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on public.accounts for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on public.accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_delete_own" on public.accounts for delete using (auth.uid() = user_id);

-- genres
create policy "genres_select_own" on public.genres for select using (auth.uid() = user_id);
create policy "genres_insert_own" on public.genres for insert with check (auth.uid() = user_id);
create policy "genres_update_own" on public.genres for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "genres_delete_own" on public.genres for delete using (auth.uid() = user_id);

-- ideas
create policy "ideas_select_own" on public.ideas for select using (auth.uid() = user_id);
create policy "ideas_insert_own" on public.ideas for insert with check (auth.uid() = user_id);
create policy "ideas_update_own" on public.ideas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ideas_delete_own" on public.ideas for delete using (auth.uid() = user_id);

-- scripts
create policy "scripts_select_own" on public.scripts for select using (auth.uid() = user_id);
create policy "scripts_insert_own" on public.scripts for insert with check (auth.uid() = user_id);
create policy "scripts_update_own" on public.scripts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scripts_delete_own" on public.scripts for delete using (auth.uid() = user_id);

-- production_tasks
create policy "production_tasks_select_own" on public.production_tasks for select using (auth.uid() = user_id);
create policy "production_tasks_insert_own" on public.production_tasks for insert with check (auth.uid() = user_id);
create policy "production_tasks_update_own" on public.production_tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "production_tasks_delete_own" on public.production_tasks for delete using (auth.uid() = user_id);

-- schedules
create policy "schedules_select_own" on public.schedules for select using (auth.uid() = user_id);
create policy "schedules_insert_own" on public.schedules for insert with check (auth.uid() = user_id);
create policy "schedules_update_own" on public.schedules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "schedules_delete_own" on public.schedules for delete using (auth.uid() = user_id);

-- assets
create policy "assets_select_own" on public.assets for select using (auth.uid() = user_id);
create policy "assets_insert_own" on public.assets for insert with check (auth.uid() = user_id);
create policy "assets_update_own" on public.assets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_delete_own" on public.assets for delete using (auth.uid() = user_id);

-- posts
create policy "posts_select_own" on public.posts for select using (auth.uid() = user_id);
create policy "posts_insert_own" on public.posts for insert with check (auth.uid() = user_id);
create policy "posts_update_own" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts_delete_own" on public.posts for delete using (auth.uid() = user_id);

-- revenues
create policy "revenues_select_own" on public.revenues for select using (auth.uid() = user_id);
create policy "revenues_insert_own" on public.revenues for insert with check (auth.uid() = user_id);
create policy "revenues_update_own" on public.revenues for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "revenues_delete_own" on public.revenues for delete using (auth.uid() = user_id);

-- ai_suggestions
create policy "ai_suggestions_select_own" on public.ai_suggestions for select using (auth.uid() = user_id);
create policy "ai_suggestions_insert_own" on public.ai_suggestions for insert with check (auth.uid() = user_id);
create policy "ai_suggestions_update_own" on public.ai_suggestions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_suggestions_delete_own" on public.ai_suggestions for delete using (auth.uid() = user_id);

-- ai_workflow_logs
create policy "ai_workflow_logs_select_own" on public.ai_workflow_logs for select using (auth.uid() = user_id);
create policy "ai_workflow_logs_insert_own" on public.ai_workflow_logs for insert with check (auth.uid() = user_id);
create policy "ai_workflow_logs_update_own" on public.ai_workflow_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_workflow_logs_delete_own" on public.ai_workflow_logs for delete using (auth.uid() = user_id);

-- settings
create policy "settings_select_own" on public.settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings_delete_own" on public.settings for delete using (auth.uid() = user_id);

-- note_articles
create policy "note_articles_select_own" on public.note_articles for select using (auth.uid() = user_id);
create policy "note_articles_insert_own" on public.note_articles for insert with check (auth.uid() = user_id);
create policy "note_articles_update_own" on public.note_articles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "note_articles_delete_own" on public.note_articles for delete using (auth.uid() = user_id);

-- ============================================================================
-- updated_at 自動更新トリガー
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

create trigger trg_ideas_updated_at before update on public.ideas
  for each row execute function public.set_updated_at();

create trigger trg_production_tasks_updated_at before update on public.production_tasks
  for each row execute function public.set_updated_at();
