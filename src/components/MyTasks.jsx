import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function MyTasks({ profile }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyTasks();
  }, [profile]);

  async function fetchMyTasks() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .eq("assignee_id", profile.id)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (data) setTasks(data);
    setLoading(false);
  }

  async function updateStatus(taskId, newStatus) {
    await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    fetchMyTasks();
  }

  function getPriorityStyle(priority) {
    if (priority === "High") return { background: "#fee2e2", color: "#b91c1c" };
    if (priority === "Low") return { background: "#dcfce7", color: "#15803d" };
    return { background: "#fef9c3", color: "#854d0e" };
  }

  const overdue = tasks.filter(
    (t) =>
      t.due_date && new Date(t.due_date) < new Date() && t.status !== "Done",
  );
  const upcoming = tasks.filter(
    (t) => !overdue.find((o) => o.id === t.id) && t.status !== "Done",
  );
  const done = tasks.filter((t) => t.status === "Done");

  function renderGroup(title, groupTasks, color) {
    if (groupTasks.length === 0) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "2px 10px",
              borderRadius: 20,
              background: color.bg,
              color: color.text,
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 12, color: "#aaa" }}>
            {groupTasks.length}
          </span>
        </div>
        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e8e8",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table className="task-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Priority</th>
                <th>Due date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groupTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{task.title}</div>
                    {task.description && (
                      <div
                        style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}
                      >
                        {task.description.slice(0, 60)}
                        {task.description.length > 60 ? "..." : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={getPriorityStyle(task.priority)}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td
                    style={{
                      fontSize: 12,
                      color:
                        task.due_date &&
                        new Date(task.due_date) < new Date() &&
                        task.status !== "Done"
                          ? "#b91c1c"
                          : "#555",
                      fontWeight:
                        task.due_date &&
                        new Date(task.due_date) < new Date() &&
                        task.status !== "Done"
                          ? 600
                          : 400,
                    }}
                  >
                    {task.due_date
                      ? new Date(task.due_date) < new Date() &&
                        task.status !== "Done"
                        ? `⚠️ ${task.due_date}`
                        : task.due_date
                      : "—"}
                  </td>
                  <td>
                    <select
                      value={task.status}
                      onChange={(e) => updateStatus(task.id, e.target.value)}
                      style={{ fontSize: 11, padding: "3px 6px" }}
                    >
                      {["To Do", "In Progress", "In Review", "Done"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">My Tasks</div>
          <div className="page-subtitle">
            {profile?.full_name} · {tasks.length} task
            {tasks.length !== 1 ? "s" : ""} assigned
          </div>
        </div>
      </div>

      <div className="content-area">
        {loading ? (
          <div style={{ color: "#aaa", fontSize: 13 }}>
            Loading your tasks...
          </div>
        ) : tasks.length === 0 ? (
          <div
            style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14 }}>No tasks assigned to you yet</div>
          </div>
        ) : (
          <>
            {renderGroup("Overdue", overdue, {
              bg: "#fee2e2",
              text: "#b91c1c",
            })}
            {renderGroup("In Progress", upcoming, {
              bg: "#fef9c3",
              text: "#854d0e",
            })}
            {renderGroup("Done", done, { bg: "#dcfce7", text: "#15803d" })}
          </>
        )}
      </div>
    </div>
  );
}
