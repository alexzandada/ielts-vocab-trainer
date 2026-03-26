create table if not exists public.app_state (
  id text primary key,
  progress jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  "updatedAt" timestamptz not null default now()
);
