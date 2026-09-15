-- Remove duplicate task_field_values rows (same task_id + field_id), keeping one
-- per pair. Duplicates can arise from repeated backfills (the update path treats
-- ">1 existing row" as none and inserts another), and they inflate the monthly
-- report and can compound on each run. (task_id, field_id) is meant to be unique.
--
-- Run in the Supabase SQL editor. PREVIEW first, then the DELETE.

-- ── PREVIEW: how many duplicate rows would be removed, and for which fields ──
select sf.field_name, count(*) as extra_rows_to_delete
from (
  select ctid, task_id, field_id,
         row_number() over (partition by task_id, field_id order by ctid) as rn
  from task_field_values
) d
join space_fields sf on sf.id = d.field_id
where d.rn > 1
group by sf.field_name
order by extra_rows_to_delete desc;

-- ── DELETE the duplicates (keeps the first row per task_id+field_id) ──
-- Uncomment to apply. After this, re-running a backfill updates the single
-- remaining row instead of adding more.
-- delete from task_field_values a
-- using task_field_values b
-- where a.task_id = b.task_id
--   and a.field_id = b.field_id
--   and a.ctid > b.ctid;
