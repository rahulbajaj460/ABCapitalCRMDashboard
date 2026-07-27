-- =====================================================================
-- Phase 3 — Automations execution engine (Postgres-native)
-- =====================================================================
-- Runs automations entirely inside Postgres so no service key ever
-- reaches the browser. Task-change / comment triggers fire in real time;
-- pg_cron handles date-based rules once a day. The design is modular:
-- the "notify" email channel and any future AI-agent action types are
-- queued into tables (automation_email_queue / automation_runs) that a
-- Phase 4 Edge Function can drain — the engine itself stays keyless.
--
-- Safe to re-run: everything is CREATE OR REPLACE / IF NOT EXISTS and the
-- triggers are dropped-then-created. Run this whole file in the Supabase
-- SQL editor.
--
-- Automation shape (jsonb columns on public.automations):
--   trigger    {type, params}
--   conditions [{field, op, value}]
--   actions    [{type, params}]
-- Field keys: status | priority | assignee | due_date | field_<uuid>
-- =====================================================================

set search_path = public;

-- ---------------------------------------------------------------------
-- 1. Support tables (audit trail + email outbox for Phase 4)
-- ---------------------------------------------------------------------
create table if not exists automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid references automations(id) on delete cascade,
  task_id       uuid,
  event         text,
  detail        jsonb,
  ran_at        timestamptz default now()
);
create index if not exists idx_automation_runs_automation on automation_runs(automation_id, ran_at desc);

create table if not exists automation_email_queue (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  task_id       uuid,
  automation_id uuid,
  subject       text,
  body          text,
  status        text default 'pending',   -- pending | sent | error
  error         text,
  created_at    timestamptz default now(),
  sent_at       timestamptz
);
create index if not exists idx_automation_email_queue_status on automation_email_queue(status, created_at);

alter table automation_runs        enable row level security;
alter table automation_email_queue enable row level security;
do $$ begin
  create policy "read automation_runs" on automation_runs for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "read automation_email_queue" on automation_email_queue for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Column-type introspection helpers
--    tasks.assignees may be jsonb or text[]; tasks.created_by may or may
--    not exist. Generate readers/writers that match the actual schema.
-- ---------------------------------------------------------------------
do $$
declare atype text; has_creator boolean;
begin
  select data_type into atype
    from information_schema.columns
   where table_schema='public' and table_name='tasks' and column_name='assignees';

  -- Reader: normalized text[] of assignee names (falls back to singular assignee).
  if atype = 'jsonb' then
    execute $f$
      create or replace function _abcap_assignees(t tasks) returns text[]
      language sql stable as $b$
        select case
          when t.assignees is not null and jsonb_typeof(t.assignees)='array'
               and jsonb_array_length(t.assignees) > 0
            then array(select jsonb_array_elements_text(t.assignees))
          when t.assignee is not null and t.assignee <> '' then array[t.assignee]
          else '{}'::text[] end
      $b$;
    $f$;
  elsif atype = 'ARRAY' then
    execute $f$
      create or replace function _abcap_assignees(t tasks) returns text[]
      language sql stable as $b$
        select case
          when coalesce(array_length(t.assignees,1),0) > 0 then t.assignees
          when t.assignee is not null and t.assignee <> '' then array[t.assignee]
          else '{}'::text[] end
      $b$;
    $f$;
  else -- text / json holding a JSON array string
    execute $f$
      create or replace function _abcap_assignees(t tasks) returns text[]
      language sql stable as $b$
        select case
          when t.assignees is not null and t.assignees::text ~ '^\s*\['
            then array(select jsonb_array_elements_text(t.assignees::jsonb))
          when t.assignee is not null and t.assignee <> '' then array[t.assignee]
          else '{}'::text[] end
      $b$;
    $f$;
  end if;

  -- Writer: append a name to a task's assignees (idempotent), type-matched.
  if atype = 'jsonb' then
    execute $f$
      create or replace function _abcap_add_assignee(p_task uuid, p_name text) returns void
      language sql as $b$
        update tasks set
          assignees = (case when coalesce(assignees,'[]'::jsonb) ? p_name
                            then coalesce(assignees,'[]'::jsonb)
                            else coalesce(assignees,'[]'::jsonb) || to_jsonb(p_name) end),
          assignee  = coalesce(nullif(assignee,''), p_name),
          updated_at = now()
        where id = p_task;
      $b$;
    $f$;
  elsif atype = 'ARRAY' then
    execute $f$
      create or replace function _abcap_add_assignee(p_task uuid, p_name text) returns void
      language sql as $b$
        update tasks set
          assignees = (case when p_name = any(coalesce(assignees,'{}'::text[]))
                            then assignees else array_append(coalesce(assignees,'{}'::text[]), p_name) end),
          assignee  = coalesce(nullif(assignee,''), p_name),
          updated_at = now()
        where id = p_task;
      $b$;
    $f$;
  else
    execute $f$
      create or replace function _abcap_add_assignee(p_task uuid, p_name text) returns void
      language sql as $b$
        update tasks set assignee = coalesce(nullif(assignee,''), p_name), updated_at = now()
        where id = p_task;
      $b$;
    $f$;
  end if;

  -- Creator name resolver (only if the column exists; else NULL).
  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tasks' and column_name='created_by'
  ) into has_creator;
  if has_creator then
    execute $f$ create or replace function _abcap_creator(t tasks) returns text
                language sql stable as $b$ select t.created_by $b$; $f$;
  else
    execute $f$ create or replace function _abcap_creator(t tasks) returns text
                language sql stable as $b$ select null::text $b$; $f$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Value / path / condition helpers
