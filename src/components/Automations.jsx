import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// Trigger / action / condition vocabularies. The Phase 3 engine reads these.
const TRIGGERS = [
  { value: "assigned", label: "Task is assigned" },
  { value: "status_changed", label: "Status changes" },
  { value: "comment_mention", label: "Comment or @mention" },
  { value: "date_based", label: "Date approaching / passed" },
  { value: "task_created", label: "Task is created" },
];
const OPS = [
  ["is", "is"], ["is_not", "is not"], ["contains", "contains"],
  ["is_set", "is set"], ["is_empty", "is empty"],
];
const ACTION_TYPES = [
  { value: "notify", label: "Send notification" },
  { value: "change_status", label: "Change status" },
  { value: "assign", label: "Assign to user" },
  { value: "set_field", label: "Set a field value" },
];
const RECIPIENT_PRESETS = [
  { value: "assignee", label: "Assignee" },
  { value: "creator", label: "Task creator" },
  { value: "admins", label: "All admins" },
];

const uid = () => `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const blankAutomation = () => ({
  name: "",
  enabled: true,
  scope_type: "space",
  scope_id: "",
  trigger: { type: "assigned", params: {} },
  conditions: [],
  actions: [{ id: uid(), type: "notify", params: { recipients: ["assignee"], channels: ["in_app"] } }],
});

export default function Automations({ open, onClose, spaces, members, profile }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // automation being edited (or new)
  const [lists, setLists] = useState([]);       // lists in the selected space
  const [scopeFields, setScopeFields] = useState([]);   // fields for chosen list
  const [scopeStatuses, setScopeStatuses] = useState([]); // statuses for chosen list

  useEffect(() => { if (open) fetchAutomations(); }, [open]);

  async function fetchAutomations() {
    const { data } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
    setRows(data || []);
  }

  // When editing an automation, load lists/fields/statuses for its scope.
  useEffect(() => {
    if (!editing) return;
    if (editing.scope_type === "list") {
      // Load all lists (across spaces) so the picker is populated for new rules.
      supabase.from("lists").select("id, name, folder_id, space_id").is("deleted_at", null).order("name")
        .then(({ data }) => setLists(data || []));
    } else {
      const spaceId = editing.scope_type === "space" ? editing.scope_id : spaceOfScope(editing);
      if (spaceId) {
        supabase.from("lists").select("id, name, folder_id, space_id").eq("space_id", spaceId).is("deleted_at", null)
          .then(({ data }) => setLists(data || []));
      } else setLists([]);
    }
    const listId = editing.scope_type === "list" ? editing.scope_id : null;
    if (listId) {
      supabase.from("space_fields").select("id, field_name, field_type").eq("list_id", listId)
        .then(({ data }) => setScopeFields(data || []));
      supabase.from("space_statuses").select("name").eq("list_id", listId).order("status_order")
        .then(({ data }) => setScopeStatuses((data || []).map((s) => s.name)));
    } else {
      setScopeFields([]);
      setScopeStatuses(["To Do", "In Progress", "Done"]);
    }
  }, [editing?.scope_type, editing?.scope_id]);

  function spaceOfScope(a) {
    if (a.scope_type === "space") return a.scope_id;
    if (a.scope_type === "folder") return spaces.find((s) => (s.folders || []).some((f) => f.id === a.scope_id))?.id;
    // list: find via lists list
    return null;
  }

  async function saveAutomation() {
    if (!editing.name.trim() || !editing.scope_id) {
      alert("Give the automation a name and pick a scope.");
      return;
    }
    const payload = {
      name: editing.name.trim(),
      enabled: editing.enabled,
      scope_type: editing.scope_type,
      scope_id: editing.scope_id,
      trigger: editing.trigger,
      conditions: editing.conditions,
      actions: editing.actions,
      created_by: profile?.full_name || null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("automations").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("automations").insert(payload));
    }
    if (error) { alert("Could not save: " + error.message); return; }
    setEditing(null);
    fetchAutomations();
  }

  async function toggleEnabled(a) {
    await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id);
    fetchAutomations();
  }
  async function removeAutomation(a) {
    if (!confirm(`Delete automation "${a.name}"?`)) return;
    await supabase.from("automations").delete().eq("id", a.id);
    fetchAutomations();
  }

  // ── Builder field helpers ──
  const folders = spaces.flatMap((s) => (s.folders || []).map((f) => ({ ...f, spaceName: s.name })));
  const conditionFields = [
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "assignee", label: "Assignee" },
    { value: "due_date", label: "Due date" },
    ...scopeFields.map((f) => ({ value: `field_${f.id}`, label: f.field_name })),
  ];
  const dateFields = [
    { value: "due_date", label: "Due date" },
    ...scopeFields.filter((f) => f.field_type === "date").map((f) => ({ value: `field_${f.id}`, label: f.field_name })),
  ];

  function upd(patch) { setEditing((e) => ({ ...e, ...patch })); }
  function updTrigger(patch) { setEditing((e) => ({ ...e, trigger: { ...e.trigger, params: { ...e.trigger.params, ...patch } } })); }
  function addCondition() { setEditing((e) => ({ ...e, conditions: [...e.conditions, { id: uid(), field: "status", op: "is", value: "" }] })); }
  function updCondition(id, patch) { setEditing((e) => ({ ...e, conditions: e.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) })); }
  function rmCondition(id) { setEditing((e) => ({ ...e, conditions: e.conditions.filter((c) => c.id !== id) })); }
  function addAction() { setEditing((e) => ({ ...e, actions: [...e.actions, { id: uid(), type: "notify", params: { recipients: ["assignee"], channels: ["in_app"] } }] })); }
  function updAction(id, params) { setEditing((e) => ({ ...e, actions: e.actions.map((a) => (a.id === id ? { ...a, ...params } : a)) })); }
  function rmAction(id) { setEditing((e) => ({ ...e, actions: e.actions.filter((a) => a.id !== id) })); }

  if (!open) return null;

  const sel = { fontSize: 13, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" };
  const memberNames = members.map((m) => m.full_name).filter(Boolean);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720, width: "92%", maxHeight: "88vh", overflowY: "auto" }}>
        {!editing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="modal-title" style={{ margin: 0 }}>⚡ Automations</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setEditing(blankAutomation())}>+ New automation</button>
                <button className="btn btn-sm" onClick={onClose}>Close</button>
              </div>
            </div>
            {rows.length === 0 && (
              <div style={{ fontSize: 13, color: "#9ca3af", padding: "28px 12px", textAlign: "center" }}>
                No automations yet. Create one to notify people or update tasks automatically.
              </div>
            )}
            {rows.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #e8e8e8", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    When {TRIGGERS.find((t) => t.value === a.trigger?.type)?.label || a.trigger?.type}
                    {a.conditions?.length ? ` · ${a.conditions.length} condition(s)` : ""}
                    {` · ${a.actions?.length || 0} action(s)`} · {a.scope_type}
                  </div>
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={a.enabled} onChange={() => toggleEnabled(a)} />
                  {a.enabled ? "On" : "Off"}
                </label>
                <button className="btn btn-sm" onClick={() => setEditing({ ...a, conditions: a.conditions || [], actions: a.actions || [] })}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeAutomation(a)}>🗑</button>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="modal-title">{editing.id ? "Edit automation" : "New automation"}</div>

            {/* Name + enabled */}
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={editing.name} onChange={(e) => upd({ name: e.target.value })} placeholder="e.g. Notify manager on Done" />
            </div>

            {/* Scope */}
            <div className="form-group">
              <label className="form-label">Applies to</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={editing.scope_type} onChange={(e) => upd({ scope_type: e.target.value, scope_id: "" })} style={sel}>
                  <option value="space">Space</option>
                  <option value="folder">Folder</option>
                  <option value="list">List</option>
                </select>
                <select value={editing.scope_id} onChange={(e) => upd({ scope_id: e.target.value })} style={{ ...sel, flex: 1, minWidth: 180 }}>
                  <option value="">Select {editing.scope_type}…</option>
                  {editing.scope_type === "space" && spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {editing.scope_type === "folder" && folders.map((f) => <option key={f.id} value={f.id}>{f.spaceName} / {f.name}</option>)}
                  {editing.scope_type === "list" && lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>

            {/* Trigger */}
            <div className="form-group">
              <label className="form-label">When (trigger)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={editing.trigger.type} onChange={(e) => upd({ trigger: { type: e.target.value, params: {} } })} style={sel}>
                  {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                {editing.trigger.type === "status_changed" && (
                  <>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>to</span>
                    <select value={editing.trigger.params.to || ""} onChange={(e) => updTrigger({ to: e.target.value })} style={sel}>
                      <option value="">any status</option>
                      {scopeStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
                )}
                {editing.trigger.type === "date_based" && (
                  <>
                    <select value={editing.trigger.params.direction || "before"} onChange={(e) => updTrigger({ direction: e.target.value })} style={sel}>
                      <option value="before">before</option>
                      <option value="after">after</option>
                    </select>
                    <input type="number" min="0" value={editing.trigger.params.days ?? 3} onChange={(e) => updTrigger({ days: Number(e.target.value) })} style={{ ...sel, width: 70 }} />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>days of</span>
                    <select value={editing.trigger.params.field || "due_date"} onChange={(e) => updTrigger({ field: e.target.value })} style={sel}>
                      {dateFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>

            {/* Conditions */}
            <div className="form-group">
              <label className="form-label">If (conditions — all must match)</label>
              {editing.conditions.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <select value={c.field} onChange={(e) => updCondition(c.id, { field: e.target.value, value: "" })} style={sel}>
                    {conditionFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={c.op} onChange={(e) => updCondition(c.id, { op: e.target.value })} style={sel}>
                    {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {c.op !== "is_set" && c.op !== "is_empty" && (
                    valueOptionsFor(c.field) ? (
                      <select value={c.value} onChange={(e) => updCondition(c.id, { value: e.target.value })} style={{ ...sel, flex: 1 }}>
                        <option value="">Select…</option>
                        {valueOptionsFor(c.field).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={c.value} onChange={(e) => updCondition(c.id, { value: e.target.value })} placeholder="Value…" style={{ ...sel, flex: 1 }} />
                    )
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => rmCondition(c.id)}>🗑</button>
                </div>
              ))}
              <button onClick={addCondition} style={{ background: "none", border: "none", color: "#1d4ed8", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}>+ Add condition</button>
            </div>

            {/* Actions */}
            <div className="form-group">
              <label className="form-label">Then (actions)</label>
              {editing.actions.map((a) => (
                <div key={a.id} style={{ border: "1px solid #e8e8e8", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <select value={a.type} onChange={(e) => updAction(a.id, { type: e.target.value, params: defaultActionParams(e.target.value) })} style={sel}>
                      {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-sm btn-danger" onClick={() => rmAction(a.id)}>🗑</button>
                  </div>
                  {a.type === "notify" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Recipients</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {[...RECIPIENT_PRESETS.map((r) => r.value), ...memberNames].map((r) => {
                            const on = (a.params.recipients || []).includes(r);
                            const label = RECIPIENT_PRESETS.find((p) => p.value === r)?.label || r;
                            return (
                              <button key={r} onClick={() => {
                                const list = a.params.recipients || [];
                                const next = on ? list.filter((x) => x !== r) : [...list, r];
                                updAction(a.id, { params: { ...a.params, recipients: next } });
                              }} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, cursor: "pointer", border: "1px solid " + (on ? "#1d4ed8" : "#d1d5db"), background: on ? "#eff6ff" : "#fff", color: on ? "#1d4ed8" : "#374151" }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        {["in_app", "email"].map((ch) => {
                          const on = (a.params.channels || []).includes(ch);
                          return (
                            <label key={ch} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
                              <input type="checkbox" checked={on} onChange={() => {
                                const list = a.params.channels || [];
                                const next = on ? list.filter((x) => x !== ch) : [...list, ch];
                                updAction(a.id, { params: { ...a.params, channels: next } });
                              }} />
                              {ch === "in_app" ? "In-app" : "Email"}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {a.type === "change_status" && (
                    <select value={a.params.to || ""} onChange={(e) => updAction(a.id, { params: { to: e.target.value } })} style={sel}>
                      <option value="">Select status…</option>
                      {scopeStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  {a.type === "assign" && (
                    <select value={a.params.user || ""} onChange={(e) => updAction(a.id, { params: { user: e.target.value } })} style={sel}>
                      <option value="">Select user…</option>
                      {memberNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                  {a.type === "set_field" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={a.params.field || ""} onChange={(e) => updAction(a.id, { params: { ...a.params, field: e.target.value } })} style={sel}>
                        <option value="">Select field…</option>
                        {scopeFields.map((f) => <option key={f.id} value={`field_${f.id}`}>{f.field_name}</option>)}
                      </select>
                      <input value={a.params.value || ""} onChange={(e) => updAction(a.id, { params: { ...a.params, value: e.target.value } })} placeholder="Value…" style={{ ...sel, flex: 1 }} />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addAction} style={{ background: "none", border: "none", color: "#1d4ed8", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}>+ Add action</button>
            </div>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, margin: "6px 0 14px" }}>
              <input type="checkbox" checked={editing.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
              Enabled
            </label>

            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAutomation}>Save automation</button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  function valueOptionsFor(field) {
    if (field === "status") return scopeStatuses;
    if (field === "priority") return ["High", "Medium", "Low"];
    if (field === "assignee") return memberNames;
    const f = scopeFields.find((x) => `field_${x.id}` === field);
    if (f?.field_type === "dropdown" && f.field_options?.length) return f.field_options;
    return null;
  }
  function defaultActionParams(type) {
    if (type === "notify") return { recipients: ["assignee"], channels: ["in_app"] };
    return {};
  }
}
