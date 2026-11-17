-- Storage cleanup: deletes photos/, snapshots/ and recordings/ files once they are 7 days old.
-- questions/ is never deleted.
-- Runs every night at 2:00 AM IST (20:30 UTC).
-- Run this in Supabase Dashboard -> SQL Editor AFTER deploying the 'weekly-storage-cleanup' edge function.
-- Replace YOUR_CLEANUP_SECRET (2 places) with the CLEANUP_SECRET function secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── PART 1: Nightly schedule ─────────────────────────────────────────────
-- Remove an older copy of the job if this script is run again
select cron.unschedule('weekly-storage-cleanup')
where exists (select 1 from cron.job where jobname = 'weekly-storage-cleanup');

select cron.schedule(
  'weekly-storage-cleanup',
  '30 20 * * *',
  $$
  select net.http_post(
    url := 'https://somibzqnvefdpfypncpp.supabase.co/functions/v1/weekly-storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWlienFudmVmZHBmeXBuY3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjYyNjIsImV4cCI6MjA5MDc0MjI2Mn0.LW13VmxaA9GOzgocBI6UCM1eSh8oVbif6iy3dP4-Mdc',
      'x-cleanup-secret', 'YOUR_CLEANUP_SECRET'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ── PART 2: Delete old files RIGHT NOW (one-time) ───────────────────────
-- Deletes everything older than 7 days immediately, without waiting for tonight.
select net.http_post(
  url := 'https://somibzqnvefdpfypncpp.supabase.co/functions/v1/weekly-storage-cleanup',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbWlienFudmVmZHBmeXBuY3BwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjYyNjIsImV4cCI6MjA5MDc0MjI2Mn0.LW13VmxaA9GOzgocBI6UCM1eSh8oVbif6iy3dP4-Mdc',
    'x-cleanup-secret', 'YOUR_CLEANUP_SECRET'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;

-- ── Checks ───────────────────────────────────────────────────────────────
-- Is the job scheduled?
--   select jobname, schedule, active from cron.job;
-- Result of the one-time run (wait ~30 seconds; look at status_code and content):
--   select id, status_code, content from net._http_response order by id desc limit 5;
-- How many old files are left (should be 0 after the run):
--   select split_part(name, '/', 1) as folder, count(*)
--   from storage.objects
--   where bucket_id = 'proctoring'
--     and split_part(name, '/', 1) in ('photos','snapshots','recordings')
--     and created_at < now() - interval '7 days'
--   group by 1;