-- ---------------------------------------------------------------------
create or replace function _abcap_scope_path(sid uuid, fid uuid, lid uuid)
returns text language sql stable security definer set search_path=public as $$
  select nullif(array_to_string(array_remove(array[
    (select name from spaces  where id = sid),
    (select name from folders where id = fid),
    (select name from lists   where id = lid)
  ], null), ' / '), '');
$$;

-- Value of a built-in or custom field for a task, as text.
create or replace function _abcap_field_value(t tasks, field text)
returns text language plpgsql stable security definer set search_path=public as $$
declare fid uuid; v text;
begin
  if field = 'status'   then return t.status; end if;
  if field = 'priority' then return t.priority; end if;
  if field = 'due_date' then return t.due_date::text; end if;
  if field like 'field\_%' then
    begin fid := substring(field from 7)::uuid; exception when others then return null; end;
    select value into v from task_field_values where task_id = t.id and field_id = fid limit 1;
    return v;
  end if;
  return null;
end $$;

create or replace function _abcap_eval_conditions(conds jsonb, t tasks)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare c jsonb; field text; op text; val text; cur text; names text[]; ok boolean;
begin
  if conds is null or jsonb_array_length(conds) = 0 then return true; end if;
  for c in select jsonb_array_elements(conds) loop
    field := c->>'field'; op := c->>'op'; val := c->>'value';
    if field = 'assignee' then
      names := _abcap_assignees(t);
      ok := case op
        when 'is'       then val = any(names)
        when 'contains' then val = any(names)
        when 'is_not'   then not (val = any(names))
        when 'is_set'   then array_length(names,1) is not null
        when 'is_empty' then array_length(names,1) is null
        else true end;
    else
      cur := _abcap_field_value(t, field);
      ok := case op
        when 'is'       then cur = val
        when 'is_not'   then cur is distinct from val
        when 'contains' then cur ilike '%'||val||'%'
        when 'is_set'   then cur is not null and cur <> ''
        when 'is_empty' then cur is null or cur = ''
        else true end;
    end if;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  return true;
end $$;

-- Resolve an action's recipient tokens to profile ids.
create or replace function _abcap_recipients(recips jsonb, t tasks)
returns setof uuid language plpgsql stable security definer set search_path=public as $$
declare r text;
begin
  for r in select jsonb_array_elements_text(coalesce(recips, '[]'::jsonb)) loop
    if r = 'assignee' then
      return query select p.id from profiles p where p.full_name = any(_abcap_assignees(t));
    elsif r = 'creator' then
      return query select p.id from profiles p where p.full_name = _abcap_creator(t);
    elsif r = 'admins' then
      return query select p.id from profiles p where p.role = 'admin';
    else
      return query select p.id from profiles p where p.full_name = r;
    end if;
  end loop;
end $$;

create or replace function _abcap_trigger_label(ttype text)
returns text language sql immutable as $$
  select case ttype
    when 'assigned'        then 'a task was assigned'
    when 'status_changed'  then 'a status changed'
    when 'field_changed'   then 'a field changed'
    when 'comment_mention' then 'a new comment'
    when 'date_based'      then 'a date rule'
    when 'task_created'    then 'a task was created'
    else ttype end;
$$;

-- Set a built-in or custom field (used by the set_field action).
create or replace function _abcap_set_field(t tasks, field text, val text)
returns void language plpgsql security definer set search_path=public as $$
declare fid uuid;
begin
  perform set_config('abcap.in_automation','1', true);  -- suppress re-entry
  if field = 'status' then
    update tasks set status = val, updated_at = now() where id = t.id;
  elsif field = 'priority' then
    update tasks set priority = val, updated_at = now() where id = t.id;
  elsif field = 'due_date' then
    update tasks set due_date = nullif(val,''), updated_at = now() where id = t.id;
  elsif field like 'field\_%' then
    begin fid := substring(field from 7)::uuid; exception when others then return; end;
    update task_field_values set value = val where task_id = t.id and field_id = fid;
    if not found then
      insert into task_field_values(task_id, field_id, value) values (t.id, fid, val);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Executor — run one matched automation's actions against a task
