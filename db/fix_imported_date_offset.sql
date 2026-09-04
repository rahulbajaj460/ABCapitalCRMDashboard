-- One-off correction for the CSV-import timezone bug.
--
-- The importer parsed dates like "6-Jul-26" at LOCAL midnight and then stored
-- the UTC day (toISOString), which in UAE (UTC+4) is the PREVIOUS calendar day.
-- So every date brought in by that import is stored ONE DAY EARLY. The code is
-- fixed going forward (ImportTasks.jsx normalizeDate); this repairs the rows
-- that were already imported by adding one day back.
--
-- Run in the Supabase SQL editor. SCOPE IT CAREFULLY so you only touch the bad
-- import, never manually-entered dates. Two knobs below:
--   1) the field names to correct  (custom date fields)
--   2) the import time window       (tasks created during the bad import)
--
-- ⚠️ Adjust :window_start / :window_end to the actual import time, then run the
-- PREVIEW first and eyeball it before running the UPDATE.

-- ── 0) Set the import window (edit these two lines) ──
-- Everything created between these timestamps is treated as "from the bad import".
\set window_start '2026-09-04 00:00:00+04'
\set window_end   '2026-09-05 00:00:00+04'

-- ── 1) PREVIEW: custom date field values that would change ──
-- Only values that look like a plain YYYY-MM-DD date are touched.
select tfv.task_id,
       t.title,
       sf.field_name,
       tfv.value                             as stored_now,
       to_char((tfv.value::date + 1), 'YYYY-MM-DD') as corrected_to
from task_field_values tfv
join space_fields sf on sf.id = tfv.field_id
join tasks t         on t.id = tfv.task_id
where sf.field_name in ('Expiry Date', 'License Date')     -- ← edit field list
  and sf.field_type = 'date'
  and tfv.value ~ '^\d{4}-\d{2}-\d{2}$'
  and t.created_at >= :'window_start'
  and t.created_at <  :'window_end'
order by t.created_at, sf.field_name;

-- ── 2) APPLY (custom date fields) — run after the preview looks right ──
-- update task_field_values tfv
-- set value = to_char((tfv.value::date + 1), 'YYYY-MM-DD')
-- from space_fields sf, tasks t
-- where sf.id = tfv.field_id
--   and t.id  = tfv.task_id
--   and sf.field_name in ('Expiry Date', 'License Date')
--   and sf.field_type = 'date'
--   and tfv.value ~ '^\d{4}-\d{2}-\d{2}$'
--   and t.created_at >= :'window_start'
--   and t.created_at <  :'window_end';

-- ── 3) (Optional) native date columns imported in the same batch ──
-- Uncomment if you also mapped Start/Due/Done/Closed dates in that import.
-- PREVIEW:
-- select id, title, due_date, (due_date + 1) as due_fixed,
--        date_done, (date_done + 1) as done_fixed
-- from tasks
-- where created_at >= :'window_start' and created_at < :'window_end'
--   and (due_date is not null or date_done is not null);
-- APPLY:
-- update tasks
-- set due_date  = case when due_date  is not null then due_date  + 1 else null end,
--     date_done = case when date_done is not null then date_done + 1 else null end
-- where created_at >= :'window_start' and created_at < :'window_end';
