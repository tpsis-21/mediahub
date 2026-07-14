-- Sessões e códigos de vínculo do bot Telegram conversacional
create table if not exists telegram_link_codes (
  code text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_codes_user_id_idx
  on telegram_link_codes (user_id);

create index if not exists telegram_link_codes_expires_at_idx
  on telegram_link_codes (expires_at);

create table if not exists telegram_bot_sessions (
  chat_id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  state text not null default 'linked',
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_bot_sessions_user_id_idx
  on telegram_bot_sessions (user_id);
