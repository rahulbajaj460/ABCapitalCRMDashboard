import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { Card } from "./charts";
import { statusColor } from "../chartUtils";

// "2026-06" → "Jun 2026"; "Undated" passes through.
function monthLabel(ym) {
  if (!ym || ym === "Undated") return "Undated";
  const [y, m] = ym.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

// Month × status matrix for one list, grouped by the created_time field.
function MonthlyLeadReport({ listId, listName, onOpenScope, scope }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      const { data, error } = await supabase.rpc("lead_monthly_report", { p_list_id: listId });
      if (!alive) return;
      if (error) setErr(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [listId]);

  // Build the pivot: distinct months (newest first, Undated last) × distinct
  // statuses (ordered by grand total, biggest first).
  const monthSet = new Map();   // ym -> { [status]: cnt, total }
  const statusTotals = new Map();
  let grand = 0;
  for (const r of rows || []) {
    const ym = r.ym || "Undated";
    if (!monthSet.has(ym)) monthSet.set(ym, { total: 0 });
    const row = monthSet.get(ym);
    row[r.status] = (row[r.status] || 0) + Number(r.cnt);
    row.total += Number(r.cnt);
    statusTotals.set(r.status, (statusTotals.get(r.status) || 0) + Number(r.cnt));
    grand += Number(r.cnt);
  }
  const statuses = [...statusTotals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const months = [...monthSet.keys()].sort((a, b) => {
    if (a === "Undated") return 1;
    if (b === "Undated") return -1;
    return a < b ? 1 : -1; // newest first
  });

  const th = { textAlign: "right", padding: "7px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
  const td = { textAlign: "right", padding: "7px 10px", fontSize: 12.5, color: "#111827", whiteSpace: "nowrap", borderBottom: "1px solid #f2f2f2" };

  return (
    <Card
      title={`Monthly Lead Report — ${listName}`}
      tip="Leads grouped by the month of their created_time, broken down by task status. 'Undated' = leads with no created_time yet. Counts every task in the list (not just yours)."
      style={{ marginBottom: 16 }}
    >
      {err ? (
        <div style={{ fontSize: 12.5, color: "#b91c1c" }}>
          {err.includes("function") ? "Report isn't available yet — run db/lead_monthly_report.sql in Supabase." : err}
        </div>
      ) : loading ? (
        <div style={{ fontSize: 12.5, color: "#9ca3af" }}>Loading report…</div>
      ) : months.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#9ca3af" }}>No leads in this list yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Month</th>
                {statuses.map((s) => (
                  <th key={s} style={th}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColor(s), display: "inline-block" }} />
                      {s}
                    </span>
                  </th>
                ))}
                <th style={{ ...th, color: "#111827" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((ym) => {
                const row = monthSet.get(ym);
                const clickable = ym !== "Undated" && onOpenScope && scope;
                return (
                  <tr key={ym}
                    onClick={clickable ? () => onOpenScope({ ...scope, list_id: listId }, null) : undefined}
                    style={clickable ? { cursor: "pointer" } : undefined}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600, color: ym === "Undated" ? "#9ca3af" : "#111827" }}>{monthLabel(ym)}</td>
                    {statuses.map((s) => (
                      <td key={s} style={{ ...td, color: row[s] ? "#111827" : "#d1d5db" }}>{row[s] || 0}</td>
                    ))}
                    <td style={{ ...td, fontWeight: 700 }}>{row.total}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, textAlign: "left", fontWeight: 700, borderTop: "2px solid #e5e7eb", borderBottom: "none" }}>Total</td>
                {statuses.map((s) => (
                  <td key={s} style={{ ...td, fontWeight: 700, borderTop: "2px solid #e5e7eb", borderBottom: "none" }}>{statusTotals.get(s) || 0}</td>
                ))}
                <td style={{ ...td, fontWeight: 800, borderTop: "2px solid #e5e7eb", borderBottom: "none" }}>{grand}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

// Finds every list under the given scope (space or folder) that has a
// created_time field, and renders a monthly report for each. So the report
// surfaces automatically wherever created_time is configured.
export default function MonthlyLeadReportScope({ spaceId, folderId, onOpenScope }) {
  const [lists, setLists] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let lq = supabase.from("lists").select("id, name, folder_id, space_id").is("deleted_at", null);
      if (folderId) lq = lq.eq("folder_id", folderId);
      else if (spaceId) lq = lq.eq("space_id", spaceId);
      else { setLists([]); return; }
      const { data: allLists } = await lq;
      const ids = (allLists || []).map((l) => l.id);
      if (!ids.length) { if (alive) setLists([]); return; }
      const { data: fields } = await supabase
        .from("space_fields").select("list_id").ilike("field_name", "created_time").in("list_id", ids);
      const withCreated = new Set((fields || []).map((f) => f.list_id));
      if (alive) setLists((allLists || []).filter((l) => withCreated.has(l.id)));
    })();
    return () => { alive = false; };
  }, [spaceId, folderId]);

  if (!lists.length) return null;
  return (
    <>
      {lists.map((l) => (
        <MonthlyLeadReport
          key={l.id} listId={l.id} listName={l.name} onOpenScope={onOpenScope}
          scope={{ space_id: l.space_id, folder_id: l.folder_id }}
        />
      ))}
    </>
  );
}
