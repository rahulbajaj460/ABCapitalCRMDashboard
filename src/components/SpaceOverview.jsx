import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { fmtDate } from "../dateFormat";
import { Kpi, Card, Donut, HBars, ProgressBar, SegmentBar } from "./charts";
import { statusColor, PALETTE } from "../chartUtils";

// Per-space analytics shown in the Overview tab. Refetches whenever it mounts
// (i.e. each time the tab is opened) so it reflects current data.
export default function SpaceOverview({ space, onOpenScope }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!space?.id) return;
    setLoading(true); setErr("");
    const { data: d, error } = await supabase.rpc("space_overview", { p_space_id: space.id });
    if (error) setErr(error.message);
    else setData(d);
    setLoading(false);
  }, [space?.id]);
  useEffect(() => { load(); }, [load]);

  const total = data?.total ?? 0;
  const completedCount = data?.completed ?? data?.done ?? 0;
  const donePct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  // Group the flat list rows by folder for the health table.
  const folders = [];
  for (const row of data?.by_list || []) {
    let f = folders.find((x) => x.folder_id === row.folder_id);
    if (!f) { f = { folder_id: row.folder_id, folder: row.folder, lists: [] }; folders.push(f); }
    f.lists.push(row);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#6b7280" }}>Live overview of <strong>{space?.name}</strong> — folders, lists, status and workload.</div>
        <button className="btn btn-sm" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {err && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 8, padding: "10px 12px", fontSize: 12.5 }}>
          {err.includes("function") ? "Overview isn't available yet — run db/dashboard_analytics.sql in Supabase." : err}
        </div>
      )}

      {loading && !data ? (
        <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading overview…</div>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <Kpi label="Total tasks" value={total.toLocaleString()} sub="in this space" />
            <Kpi label="Completed" value={completedCount.toLocaleString()} sub={`${donePct}% completion`} tone="good" />
            <Kpi label="Overdue" value={(data.overdue || 0).toLocaleString()} sub="past due & open" tone="danger" />
            <Kpi label="Due in 30 days" value={(data.due_30d || 0).toLocaleString()} sub="upcoming & open" tone="warn" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.3fr) minmax(200px, 1fr)", gap: 16, marginBottom: 16 }}>
            <Card title="Overdue aging" tip="How long this space's overdue tasks have been past due: 0–7 / 8–30 / 30+ days. A large 30+ segment signals chronic backlog.">
              <SegmentBar segs={[
                { label: "0–7d", value: data.overdue_0_7 || 0, color: "#f59e0b" },
                { label: "8–30d", value: data.overdue_8_30 || 0, color: "#f97316" },
                { label: "30d+", value: data.overdue_30p || 0, color: "#dc2626" },
              ]} />
            </Card>
            <Card title="Delivery quality (90d)" tip="From tasks completed in the last 90 days in this space. 'avg days' = average creation-to-completion time. 'on time' = share completed on or before their due date.">
              <div style={{ display: "flex", gap: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{data.cycle_time_avg ?? "—"}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>avg days</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: (data.on_time_pct ?? 100) >= 80 ? "#15803d" : "#b45309" }}>{data.on_time_pct ?? "—"}{data.on_time_pct != null ? "%" : ""}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>on time</div>
                </div>
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: 16, marginBottom: 16 }}>
            <Card title="Status distribution">
              <Donut
                centerLabel={total.toLocaleString()} centerSub="tasks"
                data={(data.by_status || []).slice(0, 8).map((s) => ({ label: s.status, value: s.count, color: statusColor(s.status) }))}
              />
            </Card>
            <Card title="Workload by assignee">
              <HBars
                emptyText="No assignees yet"
                data={(data.by_assignee || []).map((a, i) => ({
                  label: a.name, value: a.open,
                  sub: `${a.open} open${a.overdue > 0 ? ` · ${a.overdue} overdue` : ""}`,
                  color: a.overdue > 0 ? "#ef4444" : PALETTE[i % PALETTE.length],
                }))}
              />
            </Card>
          </div>

          <Card title="Folders & lists" style={{ marginBottom: 16 }}>
            {folders.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#9ca3af" }}>No lists in this space yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {folders.map((f) => (
                  <div key={f.folder_id}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{f.folder}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {f.lists.map((l) => {
                        const p = l.total > 0 ? Math.round((l.done / l.total) * 100) : 0;
                        return (
                          <div key={l.list_id} onClick={() => onOpenScope?.({ space_id: space.id, folder_id: l.folder_id, list_id: l.list_id }, null)}
                            style={{ cursor: "pointer" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, fontSize: 12.5 }}>
                              <span style={{ color: "#111827" }}>{l.list}</span>
                              <span style={{ color: "#6b7280" }}>
                                {l.total} · {p}% done
                                {l.overdue > 0 && <span style={{ color: "#b91c1c", fontWeight: 600 }}> · {l.overdue} overdue</span>}
                              </span>
                            </div>
                            <ProgressBar pct={p} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`At-risk & upcoming (${(data.at_risk || []).length})`}>
            {(data.at_risk || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: "#9ca3af" }}>Nothing overdue or due within 2 weeks. 🎉</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {(data.at_risk || []).map((t) => {
                  const overdue = new Date(t.due_date) < new Date();
                  return (
                    <div key={t.id} onClick={() => onOpenScope?.({ space_id: space.id, list_id: t.list_id }, t.id)}
                      style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f2f2f2", fontSize: 12.5, cursor: "pointer" }}>
                      <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || "Untitled"}</span>
                      <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ color: "#9ca3af" }}>{t.status}</span>
                        <span style={{ color: overdue ? "#b91c1c" : "#6b7280", fontWeight: overdue ? 600 : 400 }}>{overdue ? "⚠️ " : ""}{fmtDate(t.due_date)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
