// Supabase Edge Function — Google Sheets → CRM lead ingest.
// Paste into the Supabase Dashboard (Edge Functions → your function → Code) and Deploy.
//
// Fixes the 2026-07 outage: space/folder/list lookups now filter out
// soft-deleted rows and pick the newest active match, so a trashed-and-
// recreated list can never again resolve as "not found" (which caused the
// retry-storm that exhausted the Apps Script urlfetch quota). Missing
// folders/lists are auto-created so a new sheet tab never 404-loops.
// Hashing / idempotency / field-mapping are unchanged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { secret, spaceName, folderName, listName, title, status, fields, assignTo } = await req.json();
    if (secret !== Deno.env.get("WEBHOOK_SECRET")) return json({ error: "Unauthorized" }, 401);
    if (!title || !listName) return json({ error: "Missing title or listName" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve the space — active rows only. NOTE: no ORDER BY created_at here;
    // folders (and possibly other tables) have no created_at column, and an
    // errored lookup must NEVER be mistaken for "not found" — otherwise every
    // request would auto-create a new folder/list. So we check `error`
    // explicitly and only auto-create on a genuinely empty result.
    const { data: space, error: spaceErr } = await db.from("spaces").select("id")
      .eq("name", spaceName).is("deleted_at", null).limit(1).maybeSingle();
    if (spaceErr) return json({ error: "Space lookup failed: " + spaceErr.message }, 500);
    if (!space) return json({ error: "Space not found" }, 404);

    // Resolve the folder (active only); auto-create only if the lookup
    // succeeded and returned nothing.
    let { data: folder, error: folderErr } = await db.from("folders").select("id")
      .eq("name", folderName).eq("space_id", space.id).is("deleted_at", null)
      .limit(1).maybeSingle();
    if (folderErr) return json({ error: "Folder lookup failed: " + folderErr.message }, 500);
    if (!folder) {
      const { data: created, error: fErr } = await db.from("folders")
        .insert({ name: folderName, space_id: space.id }).select("id").single();
      if (fErr || !created) return json({ error: "Folder could not be created: " + (fErr?.message || "") }, 500);
      folder = created;
    }

    // Resolve the list (active only); auto-create only if the lookup succeeded
    // and returned nothing.
    let { data: list, error: listErr } = await db.from("lists").select("id")
      .eq("name", listName).eq("folder_id", folder.id).is("deleted_at", null)
      .limit(1).maybeSingle();
    if (listErr) return json({ error: "List lookup failed: " + listErr.message }, 500);
    if (!list) {
      const { data: created, error: lErr } = await db.from("lists")
        .insert({ name: listName, folder_id: folder.id, space_id: space.id }).select("id").single();
      if (lErr || !created) return json({ error: "List could not be created: " + (lErr?.message || "") }, 500);
      list = created;
    }

    // Content signature: list + title + non-empty sheet fields (sorted). Auto
    // fields like Start Date are intentionally excluded so the hash is stable.
    const entries = Object.entries(fields || {})
      .map(([k, v]) => [k, v == null ? "" : String(v)] as [string, string])
      .filter(([, v]) => v.trim() !== "")
      .map(([k, v]) => `${k}\t${v}`)
      .sort();
    const sourceKey = await sha256hex(`${list.id}\n${String(title).trim()}\n${entries.join("\n")}`);

    // Idempotency: if an active task with this exact content exists, skip.
    const { data: existing } = await db.from("tasks").select("id")
      .eq("source_key", sourceKey).is("deleted_at", null).maybeSingle();
    if (existing) return json({ ok: true, skipped: true, task_id: existing.id });

    const today = new Date().toISOString().slice(0, 10);
    const { data: task, error: taskErr } = await db.from("tasks").insert({
      space_id: space.id, folder_id: folder.id, list_id: list.id, source_key: sourceKey,
      title: String(title).trim(), status: status || "To Do", priority: "Medium",
      assignee: assignTo || "", assignees: assignTo ? [assignTo] : [],
      updated_by: "Google Sheets", updated_at: new Date().toISOString(),
    }).select("id").single();
    if (taskErr) {
      // Unique index rejected a race duplicate — treat as already-created.
      return json({ ok: true, skipped: true, error: taskErr.message });
    }

    const { data: defs } = await db.from("space_fields").select("id, field_name").eq("list_id", list.id);
    const byName = new Map((defs || []).map((d) => [String(d.field_name).toLowerCase(), d.id]));
    const rows: Record<string, string>[] = [];
    for (const [name, value] of Object.entries(fields || {})) {
      if (value == null || String(value).trim() === "") continue;
      const fid = byName.get(String(name).toLowerCase());
      if (fid) rows.push({ task_id: task.id, field_id: fid, value: String(value) });
    }
    const startId = byName.get("start date");
    if (startId) rows.push({ task_id: task.id, field_id: startId, value: today });
    if (rows.length) await db.from("task_field_values").insert(rows);

    return json({ ok: true, task_id: task.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