-- ---------------------------------------------------------------------
create or replace function _abcap_run(a automations, t tasks, actor text, event text)
returns void language plpgsql security definer set search_path=public as $$
declare
  act jsonb; atype text; chans jsonb; recip uuid; actor_id uuid;
  path text := _abcap_scope_path(t.space_id, t.folder_id, t.list_id);
begin
  if actor is not null then
    select id into actor_id from profiles where full_name = actor limit 1;
  end if;

  for act in select jsonb_array_elements(a.actions) loop
    atype := act->>'type';

    if atype = 'notify' then
      chans := coalesce(act->'params'->'channels', '["in_app"]'::jsonb);
      for recip in select distinct x from _abcap_recipients(act->'params'->'recipients', t) x loop
        if actor_id is not null and recip = actor_id then continue; end if;  -- don't notify the actor
        if chans ? 'in_app' then
          insert into notifications(user_id, task_id, type, title, body, link_scope)
          values (recip, t.id, 'automation',
                  coalesce(nullif(a.name,''), 'Automation'),
                  'Triggered because ' || _abcap_trigger_label(a.trigger->>'type') || '.',
                  jsonb_build_object('space_id', t.space_id, 'folder_id', t.folder_id,
                                     'list_id', t.list_id, 'path', path));
        end if;
        if chans ? 'email' then
          insert into automation_email_queue(user_id, task_id, automation_id, subject, body)
          values (recip, t.id, a.id,
                  coalesce(nullif(a.name,''), 'Automation') || ': ' || coalesce(t.title, 'task'),
                  'Automation "' || coalesce(a.name,'') || '" ran on task "' || coalesce(t.title,'') ||
                  '" (' || coalesce(path,'') || ').');
        end if;
      end loop;

    elsif atype = 'change_status' then
      perform set_config('abcap.in_automation','1', true);
      update tasks set status = act->'params'->>'to', updated_at = now() where id = t.id;

    elsif atype = 'assign' then
      perform set_config('abcap.in_automation','1', true);
      if coalesce(act->'params'->>'user','') <> '' then
        perform _abcap_add_assignee(t.id, act->'params'->>'user');
      end if;

    elsif atype = 'set_field' then
      if coalesce(act->'params'->>'field','') <> '' then
        perform _abcap_set_field(t, act->'params'->>'field', act->'params'->>'value');
      end if;
    end if;
  end loop;

  insert into automation_runs(automation_id, task_id, event, detail)
  values (a.id, t.id, event, jsonb_build_object('actor', actor));
end $$;

-- ---------------------------------------------------------------------
-- 5. Dispatcher — find matching automations for an event and run them
-- ---------------------------------------------------------------------
create or replace function _abcap_dispatch(t tasks, event text, changed_field text, actor text)
returns void language plpgsql security definer set search_path=public as $$
declare a automations; ttype text; matched boolean; tgt text; fld text; tov text;
begin
  for a in
    select * from automations
     where enabled
       and ((scope_type = 'list'   and scope_id = t.list_id)
         or (scope_type = 'folder' and scope_id = t.folder_id)
         or (scope_type = 'space'  and scope_id = t.space_id))
  loop
    ttype := a.trigger->>'type';
    matched := false;

    if    event = 'task_created'    and ttype = 'task_created'    then matched := true;
    elsif event = 'assigned'        and ttype = 'assigned'        then matched := true;
    elsif event = 'comment_mention' and ttype = 'comment_mention' then matched := true;
    elsif event = 'status_changed'  and ttype = 'status_changed'  then
      tgt := a.trigger->'params'->>'to';
      matched := (tgt is null or tgt = '' or tgt = t.status);
    elsif event = 'field_changed'   and ttype = 'field_changed'   then
      fld := a.trigger->'params'->>'field';
      tov := a.trigger->'params'->>'to';
      if fld = changed_field then
        if tov is null or tov = '' then
          matched := true;                                   -- any change
        elsif fld = 'assignee' then
          matched := tov = any(_abcap_assignees(t));
        else
          matched := (_abcap_field_value(t, fld) = tov);      -- changed to specific value
        end if;
      end if;
    end if;

    if matched and _abcap_eval_conditions(a.conditions, t) then
      perform _abcap_run(a, t, actor, event);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Row triggers on tasks / task_field_values / task_comments
