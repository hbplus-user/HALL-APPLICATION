-- Schedules the weekly storage cleanup: every Sunday at 2:00 AM IST (Saturday 20:30 UTC).
-- Run once in Supabase Dashboard -> SQL Editor.
-- Replace YOUR_CLEANUP_SECRET with the same value you set as the CLEANUP_SECRET function secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the job if this script is run again
select cron.unschedule('weekly-storage-cleanup')
where exists (select 1 from cron.job where jobname = 'weekly-storage-cleanup');

select cron.schedule(
  'weekly-storage-cleanup',
  '30 20 * * 6',
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

-- Check it is scheduled:
--   select jobname, schedule, active from cron.job;
-- See past runs:
--   select * from cron.job_run_details order by start_time desc limit 10;
