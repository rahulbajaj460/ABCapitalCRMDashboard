import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { Kpi, Card, Donut, HBars, TrendBars, ProgressBar } from "./charts";
import { statusColor, PALETTE } from "../chartUtils";

export default function Dashboard({ spaces, onNavigate, onSpaceSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const { data: d, error } = await supabase.rpc("dashboard_overview");
    if (error) setErr(error.message);
    else setData(d);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = data?.total ?? 0;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const spaceById = Object.fromEntries((spaces || []).map((s) => [s.id, s]));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">CRM-wide summary across every space</div>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("tasks")}>+ New Task</button>
      </div>

      <div className="content-area">
        {err && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 16 }}>
            {err.includes("function") ? "Analytics aren't available yet — run db/dashboard_analytics.sql in Supabase." : err}
          </div>
        )}
        {loading && !data ? (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading analytics…</div>
        ) : total === 0 ? (
          <EmptyState />
        ) : data ? (
          <>
            {/* KPI row */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
              <Kpi label="Total tasks" value={total.toLocaleString()} sub="across all spaces" />
              <Kpi label="In progress" value={data.in_progress.toLocaleString()} sub={`${pct(data.in_progress)}% of all`} tone="warn" />
              <Kpi label="Completed" value={data.done.toLocaleString()} sub={`${pct(data.done)}% completion`} tone="good" />
              <Kpi label="Urgent open" value={data.urgent.toLocaleString()} sub="high priority, not done" tone="danger" />
              <Kpi label="Overdue" value={data.overdue.toLocaleString()} sub="past due & still open" tone="danger" />
              <Kpi label="Due in 30 days" value={data.due_30d.toLocaleString()} sub={`${data.due_7d} within 7 days`} />
            </div>

            {/* Charts row */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.3fr)", gap: 16, marginBottom: 16 }}>
              <Card title="Status distribution">
                <Donut
                  centerLabel={total.toLocaleString()} centerSub="tasks"
                  data={(data.by_status || []).slice(0, 8).map((s) => ({ label: s.status, value: s.count, color: statusColor(s.status) }))}
                />
              </Card>
              <Card title="Created vs completed (last 6 months)">
                <TrendBars data={data.trend || []} />
              </Card>
            </div>

            {/* Space health + assignee workload */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.4fr) minmax(280px, 1fr)", gap: 16, marginBottom: 16 }}>
              <Card title="Space health">
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {(data.by_space || []).map((sp) => {
                    const p = sp.total > 0 ? Math.round((sp.done / sp.total) * 100) : 0;
                    const sObj = spaceById[sp.space_id];
                    return (
                      <div key={sp.space_id} style={{ cursor: sObj ? "pointer" : "default" }} onClick={() => sObj && onSpaceSelect(sObj)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, fontSize: 12.5 }}>
                          <span style={{ fontWeight: 600, color: "#111827" }}>{sp.name}</span>
                          <span style={{ color: "#6b7280" }}>
                            {sp.total} tasks · {p}% done
                            {sp.overdue > 0 && <span style={{ color: "#b91c1c", fontWeight: 600 }}> · {sp.overdue} overdue</span>}
                          </span>
                        </div>
                        <ProgressBar pct={p} color={sObj?.color || "var(--accent)"} />
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card title="Workload by assignee">
                <HBars
                  emptyText="No assignees yet"
                  data={(data.by_assignee || []).map((a, i) => ({
                    label: a.name,
                    value: a.open,
                    sub: `${a.open} open${a.overdue > 0 ? ` · ${a.overdue} overdue` : ""}`,
                    color: a.overdue > 0 ? "#ef4444" : PALETTE[i % PALETTE.length],
                  }))}
                />
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 10, border: "1px solid #e8e8e8" }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Welcome to AB Capital Workspace</div>
      <div style={{ fontSize: 13, color: "#888", lineHeight: 1.8 }}>Create a space, add folders and lists, then create tasks — your analytics will appear here.</div>
    </div>
  );
}
