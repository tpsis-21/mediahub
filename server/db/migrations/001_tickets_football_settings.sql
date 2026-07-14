-- Baseline P2: tickets, settings, football (IF NOT EXISTS — seguro em DBs já provisionados).
-- schema.sql permanece o dump completo de referência para ambientes novos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id),
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES ('tickets_enabled', 'true') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS football_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS football_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES football_sources(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (source_id, schedule_date)
);

INSERT INTO football_sources (name, url, is_active)
SELECT 'Futebol na TV', 'https://www.futebolnatv.com.br/', true
WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%futebolnatv.com.br%');

INSERT INTO football_sources (name, url, is_active)
SELECT 'OneFootball', 'https://onefootball.com/pt-br/jogos', true
WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%onefootball.com/pt-br/jogos%');

INSERT INTO football_sources (name, url, is_active)
SELECT '365Scores TV', 'https://www.365scores.com/pt-br/where-to-watch', true
WHERE NOT EXISTS (SELECT 1 FROM football_sources WHERE url ILIKE '%365scores.com/pt-br/where-to-watch%');
