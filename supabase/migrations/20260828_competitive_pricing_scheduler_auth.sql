create table if not exists public.pricing_runtime_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);

alter table public.pricing_runtime_secrets enable row level security;

insert into public.pricing_runtime_secrets(name, secret)
values ('competitive_pricing_cron', md5(gen_random_uuid()::text || clock_timestamp()::text))
on conflict (name) do nothing;

alter table public.pricing_rules
  add column if not exists last_run_at timestamptz null;

do $$
declare
  s text;
begin
  select secret into s
  from public.pricing_runtime_secrets
  where name = 'competitive_pricing_cron';

  begin
    perform cron.unschedule('competitive-pricing-every-15-minutes');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'competitive-pricing-every-15-minutes',
    '*/15 * * * *',
    format(
      'select net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb);',
      'https://tqsaukjmlwjucnmtstab.supabase.co/functions/v1/competitive-pricing',
      '{"Content-Type":"application/json"}',
      json_build_object('operation','run','cron_secret',s)::text
    )
  );
end $$;
