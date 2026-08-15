-- Quotation Maker — per-freezone Word templates + field definitions.
-- Run in Supabase SQL editor (idempotent). Powers the in-app Quotations view:
-- admins upload a .docx template per freezone and define its columns; anyone
-- can generate a filled .docx (client-side) from a form or an Excel upload.

-- ── Table: one row per freezone template ──
create table if not exists quotation_templates (
  id           uuid primary key default gen_random_uuid(),
  freezone     text not null,
  storage_path text not null,               -- path in the quotation-templates bucket
  file_name    text,                        -- original .docx name (for display)
  fields       jsonb not null default '[]', -- [{ key, label, type: 'text'|'number', fee: bool }]
  updated_by   text,
  updated_at   timestamptz default now(),
  created_at   timestamptz default now(),
  deleted_at   timestamptz
);

alter table quotation_templates enable row level security;

-- Read: any authenticated user (needed to generate quotations).
drop policy if exists quotation_templates_select on quotation_templates;
create policy quotation_templates_select on quotation_templates
  for select to authenticated using (true);

-- Write: admins only.
drop policy if exists quotation_templates_admin_write on quotation_templates;
create policy quotation_templates_admin_write on quotation_templates
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Storage bucket for the .docx templates (private) ──
insert into storage.buckets (id, name, public)
values ('quotation-templates', 'quotation-templates', false)
on conflict (id) do nothing;

-- Download: any authenticated user.
drop policy if exists quotation_templates_read on storage.objects;
create policy quotation_templates_read on storage.objects
  for select to authenticated
  using (bucket_id = 'quotation-templates');

-- Upload / replace / delete: admins only.
drop policy if exists quotation_templates_write on storage.objects;
create policy quotation_templates_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'quotation-templates'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    bucket_id = 'quotation-templates'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