-- ---------------------------------------------------------------------
create or replace function _abcap_tasks_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('abcap.in_automation', true) = '1' then return null; end if;

  if TG_OP = 'INSERT' then
    perform _abcap_dispatch(NEW, 'task_created', null, NEW.updated_by);
    if array_length(_abcap_assignees(NEW), 1) is not null then
      perform _abcap_dispatch(NEW, 'assigned', null, NEW.updated_by);
    end if;
  else -- UPDATE
    if NEW.status is distinct from OLD.status then
      perform _abcap_dispatch(NEW, 'status_changed', null, NEW.updated_by);
      perform _abcap_dispatch(NEW, 'field_changed', 'status', NEW.updated_by);
    end if;
    if NEW.priority is distinct from OLD.priority then
      perform _abcap_dispatch(NEW, 'field_changed', 'priority', NEW.updated_by);
    end if;
    if NEW.due_date is distinct from OLD.due_date then
      perform _abcap_dispatch(NEW, 'field_changed', 'due_date', NEW.updated_by);
    end if;
    -- newly-added assignee(s)
    if exists (select 1 from unnest(_abcap_assignees(NEW)) n
                where n <> all(_abcap_assignees(OLD))) then
      perform _abcap_dispatch(NEW, 'assigned', null, NEW.updated_by);
      perform _abcap_dispatch(NEW, 'field_changed', 'assignee', NEW.updated_by);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_abcap_tasks on tasks;
create trigger trg_abcap_tasks
  after insert or update on tasks
  for each row execute function _abcap_tasks_trigger();

create or replace function _abcap_task_field_values_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare t tasks;
begin
  if current_setting('abcap.in_automation', true) = '1' then return null; end if;
  if TG_OP = 'UPDATE' and NEW.value is not distinct from OLD.value then return null; end if;
  select * into t from tasks where id = NEW.task_id;
  if not found then return null; end if;
  perform _abcap_dispatch(t, 'field_changed', 'field_' || NEW.field_id::text, t.updated_by);
  return null;
end $$;

drop trigger if exists trg_abcap_task_field_values on task_field_values;
create trigger trg_abcap_task_field_values
  after insert or update on task_field_values
  for each row execute function _abcap_task_field_values_trigger();

create or replace function _abcap_task_comments_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare t tasks; actor text;
begin
  select * into t from tasks where id = NEW.task_id;
  if not found then return null; end if;
  select full_name into actor from profiles where id = NEW.profile_id;
  perform _abcap_dispatch(t, 'comment_mention', null, actor);
  return null;
end $$;

drop trigger if exists trg_abcap_task_comments on task_comments;
create trigger trg_abcap_task_comments
  after insert on task_comments
  for each row execute function _abcap_task_comments_trigger();

-- ---------------------------------------------------------------------
-- 7. Date-based rules (run daily by pg_cron)
-- ---------------------------------------------------------------------
create or replace function run_date_based_automations()
returns void language plpgsql security definer set search_path=public as $$
declare a automations; t tasks; dir text; days int; fld text; target date; dval text; dd date;
begin
  for a in select * from automations where enabled and trigger->>'type' = 'date_based' loop
    dir  := coalesce(a.trigger->'params'->>'direction', 'before');
    days := coalesce((a.trigger->'params'->>'days')::int, 0);
    fld  := coalesce(a.trigger->'params'->>'field', 'due_date');
    target := case dir when 'after' then current_date - days else current_date + days end;

    for t in
      select * from tasks
       where deleted_at is null
         and ((a.scope_type = 'list'   and list_id   = a.scope_id)
           or (a.scope_type = 'folder' and folder_id = a.scope_id)
           or (a.scope_type = 'space'  and space_id  = a.scope_id))
    loop
      dval := _abcap_field_value(t, fld);
      if dval is null or dval = '' then continue; end if;
      begin dd := dval::date; exception when others then continue; end;
      if dd = target and _abcap_eval_conditions(a.conditions, t) then
        perform _abcap_run(a, t, null, 'date_based');
      end if;
    end loop;
  end loop;
end $$;

-- Schedule daily at 06:00 UTC (idempotent). Requires the pg_cron extension.
do $$
begin
  perform 1 from pg_extension where extname = 'pg_cron';
  if found then
    perform cron.unschedule('abcap-date-automations')
      from cron.job where jobname = 'abcap-date-automations';
    perform cron.schedule('abcap-date-automations', '0 6 * * *',
                          'select run_date_based_automations()');
  else
    raise notice 'pg_cron not installed — enable it (Database > Extensions) then re-run the pg_cron block, or call run_date_based_automations() from a scheduled Edge Function.';
  end if;
end $$;

-- =====================================================================
-- Done. Automations now fire on task/field/comment changes in real time,
-- and date-based rules run daily. Email actions land in
-- automation_email_queue for the Phase 4 sender; every run is logged to
-- automation_runs for debugging.
-- =====================================================================
