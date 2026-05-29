import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function Tasks({
  spaces,
  activeSpace,
  activeFolder,
  onRefreshSpaces,
}) {
  const [tasks, setTasks] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [newField, setNewField] = useState({
    field_name: "",
    field_type: "text",
  });
  const [newStatus, setNewStatus] = useState({ name: "", color: "#378ADD" });
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    space_id: "",
    folder_id: "",
    status: "To Do",
    priority: "Medium",
    assignee: "",
    assignee_id: "",
    due_date: "",
  });
  const [taskFieldValues, setTaskFieldValues] = useState({});
  const [modalSpaceStatuses, setModalSpaceStatuses] = useState([]);
  const [statusActionMsg, setStatusActionMsg] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  useEffect(() => {
    fetchTasks();
  }, [activeSpace, activeFolder]);

  useEffect(() => {
    if (activeSpace) {
      setNewTask((prev) => ({ ...prev, space_id: activeSpace.id }));
    }
  }, [activeSpace]);

  async function fetchTasks() {
    let query = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .order("created_at", { ascending: false });

    if (activeFolder) {
      query = query.eq("folder_id", activeFolder.id);
    } else if (activeSpace) {
      query = query.eq("space_id", activeSpace.id);
    }

    const { data } = await query;
    if (data) setTasks(data);
  }

  async function saveTask() {
    if (!newTask.title.trim()) return;
    if (!newTask.space_id) {
      if (activeSpace) newTask.space_id = activeSpace.id;
      else if (spaces.length > 0) newTask.space_id = spaces[0].id;
      else return;
    }

    const payload = {
      title: newTask.title.trim(),
      description: newTask.description,
      space_id: newTask.space_id,
      folder_id: newTask.folder_id || null,
      status: newTask.status || "To Do",
      priority: newTask.priority || "Medium",
      assignee: newTask.assignee,
      assignee_id: newTask.assignee_id || null,
      due_date: newTask.due_date || null,
    };

    let taskId;
    if (editingTask) {
      const { data } = await supabase
        .from("tasks")
        .update(payload)
        .eq("id", editingTask.id)
        .select()
        .single();
      taskId = editingTask.id;
    } else {
      const { data } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (data) taskId = data.id;
    }

    // Save custom field values
    if (taskId && Object.keys(taskFieldValues).length > 0) {
      for (const [fieldId, value] of Object.entries(taskFieldValues)) {
        const existing = editingTask?.task_field_values?.find(
          (v) => v.field_id === fieldId,
        );
        if (existing) {
          await supabase
            .from("task_field_values")
            .update({ value })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("task_field_values")
            .insert({ task_id: taskId, field_id: fieldId, value });
        }
      }
    }

    closeTaskModal();
    fetchTasks();
  }

  async function deleteTask(taskId) {
    if (!confirm("Delete this task?")) return;
    await supabase.from("tasks").delete().eq("id", taskId);
    fetchTasks();
  }

  async function updateTaskStatus(taskId, newStatus) {
    await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    fetchTasks();
  }

  async function addCustomField() {
    if (!newField.field_name.trim() || !activeSpace) return;
    const fields = activeSpace.space_fields || [];
    await supabase.from("space_fields").insert({
      space_id: activeSpace.id,
      field_name: newField.field_name.trim(),
      field_type: newField.field_type,
      field_order: fields.length + 1,
    });
    setNewField({ field_name: "", field_type: "text" });
    setShowFieldModal(false);
    onRefreshSpaces();
  }

  async function ensureDefaultStatuses() {
    if (!activeSpace) return;

    const { data: existing } = await supabase
      .from("space_statuses")
      .select("name")
      .eq("space_id", activeSpace.id);

    const existingNames = (existing || []).map((s) => s.name);

    const defaults = [
      { name: "To Do", color: "#888780", status_order: 1 },
      { name: "In Progress", color: "#d97706", status_order: 2 },
      { name: "In Review", color: "#7c3aed", status_order: 3 },
      { name: "Done", color: "#16a34a", status_order: 4 },
    ];

    const toInsert = defaults.filter((d) => !existingNames.includes(d.name));
    if (toInsert.length === 0) return;

    await supabase
      .from("space_statuses")
      .insert(toInsert.map((d) => ({ ...d, space_id: activeSpace.id })));
  }

  async function addCustomStatus() {
    if (!newStatus.name.trim() || !activeSpace) return;

    const { data: existing } = await supabase
      .from("space_statuses")
      .select("name")
      .eq("space_id", activeSpace.id);

    const existingNames = (existing || []).map((s) => s.name.toLowerCase());
    if (existingNames.includes(newStatus.name.trim().toLowerCase())) {
      setStatusActionMsg("⚠️ A status with this name already exists.");
      return;
    }

    setStatusLoading(true);
    const { error } = await supabase.from("space_statuses").insert({
      space_id: activeSpace.id,
      name: newStatus.name.trim(),
      color: newStatus.color,
      status_order: (existing?.length || 0) + 1,
    });

    if (error) {
      setStatusActionMsg("❌ Failed to add status. Please try again.");
    } else {
      const addedName = newStatus.name.trim();
      setNewStatus({ name: "", color: "#378ADD" });
      setStatusActionMsg(`✅ "${addedName}" added successfully.`);
      await fetchModalStatuses();
      await onRefreshSpaces();
      fetchTasks();
    }
    setStatusLoading(false);
  }

  async function deleteCustomField(fieldId) {
    if (
      !confirm(
        "Delete this custom field? All values stored in this field will also be deleted.",
      )
    )
      return;
    await supabase.from("space_fields").delete().eq("id", fieldId);
    onRefreshSpaces();
    fetchTasks();
  }

  async function deleteCustomStatus(statusId, statusName) {
    if (
      !confirm(
        `Delete "${statusName}"? Tasks with this status will be moved to the next available status.`,
      )
    )
      return;
    setStatusLoading(true);
    setStatusActionMsg("");

    // Get remaining statuses after deletion
    const remaining = modalSpaceStatuses.filter((s) => s.id !== statusId);
    const fallback = remaining.length > 0 ? remaining[0].name : null;

    // Move affected tasks
    if (fallback) {
      await supabase
        .from("tasks")
        .update({ status: fallback })
        .eq("space_id", activeSpace.id)
        .eq("status", statusName);
    }

    const { error } = await supabase
      .from("space_statuses")
      .delete()
      .eq("id", statusId);

    if (error) {
      setStatusActionMsg("❌ Failed to delete status. Please try again.");
      setStatusLoading(false);
      return;
    }

    const msg = fallback
      ? `✅ "${statusName}" deleted. Affected tasks moved to "${fallback}".`
      : `✅ "${statusName}" deleted.`;
    setStatusActionMsg(msg);

    // Refresh everything in correct order
    await fetchModalStatuses();
    await onRefreshSpaces();
    fetchTasks();
    setStatusLoading(false);
  }

  async function fetchModalStatuses() {
    if (!activeSpace) return;
    const { data } = await supabase
      .from("space_statuses")
      .select("*")
      .eq("space_id", activeSpace.id)
      .order("status_order");
    setModalSpaceStatuses(data || []);
    return data || [];
  }

  function openNewTask() {
    setEditingTask(null);
    setTaskFieldValues({});
    setNewTask({
      title: "",
      description: "",
      space_id: activeSpace?.id || spaces[0]?.id || "",
      folder_id: activeFolder?.id || "",
      status: getStatuses()[0] || "To Do",
      priority: "Medium",
      assignee: "",
      assignee_id: "",
      due_date: "",
    });
    setShowTaskModal(true);
  }

  function openEditTask(task) {
    setEditingTask(task);
    const fvMap = {};
    if (task.task_field_values) {
      task.task_field_values.forEach((fv) => {
        fvMap[fv.field_id] = fv.value;
      });
    }
    setTaskFieldValues(fvMap);
    setNewTask({
      title: task.title,
      description: task.description || "",
      space_id: task.space_id,
      folder_id: task.folder_id || "",
      status: task.status,
      priority: task.priority,
      assignee: task.assignee || "",
      assignee_id: task.assignee_id || "",
      due_date: task.due_date || "",
    });
    setShowTaskModal(true);
  }

  function closeTaskModal() {
    setShowTaskModal(false);
    setEditingTask(null);
    setTaskFieldValues({});
  }

  function getStatuses() {
    const dbStatuses = activeSpace?.space_statuses || [];
    if (dbStatuses.length > 0) {
      return dbStatuses
        .sort((a, b) => a.status_order - b.status_order)
        .map((s) => s.name);
    }
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  function getFields() {
    return (activeSpace?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  function getStatusColor(status) {
    if (activeSpace?.space_statuses) {
      const found = activeSpace.space_statuses.find((s) => s.name === status);
      if (found) return found.color;
    }
    const defaults = {
      "To Do": "#888",
      "In Progress": "#d97706",
      "In Review": "#7c3aed",
      Done: "#16a34a",
    };
    return defaults[status] || "#888";
  }

  function getPriorityStyle(priority) {
    if (priority === "High") return { background: "#fee2e2", color: "#b91c1c" };
    if (priority === "Low") return { background: "#dcfce7", color: "#15803d" };
    return { background: "#fef9c3", color: "#854d0e" };
  }

  function getSelectedSpaceFolders() {
    const spaceId = newTask.space_id;
    const space = spaces.find((s) => s.id === spaceId);
    return space?.folders || [];
  }

  function getSelectedSpaceStatuses() {
    const space = spaces.find((s) => s.id === newTask.space_id);
    const dbStatuses = space?.space_statuses || [];
    if (dbStatuses.length > 0) {
      return dbStatuses
        .sort((a, b) => a.status_order - b.status_order)
        .map((s) => s.name);
    }
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  function getSelectedSpaceFields() {
    const spaceId = newTask.space_id;
    const space = spaces.find((s) => s.id === spaceId);
    return (space?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const groupedTasks = getStatuses().reduce((acc, status) => {
    acc[status] = filteredTasks.filter((t) => t.status === status);
    return acc;
  }, {});

  const pageTitle = activeFolder
    ? activeFolder.name
    : activeSpace
      ? activeSpace.name
      : "All Tasks";

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">{pageTitle}</div>
          {activeSpace && (
            <div className="page-subtitle">
              {activeSpace.name}
              {activeFolder ? ` / ${activeFolder.name}` : ""}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {activeSpace && (
            <>
              <button
                className="btn btn-sm"
                onClick={() => setShowFieldModal(true)}
              >
                + Custom field
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  setStatusActionMsg("");
                  setStatusLoading(true);
                  await fetchModalStatuses();
                  setStatusLoading(false);
                  setShowStatusModal(true);
                }}
              >
                + Status
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={openNewTask}>
            + New Task
          </button>
        </div>
      </div>

      {/* Tabs — List / Board */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fff",
        }}
      >
        <div className="tabs" style={{ border: "none", padding: 0 }}>
          <div
            className={`tab ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            📋 List
          </div>
          <div
            className={`tab ${viewMode === "board" ? "active" : ""}`}
            onClick={() => setViewMode("board")}
          >
            📌 Board
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: "flex", gap: 8, padding: "8px 0" }}>
          <div className="search-wrap">
            <span style={{ color: "#aaa" }}>🔍</span>
            <input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">All statuses</option>
            {getStatuses().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="content-area">
        {/* LIST VIEW */}
        {viewMode === "list" && (
          <div>
            {getStatuses().map((status) => {
              const statusTasks = groupedTasks[status] || [];
              const isExpanded = expandedGroups[status] !== false;
              return (
                <div key={status} style={{ marginBottom: 16 }}>
                  <div
                    className="status-group-header"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [status]: !isExpanded,
                      }))
                    }
                  >
                    <span style={{ fontSize: 10 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                    <span
                      style={{
                        background: getStatusColor(status),
                        color: "#fff",
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {status}
                    </span>
                    <span style={{ fontSize: 12, color: "#aaa" }}>
                      {statusTasks.length}
                    </span>
                  </div>

                  {isExpanded && statusTasks.length > 0 && (
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        overflow: "hidden",
                        marginTop: 4,
                      }}
                    >
                      <table className="task-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Priority</th>
                            <th>Assignee</th>
                            <th>Due date</th>
                            {getFields().map((f) => (
                              <th key={f.id}>{f.field_name}</th>
                            ))}
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {statusTasks.map((task) => (
                            <tr key={task.id}>
                              <td>
                                <span
                                  style={{ fontWeight: 500, cursor: "pointer" }}
                                  onClick={() => openEditTask(task)}
                                >
                                  {task.title}
                                </span>
                                {task.description && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "#aaa",
                                      marginTop: 2,
                                    }}
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
                              <td style={{ fontSize: 13, color: "#555" }}>
                                {task.assignee || "—"}
                              </td>
                              <td
                                style={{
                                  fontSize: 12,
                                  color: task.due_date ? "#333" : "#ccc",
                                }}
                              >
                                {task.due_date || "—"}
                              </td>
                              {getFields().map((f) => {
                                const fv = task.task_field_values?.find(
                                  (v) => v.field_id === f.id,
                                );
                                return (
                                  <td
                                    key={f.id}
                                    style={{ fontSize: 12, color: "#555" }}
                                  >
                                    {fv?.value || "—"}
                                  </td>
                                );
                              })}
                              <td>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <select
                                    value={task.status}
                                    onChange={(e) =>
                                      updateTaskStatus(task.id, e.target.value)
                                    }
                                    style={{ fontSize: 11, padding: "3px 6px" }}
                                  >
                                    {getStatuses().map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => openEditTask(task)}
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => deleteTask(task.id)}
                                  >
                                    🗑
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isExpanded && statusTasks.length === 0 && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#ccc",
                        padding: "8px 12px",
                      }}
                    >
                      No tasks
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* BOARD VIEW */}
        {viewMode === "board" && (
          <div className="kanban-board">
            {getStatuses().map((status) => {
              const statusTasks = groupedTasks[status] || [];
              return (
                <div key={status} className="kanban-col">
                  <div className="kanban-col-header">
                    <span
                      style={{
                        background: getStatusColor(status),
                        color: "#fff",
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 11,
                      }}
                    >
                      {status}
                    </span>
                    <span style={{ fontSize: 12, color: "#aaa" }}>
                      {statusTasks.length}
                    </span>
                  </div>
                  {statusTasks.map((task) => (
                    <div
                      key={task.id}
                      className="kanban-card"
                      onClick={() => openEditTask(task)}
                    >
                      <div className="kanban-card-title">{task.title}</div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 6,
                        }}
                      >
                        <span
                          className="badge"
                          style={getPriorityStyle(task.priority)}
                        >
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: "#aaa" }}>
                            {task.due_date}
                          </span>
                        )}
                      </div>
                      {task.assignee && (
                        <div style={{ fontSize: 11, color: "#888" }}>
                          👤 {task.assignee}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tasks.length === 0 && (
          <div
            style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, marginBottom: 4 }}>No tasks yet</div>
            <div style={{ fontSize: 12 }}>
              Click "+ New Task" to create your first task
            </div>
          </div>
        )}
      </div>

      {/* NEW / EDIT TASK MODAL */}
      {showTaskModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeTaskModal()}
        >
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">
              {editingTask ? "Edit task" : "New task"}
            </div>

            <div className="form-group">
              <label className="form-label">Task name *</label>
              <input
                autoFocus
                placeholder="Enter task name..."
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                placeholder="Add details..."
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Space *</label>
                <select
                  value={newTask.space_id}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      space_id: e.target.value,
                      folder_id: "",
                      status: "To Do",
                    }))
                  }
                >
                  <option value="">Select space...</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Folder</label>
                <select
                  value={newTask.folder_id}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      folder_id: e.target.value,
                    }))
                  }
                >
                  <option value="">No folder</option>
                  {getSelectedSpaceFolders().map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  value={newTask.status}
                  onChange={(e) =>
                    setNewTask((prev) => ({ ...prev, status: e.target.value }))
                  }
                >
                  {getSelectedSpaceStatuses().map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  value={newTask.priority}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      priority: e.target.value,
                    }))
                  }
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assignee</label>
                <input
                  placeholder="Name or email..."
                  value={newTask.assignee}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      assignee: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Due date</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) =>
                    setNewTask((prev) => ({
                      ...prev,
                      due_date: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Custom fields */}
            {getSelectedSpaceFields().length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#888",
                    marginBottom: 10,
                    marginTop: 4,
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                  }}
                >
                  Custom fields
                </div>
                <div className="form-grid">
                  {getSelectedSpaceFields().map((field) => (
                    <div key={field.id} className="form-group">
                      <label className="form-label">{field.field_name}</label>
                      <input
                        placeholder={`Enter ${field.field_name}...`}
                        value={taskFieldValues[field.id] || ""}
                        onChange={(e) =>
                          setTaskFieldValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={closeTaskModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveTask}>
                {editingTask ? "Save changes" : "Create task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM FIELD MODAL */}
      {showFieldModal && (
        <div
          className="modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setShowFieldModal(false)
          }
        >
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-title">Custom fields</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
              Space: <strong>{activeSpace?.name}</strong>
            </div>

            {/* Existing fields */}
            {getFields().length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#aaa",
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                    marginBottom: 8,
                  }}
                >
                  Existing fields
                </div>
                {getFields().map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      background: "#f5f5f4",
                      borderRadius: 6,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{f.field_name}</span>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 11, color: "#aaa" }}>
                        {f.field_type}
                      </span>
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => deleteCustomField(f.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new field */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#aaa",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 8,
              }}
            >
              Add new field
            </div>
            <div className="form-group">
              <label className="form-label">Field name</label>
              <input
                autoFocus
                placeholder="e.g. TRN, Passport No., Trade License"
                value={newField.field_name}
                onChange={(e) =>
                  setNewField((prev) => ({
                    ...prev,
                    field_name: e.target.value,
                  }))
                }
                onKeyDown={(e) => e.key === "Enter" && addCustomField()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Field type</label>
              <select
                value={newField.field_type}
                onChange={(e) =>
                  setNewField((prev) => ({
                    ...prev,
                    field_type: e.target.value,
                  }))
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowFieldModal(false)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={addCustomField}>
                Add field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM STATUS MODAL */}
      {showStatusModal && (
        <div
          className="modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setShowStatusModal(false)
          }
        >
          <div className="modal" style={{ maxWidth: 420 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div className="modal-title" style={{ margin: 0 }}>
                Manage statuses
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setShowStatusModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
              Space: <strong>{activeSpace?.name}</strong>
            </div>

            {/* Feedback message */}
            {statusActionMsg && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 12,
                  fontSize: 12,
                  background: statusActionMsg.startsWith("✅")
                    ? "#f0fdf4"
                    : statusActionMsg.startsWith("⚠️")
                      ? "#fefce8"
                      : "#fef2f2",
                  color: statusActionMsg.startsWith("✅")
                    ? "#15803d"
                    : statusActionMsg.startsWith("⚠️")
                      ? "#854d0e"
                      : "#b91c1c",
                  border: `1px solid ${statusActionMsg.startsWith("✅") ? "#bbf7d0" : statusActionMsg.startsWith("⚠️") ? "#fde68a" : "#fecaca"}`,
                }}
              >
                {statusActionMsg}
              </div>
            )}

            {/* Existing statuses */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#aaa",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 8,
              }}
            >
              Current statuses ({modalSpaceStatuses.length})
            </div>

            {statusLoading ? (
              <div style={{ fontSize: 13, color: "#aaa", padding: "12px 0" }}>
                Loading...
              </div>
            ) : modalSpaceStatuses.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: "#ccc",
                  padding: "8px 0",
                  marginBottom: 12,
                }}
              >
                No statuses yet.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {modalSpaceStatuses.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      background: "#f5f5f4",
                      borderRadius: 6,
                      marginBottom: 6,
                      border: "1px solid #e8e8e8",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: s.color,
                          flexShrink: 0,
                          border: "1px solid rgba(0,0,0,0.1)",
                        }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {s.name}
                      </span>
                    </div>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ padding: "2px 10px", fontSize: 11 }}
                      onClick={() => deleteCustomStatus(s.id, s.name)}
                      disabled={statusLoading}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Divider */}
            <div
              style={{ borderTop: "1px solid #e8e8e8", margin: "4px 0 16px" }}
            />

            {/* Add new */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#aaa",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 10,
              }}
            >
              Add new status
            </div>
            <div className="form-group">
              <label className="form-label">Status name</label>
              <input
                placeholder="e.g. Client Discontinued, Awaiting Documents"
                value={newStatus.name}
                onChange={(e) => {
                  setNewStatus((prev) => ({ ...prev, name: e.target.value }));
                  setStatusActionMsg("");
                }}
                onKeyDown={(e) => e.key === "Enter" && addCustomStatus()}
                disabled={statusLoading}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  value={newStatus.color}
                  onChange={(e) =>
                    setNewStatus((prev) => ({ ...prev, color: e.target.value }))
                  }
                  style={{
                    width: 48,
                    height: 36,
                    padding: 2,
                    cursor: "pointer",
                  }}
                  disabled={statusLoading}
                />
                <span
                  style={{
                    fontSize: 12,
                    background: newStatus.color,
                    color: "#fff",
                    padding: "3px 12px",
                    borderRadius: 20,
                    fontWeight: 500,
                  }}
                >
                  {newStatus.name || "Preview"}
                </span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowStatusModal(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={addCustomStatus}
                disabled={statusLoading || !newStatus.name.trim()}
              >
                {statusLoading ? "Saving..." : "Add status"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
