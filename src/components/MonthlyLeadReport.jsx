import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Card } from "./charts";
import { statusColor } from "../chartUtils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One consolidated Monthly Lead Report: rows = lists (that have a created_time
// field), columns = task statuses, for a single month/year chosen with the
// dropdowns. Counts come from the lead_monthly_report RPC (one call per list).
export default function MonthlyLeadReportScope({ spaceId, folderId, onOpenScope }) {
  const [lists, setLists] = useState([]);        // [{id,name,folder_id,space_id}]
  const [byList, setByList] = useState({});      // listId -> [{ym,status,cnt}]
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);      // 1..12

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let lq = supabase.from("lists").select("id, name, folder_id, space_id").is("deleted_at", null);
      if (folderId) lq = lq.eq("folder_id", folderId);
      else if (spaceId) lq = lq.eq("space_id", spaceId);
      else { setLists([]); setLoading(false); return; }
      const { data: allLists } = await lq;
      const ids = (allLists || []).map((l) => l.id);
      if (!ids.length) { if (alive) { setLists([]); setLoading(false); } return; }
      const { data: fields } = await supabase
        .from("space_fields").select("list_id").ilike("field_name", "created_time").in("list_id", ids);
      const withCreated = new Set((fields || []).map((f) => f.list_id));
      const cand = (allLists || []).filter((l) => withCreated.has(l.id));
      const results = await Promise.all(
        cand.map((l) => supabase.rpc("lead_monthly_report", { p_list_id: l.id })
          .then(({ data }) => ({ id: l.id, rows: data || [] })))
      );
      if (!alive) return;
      const map = {};
      results.forEach((r) => { map[r.id] = r.rows; });
      setLists(cand);
      setByList(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [spaceId, folderId]);

  // Default the picker to the most recent month that has data.
  useEffect(() => {
    if (year != null || loading) return;
    let latest = null;
    Object.values(byList).forEach((rows) => rows.forEach((r) => {
      if (r.ym && r.ym !== "Undated" && (!latest || r.ym > latest)) latest = r.ym;
    }));
    if (latest) { setYear(latest.slice(0, 4)); setMonth(Number(latest.slice(5, 7))); }
    else { const d = new Date(); setYear(String(d.getFullYear())); setMonth(d.getMonth() + 1); }
  }, [byList, loading, year]);

  const years = useMemo(() => {
    const s = new Set();
    Object.values(byList).forEach((rows) => rows.forEach((r) => {
      if (r.ym && r.ym !== "Undated") s.add(r.ym.slice(0, 4));
    }));
    const arr = [...s].sort((a, b) => b.localeCompare(a));
    return arr.length ? arr : [String(new Date().getFullYear())];
  }, [byList]);

  // Column statuses = union across all lists, ordered by overall volume.
  const statuses = useMemo(() => {
    const tot = new Map();
    Object.values(byList).forEach((rows) => rows.forEach((r) => {
      tot.set(r.status, (tot.get(r.status) || 0) + Number(r.cnt));
    }));
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [byList]);

  const ymSel = year && month ? `${year}-${String(month).padStart(2, "0")}` : null;

  const rows = lists.map((l) => {
    const cells = {};
    let total = 0;
    (byList[l.id] || []).forEach((r) => {
      if (r.ym === ymSel) { cells[r.status] = (cells[r.status] || 0) + Number(r.cnt); total += Number(r.cnt); }
    });
    return { list: l, cells, total };
  });
  const colTotals = {};
  let grand = 0;
  rows.forEach((row) => { statuses.forEach((s) => { colTotals[s] = (colTotals[s] || 0) + (row.cells[s] || 0); }); grand += row.total; });

  const th = { textAlign: "right", padding: "7px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
  const td = { textAlign: "right", padding: "7px 10px", fontSize: 12.5, color: "#111827", whiteSpace: "nowrap", borderBottom: "1px solid #f2f2f2" };
  const selStyle = { fontSize: 13, padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" };

  if (!loading && lists.length === 0) return null;

  return (
    <Card
      title="Monthly Lead Report"
      tip="Leads per list for the selected month, by task status. Pick month and year above. Counts each task once by the month of its created_time."
      style={{ marginBottom: 16 }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "#6b7280" }}>Showing</span>
        <select value={month ?? ""} onChange={(e) => setMonth(Number(e.target.value))} style={selStyle}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year ?? ""} onChange={(e) => setYear(e.target.value)} style={selStyle}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: "#9ca3af" }}>Loading report…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>List</th>
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
              {rows.map((row) => {
                const clickable = onOpenScope;
                return (
                  <tr key={row.list.id}
                    onClick={clickable ? () => onOpenScope({ space_id: row.list.space_id, folder_id: row.list.folder_id, list_id: row.list.id }, null) : undefined}
                    style={clickable ? { cursor: "pointer" } : undefined}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{row.list.name}</td>
                    {statuses.map((s) => (
                      <td key={s} style={{ ...td, color: row.cells[s] ? "#111827" : "#d1d5db" }}>{row.cells[s] || 0}</td>
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
                  <td key={s} style={{ ...td, fontWeight: 700, borderTop: "2px solid #e5e7eb", borderBottom: "none" }}>{colTotals[s] || 0}</td>
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
