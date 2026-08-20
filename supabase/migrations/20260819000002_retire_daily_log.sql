-- Retires `daily_log`, carrying what it held into `day_pages`.
--
-- DESTRUCTIVE. Run only after a verified backup, and only after
-- 20260819000001 has been applied and checked - that migration creates the
-- table this one copies into.
--
-- The Daily Log captured an energy level, a list of wins, a list of blockers
-- and a freeform BlockNote journal. Day pages have a home for all four, so the
-- entries are moved rather than thrown away even though the user was willing to
-- lose them: wins become highlights, blockers become friction, the journal
-- becomes the reflection, and the energy level is kept in metrics where the
-- week analysis can still average it.

insert into public.day_pages (
  workspace_id, created_by, date,
  title, summary, highlights, friction, reflection, metrics,
  generated_by, created_at, updated_at
)
select
  dl.workspace_id,
  dl.created_by,
  dl.date,
  null,
  null,
  coalesce(dl.wins, '{}'),
  coalesce(dl.blockers, '{}'),
  -- `content_text` is the plain-text mirror stage 4 backfilled from
  -- `notes_html`; prefer it, and fall back for any row that predates it.
  coalesce(nullif(dl.content_text, ''), nullif(dl.notes_html, '')),
  case
    when dl.energy_level is null then '{}'::jsonb
    else jsonb_build_object('energy_level', dl.energy_level)
  end,
  -- These pages were written by a person, not by any engine. Saying 'builtin'
  -- would claim the templated writer produced prose it never saw.
  'imported',
  dl.created_at,
  dl.updated_at
from public.daily_log dl
-- A day page may already exist for that date if the new feature was used
-- before this migration ran; the human-written entry must not clobber it.
on conflict (created_by, date) do nothing;

-- Attachments uploaded inside a Daily Log journal point at the old entity type.
-- Repoint them at the day page that now holds that entry so the files stay
-- reachable instead of becoming orphans with live blobs behind them.
update public.attachments a
   set entity_type = 'day_pages',
       entity_id   = dp.id
  from public.daily_log dl
  join public.day_pages dp
    on dp.created_by = dl.created_by
   and dp.date = dl.date
 where a.entity_type = 'daily_log'
   and a.entity_id = dl.id;

drop table if exists public.daily_log;
