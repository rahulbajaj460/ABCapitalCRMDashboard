import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { Kpi, Card, Donut, HBars, TrendBars, ProgressBar, DeltaBadge, SegmentBar } from "./charts";
import { statusColor, PALETTE } from "../chartUtils";

function AttentionRows({ items, kind, onOpenScope, empty }) {
  if (!items || items.length === 0) return <div style={{ fontSize: 12, color: "#9ca3af" }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((t) => (
        <div key={t.id} onClick={() => onOpenScope?.({ space_id: t.space_id, list_id: t.list_id }, t.id)}
          style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f4f4f4", fontSize: 12.5, cursor: "pointer" }}>
          <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || "Untitled"}</span>
          <span style={{ flexShrink: 0, fontWeight: 600, color: kind === "overdue" ? "#dc2626" : kind === "stuck" ? "#b45309" : "#6b7280" }}>
            {kind === "overdue" && `${t.days}d overdue`}
            {kind === "stuck" && `${t.days}d idle`}
            {kind === "unassigned" && "unassigned"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ spaces, onNavigate, onSpaceSelect, onOpenScope }) {
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

            {/* Executive row: velocity · aging · cycle */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
              <Card title="Velocity (last 30 days)">
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>{data.created_30d}</div>
                    <div style={{ fontSize: 11.5, color: "#6b7280" }}>created</div>
                    <div style={{ marginTop: 2 }}><DeltaBadge curr={data.created_30d} prev={data.created_prev_30d} goodWhenUp={false} /></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#15803d" }}>{data.completed_30d}</div>
                    <div style={{ fontSize: 11.5, color: "#6b7280" }}>completed</div>
                    <div style={{ marginTop: 2 }}><DeltaBadge curr={data.completed_30d} prev={data.completed_prev_30d} goodWhenUp /></div>
                  </div>
                </div>
                {(() => {
                  const net = (data.created_30d || 0) - (data.completed_30d || 0);
                  return (
                    <div style={{ marginTop: 12, fontSize: 12, color: net > 0 ? "#b45309" : "#15803d", fontWeight: 600 }}>
                      {net > 0 ? `Backlog grew by ${net}` : net < 0 ? `Backlog shrank by ${Math.abs(net)}` : "Backlog flat"} this month
                    </div>
                  );
                })()}
              </Card>
              <Card title="Overdue aging">
                <SegmentBar segs={[
                  { label: "0–7d", value: data.overdue_0_7 || 0, color: "#f59e0b" },
                  { label: "8–30d", value: data.overdue_8_30 || 0, color: "#f97316" },
                  { label: "30d+", value: data.overdue_30p || 0, color: "#dc2626" },
                ]} />
                <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
                  Oldest overdue: <strong style={{ color: "#dc2626" }}>{data.oldest_overdue_days || 0} days</strong>
                </div>
              </Card>
              <Card title="Delivery quality (90 days)">
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>{data.cycle_time_avg ?? "—"}</div>
                    <div style={{ fontSize: 11.5, color: "#6b7280" }}>avg days to complete</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: (data.on_time_pct ?? 100) >= 80 ? "#15803d" : "#b45309" }}>{data.on_time_pct ?? "—"}{data.on_time_pct != null ? "%" : ""}</div>
                    <div style={{ fontSize: 11.5, color: "#6b7280" }}>completed on time</div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Attention + deadlines */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.6fr) minmax(220px, 1fr)", gap: 16, marginBottom: 16 }}>
              <Card title="Needs attention">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Most overdue</div>
                    <AttentionRows items={data.attention?.top_overdue} kind="overdue" onOpenScope={onOpenScope} empty="None overdue" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Stuck (30d+ idle)</div>
                    <AttentionRows items={data.attention?.stuck} kind="stuck" onOpenScope={onOpenScope} empty="Nothing stuck" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Unassigned high-priority</div>
                    <AttentionRows items={data.attention?.unassigned_high} kind="unassigned" onOpenScope={onOpenScope} empty="All assigned" />
                  </div>
                </div>
              </Card>
              <Card title="Deadline calendar">
                {[
                  { label: "Next 7 days", value: data.due_7d, color: "#dc2626" },
                  { label: "Next 30 days", value: data.due_30d, color: "#f59e0b" },
                  { label: "Next 90 days", value: data.due_90d, color: "#0d7d82" },
                ].map((w) => (
                  <div key={w.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #f4f4f4" }}>
                    <span style={{ fontSize: 12.5, color: "#374151" }}>{w.label}</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: w.color }}>{w.value}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>Open tasks with a due date (statutory & internal). Open a space's Overview for the list.</div>
              </Card>
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
                {(() => {
                  const rows = data.by_assignee || [];
                  const opens = rows.map((r) => r.open).sort((a, b) => a - b);
                  const median = opens.length ? opens[Math.floor(opens.length / 2)] : 0;
                  const anomalyAt = Math.max(100, median * 5);
                  return (
                    <HBars
                      emptyText="No assignees yet"
                      data={rows.map((a, i) => {
                        const anomaly = a.open >= anomalyAt;
                        return {
                          label: anomaly ? `⚠ ${a.name}` : a.name,
                          value: a.open,
                          sub: anomaly
                            ? `${a.open} open · likely bulk/system`
                            : `${a.open} open${a.overdue > 0 ? ` · ${a.overdue} overdue` : ""}`,
                          color: anomaly ? "#9ca3af" : a.overdue > 0 ? "#ef4444" : PALETTE[i % PALETTE.length],
                        };
                      })}
                    />
                  );
                })()}
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
