create extension if not exists "pgcrypto";

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  phone text null,
  website text null,
  type text not null check (type in ('admin','premium','free')),
  search_api_key text null,
  brand_name text null,
  brand_colors jsonb null,
  brand_logo text null,
  telegram_chat_id text null,
  brand_name_changed_at timestamptz null,
  logo_changed_at timestamptz null,
  brand_change_count int null,
  logo_change_count int null,
  subscription_end timestamptz null,
  is_active boolean not null default true,
  daily_searches int null,
  last_search_date text null,
  password_hash text not null,
  password_salt text not null,
  password_iterations int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  query text not null,
  results jsonb not null,
  timestamp bigint not null,
  type text not null check (type in ('individual','bulk')),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_search_history_user_time on app_search_history (user_id, timestamp desc);

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists app_password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid null references app_users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create table if not exists app_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists football_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_sources_active on football_sources (is_active);

create table if not exists football_schedules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references football_sources(id) on delete cascade,
  schedule_date date not null,
  matches jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, schedule_date)
);

create index if not exists idx_football_schedules_date on football_schedules (schedule_date desc);
