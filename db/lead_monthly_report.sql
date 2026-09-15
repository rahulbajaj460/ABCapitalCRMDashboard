-- Monthly lead report: counts a list's tasks by month (of the created_time
-- custom field) × task status. Powers the "Monthly Lead Report" card on the
-- Marketing Leads space / Advertising folder Overview.
--
-- SECURITY DEFINER so the report counts ALL tasks in the list, not just the
-- caller's RLS-visible rows (matches the other dashboard_* RPCs). Tasks whose
-- created_time is empty/unparseable fall into the 'Undated' bucket so nothing
-- is silently dropped.
--
-- Run in the Supabase SQL editor (idempotent).

create or replace function lead_monthly_report(p_list_id uuid)
returns table(ym text, status text, cnt bigint)
language sql stable security definer set search_path = public as $$
  -- One row per task. A LATERAL pick of a single created_time value avoids the
  -- fan-out (and double counting) that a plain join produces when a task has
  -- more than one created_time field-value row.
  select
    case when ct.value ~ '^\d{4}-\d{2}' then substr(ct.value, 1, 7) else 'Undated' end as ym,
    coalesce(nullif(t.status, ''), 'No status') as status,
    count(*)::bigint
  from tasks t
  left join lateral (
    select tfv.value
    from task_field_values tfv
    join space_fields sf on sf.id = tfv.field_id
    where tfv.task_id = t.id
      and sf.list_id = t.list_id
      and lower(sf.field_name) = 'created_time'
    order by tfv.value desc nulls last
    limit 1
  ) ct on true
  where t.list_id = p_list_id and t.deleted_at is null
  group by 1, 2;
$$;

grant execute on function lead_monthly_report(uuid) to anon, authenticated;
