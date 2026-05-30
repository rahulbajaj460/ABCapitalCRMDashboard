import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function Dashboard({ spaces, onNavigate, onSpaceSelect }) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    const { data } = await supabase.from("tasks").select("*");
    if (data) setTasks(data);
  }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const urgent = tasks.filter(
    (t) => t.priority === "High" && t.status !== "Done",
  ).length;

  const byStatus = tasks.reduce((acc, task) => {
    const key = task.status || "To Do";
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            Overview of all tasks across spaces
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate("tasks")}>
          + New Task
        </button>
      </div>

      <div className="content-area">
        {/* Metrics */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Total tasks</div>
            <div className="metric-value">{total}</div>
            <div className="metric-sub">across all spaces</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">In progress</div>
            <div className="metric-value" style={{ color: "#d97706" }}>
              {inProgress}
            </div>
            <div className="metric-sub">active work</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Completed</div>
            <div className="metric-value" style={{ color: "#16a34a" }}>
              {done}
            </div>
            <div className="metric-sub">
              {total > 0 ? Math.round((done / total) * 100) : 0}% completion
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Urgent</div>
            <div className="metric-value" style={{ color: "#dc2626" }}>
              {urgent}
            </div>
            <div className="metric-sub">high priority open</div>
          </div>
        </div>

        {/* Spaces overview */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            Spaces
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {spaces.map((space) => {
              const spaceTasks = tasks.filter((t) => t.space_id === space.id);
              const spaceDone = spaceTasks.filter(
                (t) => t.status === "Done",
              ).length;
              return (
                <div
                  key={space.id}
                  onClick={() => onSpaceSelect(space)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e8e8e8",
                    borderRadius: 8,
                    padding: "14px 16px",
                    cursor: "pointer",
                    borderLeft: `4px solid ${space.color}`,
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}
                  >
                    {space.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {spaceTasks.length} tasks · {spaceDone} done
                  </div>
                </div>
              );
            })}
            {spaces.length === 0 && (
              <div style={{ fontSize: 13, color: "#aaa", padding: "20px 0" }}>
                No spaces yet — create one from the sidebar
              </div>
            )}
          </div>
        </div>

        {/* Kanban board */}
        {total > 0 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              Task board
            </div>
            <div className="kanban-board">
              {Object.entries(byStatus).map(([status, statusTasks]) => (
                <div key={status} className="kanban-col">
                  <div className="kanban-col-header">
                    <span>{status}</span>
                    <span
                      style={{
                        background: "#e8e8e8",
                        borderRadius: 20,
                        padding: "1px 8px",
                        fontSize: 11,
                      }}
                    >
                      {statusTasks.length}
                    </span>
                  </div>
                  {statusTasks.map((task) => (
                    <div key={task.id} className="kanban-card">
                      <div className="kanban-card-title">{task.title}</div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 7px",
                            borderRadius: 20,
                            background:
                              task.priority === "High"
                                ? "#fee2e2"
                                : task.priority === "Low"
                                  ? "#dcfce7"
                                  : "#fef9c3",
                            color:
                              task.priority === "High"
                                ? "#b91c1c"
                                : task.priority === "Low"
                                  ? "#15803d"
                                  : "#854d0e",
                          }}
                        >
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: "#aaa" }}>
                            {task.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {total === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #e8e8e8",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Welcome to AB Capital Workspace
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#888",
                marginBottom: 24,
                lineHeight: 1.8,
              }}
            >
              Get started in 3 steps
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              {[
                {
                  step: "1",
                  icon: "🗂️",
                  title: "Create a Space",
                  desc: "e.g. VAT & Corporate Tax",
                },
                {
                  step: "2",
                  icon: "📁",
                  title: "Add Folders",
                  desc: "e.g. VAT Compliance",
                },
                {
                  step: "3",
                  icon: "✅",
                  title: "Create Tasks",
                  desc: "Assign to team members",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  style={{
                    background: "#f5f5f4",
                    borderRadius: 8,
                    padding: "16px 20px",
                    width: 160,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>
                    {item.icon}
                  </div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
