-- Dashboard + Space Overview analytics.
-- Two SECURITY INVOKER RPCs (RLS applies to the caller, so members see their
-- own scope and admins see everything) that aggregate in Postgres — accurate at
-- any scale, unlike a client-side select capped at 1000 rows.
-- Run in the Supabase SQL editor (idempotent).

-- "Open" = not in a terminal state. Used for overdue / workload so completed,
-- cancelled, closed, or rejected tasks don't count as outstanding.
create or replace function _abcap_status_open(s text)
returns boolean language sql immutable as $$
  select s is not null and lower(s) !~ 'done|complete|cancel|closed|reject';
$$;

-- ── CRM-wide dashboard ──
create or replace function dashboard_overview()
returns jsonb language sql stable as $$
  with t as (select * from tasks where deleted_at is null)
  select jsonb_build_object(
    'total',       (select count(*) from t),
    'done',        (select count(*) filter (where status = 'Done') from t),
    'in_progress', (select count(*) filter (where status = 'In Progress') from t),
    'urgent',      (select count(*) filter (where priority = 'High' and _abcap_status_open(status)) from t),
    'overdue',     (select count(*) filter (where due_date < current_date and _abcap_status_open(status)) from t),
    'due_7d',      (select count(*) filter (where due_date >= current_date and due_date < current_date + 7  and _abcap_status_open(status)) from t),
    'due_30d',     (select count(*) filter (where due_date >= current_date and due_date < current_date + 30 and _abcap_status_open(status)) from t),
    'by_status',   (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by c desc), '[]'::jsonb)
                      from (select coalesce(nullif(status,''),'(no status)') as status, count(*) c from t group by 1) s),
    'by_space',    (select coalesce(jsonb_agg(row order by (row->>'total')::int desc), '[]'::jsonb) from (
                      select jsonb_build_object(
                        'space_id', sp.id, 'name', sp.name,
                        'total',   count(tt.id),
                        'done',    count(tt.id) filter (where tt.status = 'Done'),
                        'overdue', count(tt.id) filter (where tt.due_date < current_date and _abcap_status_open(tt.status))
                      ) as row
                      from spaces sp
                      left join t tt on tt.space_id = sp.id
                      where sp.deleted_at is null
                      group by sp.id, sp.name) x),
    'by_assignee', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'open', open_c, 'overdue', od_c) order by open_c desc), '[]'::jsonb) from (
                      select a as name,
                        count(*) filter (where _abcap_status_open(status)) as open_c,
                        count(*) filter (where due_date < current_date and _abcap_status_open(status)) as od_c
                      from t cross join lateral unnest(coalesce(assignees, array[]::text[])) as a
                      where a is not null and a <> ''
                      group by a
                      order by open_c desc
                      limit 12) y),
    'trend',       (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'created', cr, 'completed', cp) order by m), '[]'::jsonb) from (
                      select to_char(d, 'YYYY-MM') as m,
                        (select count(*) from t where to_char(created_at, 'YYYY-MM') = to_char(d, 'YYYY-MM')) as cr,
                        (select count(*) from t where date_done is not null and substring(date_done::text from 1 for 7) = to_char(d, 'YYYY-MM')) as cp
                      from generate_series(date_trunc('month', current_date) - interval '5 months',
                                           date_trunc('month', current_date), interval '1 month') d) z)
  );
$$;

-- ── Per-space overview ──
create or replace function space_overview(p_space_id uuid)
returns jsonb language sql stable as $$
  with t as (select * from tasks where deleted_at is null and space_id = p_space_id)
  select jsonb_build_object(
    'total',   (select count(*) from t),
    'done',    (select count(*) filter (where status = 'Done') from t),
    'overdue', (select count(*) filter (where due_date < current_date and _abcap_status_open(status)) from t),
    'due_30d', (select count(*) filter (where due_date >= current_date and due_date < current_date + 30 and _abcap_status_open(status)) from t),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', c) order by c desc), '[]'::jsonb)
                    from (select coalesce(nullif(status,''),'(no status)') as status, count(*) c from t group by 1) s),
    'by_list', (select coalesce(jsonb_agg(row order by (row->>'total')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'folder_id', f.id, 'folder', f.name,
                    'list_id', l.id, 'list', l.name,
                    'total',   count(tt.id),
                    'done',    count(tt.id) filter (where tt.status = 'Done'),
                    'overdue', count(tt.id) filter (where tt.due_date < current_date and _abcap_status_open(tt.status))
                  ) as row
                  from lists l
                  join folders f on f.id = l.folder_id
                  left join t tt on tt.list_id = l.id
                  where l.space_id = p_space_id and l.deleted_at is null and f.deleted_at is null
                  group by f.id, f.name, l.id, l.name) x),
    'by_assignee', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'open', open_c, 'overdue', od_c) order by open_c desc), '[]'::jsonb) from (
                      select a as name,
                        count(*) filter (where _abcap_status_open(status)) as open_c,
                        count(*) filter (where due_date < current_date and _abcap_status_open(status)) as od_c
                      from t cross join lateral unnest(coalesce(assignees, array[]::text[])) as a
                      where a is not null and a <> ''
                      group by a order by open_c desc limit 10) y),
    'at_risk', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', id, 'title', title, 'due_date', due_date, 'status', status, 'list_id', list_id) order by due_date), '[]'::jsonb)
                  from (select id, title, due_date, status, list_id from t
                        where due_date is not null and due_date < current_date + 14 and _abcap_status_open(status)
                        order by due_date limit 25) r)
  );
$$;

grant execute on function dashboard_overview() to authenticated;
grant execute on function space_overview(uuid) to authenticated;
