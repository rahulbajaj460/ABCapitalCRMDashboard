import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import ImportTasks from "./ImportTasks";

export default function Tasks({
  spaces,
  activeSpace,
  activeFolder,
  profile,
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
  const [groupBy, setGroupBy] = useState("status");
  const [newField, setNewField] = useState({
    field_name: "",
    field_type: "text",
  });
  const [members, setMembers] = useState([]);
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
    assignees: [],
    due_date: "",
  });
  const [taskFieldValues, setTaskFieldValues] = useState({});
  const [showImport, setShowImport] = useState(false);
  const [modalSpaceStatuses, setModalSpaceStatuses] = useState([]);
  const [statusActionMsg, setStatusActionMsg] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  useEffect(() => {
    fetchTasks();
  }, [activeSpace, activeFolder]);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    if (data) setMembers(data);
  }

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

    if (profile?.role === "member") {
      query = query.eq("assignee_id", profile.id);
    }

    const { data, error } = await query;
    console.log("fetchTasks result", { count: data?.length, error });
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
      assignee: newTask.assignees.length > 0 ? newTask.assignees[0] : "",
      assignee_id: newTask.assignee_id || null,
      assignees: newTask.assignees,
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
    const fields = getFields();
    await supabase.from("space_fields").insert({
      space_id: activeSpace.id,
      folder_id: activeFolder?.id || null,
      field_name: newField.field_name.trim(),
      field_type: newField.field_type,
      field_order: fields.length + 1,
    });
    setNewField({ field_name: "", field_type: "text" });
    setShowFieldModal(false);
    onRefreshSpaces();
  }

  async function ensureDefaultStatuses() {
    const targetId = activeFolder?.id || activeSpace?.id;
    if (!targetId) return;

    let query = supabase.from("space_statuses").select("name");

    if (activeFolder) {
      query = query.eq("folder_id", activeFolder.id);
    } else {
      query = query.eq("space_id", activeSpace.id).is("folder_id", null);
    }

    const { data: existing } = await query;
    const existingNames = (existing || []).map((s) => s.name);

    const defaults = [
      { name: "To Do", color: "#888780", status_order: 1 },
      { name: "In Progress", color: "#7c3aed", status_order: 2 },
      { name: "In Review", color: "#d97706", status_order: 3 },
      { name: "Done", color: "#16a34a", status_order: 4 },
    ];

    const toInsert = defaults.filter((d) => !existingNames.includes(d.name));
    if (toInsert.length === 0) return;

    await supabase.from("space_statuses").insert(
      toInsert.map((d) => ({
        ...d,
        space_id: activeSpace.id,
        folder_id: activeFolder?.id || null,
      })),
    );
  }

  async function addCustomStatus() {
    if (!newStatus.name.trim() || !activeSpace) return;

    let query = supabase.from("space_statuses").select("name");

    if (activeFolder) {
      query = query.eq("folder_id", activeFolder.id);
    } else {
      query = query.eq("space_id", activeSpace.id).is("folder_id", null);
    }

    const { data: existing } = await query;
    const existingNames = (existing || []).map((s) => s.name.toLowerCase());

    if (existingNames.includes(newStatus.name.trim().toLowerCase())) {
      setStatusActionMsg("⚠️ A status with this name already exists.");
      return;
    }

    setStatusLoading(true);
    const { error } = await supabase.from("space_statuses").insert({
      space_id: activeSpace.id,
      folder_id: activeFolder?.id || null,
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

    if (activeFolder) {
      // First check if folder has its own statuses
      const { data: folderStatuses } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id)
        .order("status_order");

      if (folderStatuses && folderStatuses.length > 0) {
        // Folder has its own statuses — show those
        setModalSpaceStatuses(folderStatuses);
        return folderStatuses;
      } else {
        // Folder has no statuses yet — show space-level statuses as starting point
        const { data: spaceStatuses } = await supabase
          .from("space_statuses")
          .select("*")
          .eq("space_id", activeSpace.id)
          .is("folder_id", null)
          .order("status_order");
        setModalSpaceStatuses(spaceStatuses || []);
        return spaceStatuses || [];
      }
    } else {
      // Space level — fetch space statuses only
      const { data } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("space_id", activeSpace.id)
        .is("folder_id", null)
        .order("status_order");
      setModalSpaceStatuses(data || []);
      return data || [];
    }
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
      assignees: [],
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
      assignees: task.assignees || [],
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
    if (activeFolder) {
      const folderStatuses = activeFolder.space_statuses || [];
      if (folderStatuses.length > 0) {
        return folderStatuses
          .sort((a, b) => a.status_order - b.status_order)
          .map((s) => s.name);
      }
    }
    // Fall back to space statuses
    const dbStatuses = activeSpace?.space_statuses || [];
    if (dbStatuses.length > 0) {
      return dbStatuses
        .sort((a, b) => a.status_order - b.status_order)
        .map((s) => s.name);
    }
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  function getFields() {
    // If at folder level, use folder fields first
    if (activeFolder) {
      const folderFields = activeFolder.space_fields || [];
      if (folderFields.length > 0) {
        return folderFields.sort((a, b) => a.field_order - b.field_order);
      }
    }
    return (activeSpace?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  function getStatusColor(status) {
    // Check folder statuses first
    if (activeFolder?.space_statuses) {
      const found = activeFolder.space_statuses.find((s) => s.name === status);
      if (found) return found.color;
    }
    // Fall back to space statuses
    if (activeSpace?.space_statuses) {
      const found = activeSpace.space_statuses.find((s) => s.name === status);
      if (found) return found.color;
    }
    const defaults = {
      "To Do": "#888",
      "In Progress": "#7c3aed",
      "In Review": "#d97706",
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
    // Check if selected folder has its own statuses
    if (newTask.folder_id) {
      const folder = space?.folders?.find((f) => f.id === newTask.folder_id);
      const folderStatuses = folder?.space_statuses || [];
      if (folderStatuses.length > 0) {
        return folderStatuses
          .sort((a, b) => a.status_order - b.status_order)
          .map((s) => s.name);
      }
    }
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

  function getGroupedTasks() {
    const tasks = filteredTasks;

    if (groupBy === "status") {
      return getStatuses().reduce((acc, status) => {
        acc[status] = tasks.filter((t) => t.status === status);
        return acc;
      }, {});
    }

    if (groupBy === "folder") {
      // When at space level — group by folder
      const groups = {};
      // First add folder groups
      if (activeSpace) {
        const spaceFolders = activeSpace.folders || [];
        spaceFolders.forEach((f) => {
          groups[f.name] = tasks.filter((t) => t.folder_id === f.id);
        });
      }
      // Add ungrouped tasks (no folder)
      const ungrouped = tasks.filter((t) => !t.folder_id);
      if (ungrouped.length > 0) groups["No folder"] = ungrouped;
      return groups;
    }

    if (groupBy === "assignee") {
      const groups = {};
      tasks.forEach((task) => {
        const assignees =
          task.assignees && task.assignees.length > 0
            ? task.assignees
            : task.assignee
              ? [task.assignee]
              : ["Unassigned"];
        assignees.forEach((name) => {
          if (!groups[name]) groups[name] = [];
          groups[name].push(task);
        });
      });
      // Sort by name
      return Object.fromEntries(
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      );
    }

    if (groupBy === "priority") {
      const order = ["High", "Medium", "Low"];
      return order.reduce((acc, p) => {
        acc[p] = tasks.filter((t) => t.priority === p);
        return acc;
      }, {});
    }

    return { "All tasks": tasks };
  }

  const pageTitle = activeFolder
    ? activeFolder.name
    : activeSpace
      ? activeSpace.name
      : "All Tasks";

  if (showImport) {
    return (
      <ImportTasks
        spaces={spaces}
        onDone={() => {
          setShowImport(false);
          fetchTasks();
        }}
      />
    );
  }

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
          <button className="btn btn-sm" onClick={() => setShowImport(true)}>
            ⬆ Import CSV
          </button>
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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="status">Group by: Status</option>
            <option value="folder">Group by: Folder</option>
            <option value="assignee">Group by: Assignee</option>
            <option value="priority">Group by: Priority</option>
          </select>
        </div>
      </div>

      <div className="content-area">
        {/* LIST VIEW */}
        {viewMode === "list" && (
          <div>
            {/* SPACE LEVEL — show folders as sections */}
            {activeSpace && !activeFolder ? (
              <div>
                {(activeSpace.folders || []).map((folder) => {
                  const folderTasks = tasks.filter(
                    (t) => t.folder_id === folder.id,
                  );
                  const isExpanded = expandedGroups[folder.id] !== false;
                  const statusGroups = getStatuses().reduce((acc, status) => {
                    acc[status] = folderTasks.filter(
                      (t) => t.status === status,
                    );
                    return acc;
                  }, {});

                  return (
                    <div
                      key={folder.id}
                      style={{
                        background: "#fff",
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        marginBottom: 16,
                        overflow: "hidden",
                      }}
                    >
                      {/* Folder header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 16px",
                          borderBottom: isExpanded
                            ? "1px solid #e8e8e8"
                            : "none",
                          cursor: "pointer",
                          background: "#fafaf9",
                        }}
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [folder.id]: !isExpanded,
                          }))
                        }
                      >
                        <span style={{ fontSize: 12, color: "#aaa" }}>
                          {isExpanded ? "▾" : "▸"}
                        </span>
                        <span
                          style={{ fontSize: 14, fontWeight: 600, flex: 1 }}
                        >
                          📁 {folder.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#888",
                            background: "#f0f0ef",
                            borderRadius: 20,
                            padding: "1px 8px",
                          }}
                        >
                          {folderTasks.length} tasks
                        </span>
                      </div>

                      {/* Folder tasks grouped by selected groupBy */}
                      {isExpanded && (
                        <div style={{ padding: "8px 0" }}>
                          {folderTasks.length === 0 ? (
                            <div
                              style={{
                                fontSize: 13,
                                color: "#ccc",
                                padding: "12px 16px",
                              }}
                            >
                              No tasks in this folder
                            </div>
                          ) : (
                            Object.entries(
                              groupBy === "status"
                                ? statusGroups
                                : groupBy === "priority"
                                  ? ["High", "Medium", "Low"].reduce(
                                      (acc, p) => {
                                        acc[p] = folderTasks.filter(
                                          (t) => t.priority === p,
                                        );
                                        return acc;
                                      },
                                      {},
                                    )
                                  : groupBy === "assignee"
                                    ? folderTasks.reduce((acc, task) => {
                                        const names =
                                          task.assignees?.length > 0
                                            ? task.assignees
                                            : task.assignee
                                              ? [task.assignee]
                                              : ["Unassigned"];
                                        names.forEach((n) => {
                                          if (!acc[n]) acc[n] = [];
                                          acc[n].push(task);
                                        });
                                        return acc;
                                      }, {})
                                    : statusGroups,
                            ).map(([groupName, groupTasks]) => {
                              if (groupTasks.length === 0) return null;
                              const groupKey = `${folder.id}_${groupName}`;
                              const groupExpanded =
                                expandedGroups[groupKey] !== false;
                              return (
                                <div
                                  key={groupName}
                                  style={{ marginBottom: 4 }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      padding: "6px 16px",
                                      cursor: "pointer",
                                    }}
                                    onClick={() =>
                                      setExpandedGroups((prev) => ({
                                        ...prev,
                                        [groupKey]: !groupExpanded,
                                      }))
                                    }
                                  >
                                    <span
                                      style={{ fontSize: 10, color: "#aaa" }}
                                    >
                                      {groupExpanded ? "▾" : "▸"}
                                    </span>
                                    <span
                                      style={{
                                        background:
                                          groupBy === "status"
                                            ? getStatusColor(groupName)
                                            : "#f0f0ef",
                                        color:
                                          groupBy === "status"
                                            ? "#fff"
                                            : "#333",
                                        padding: "2px 10px",
                                        borderRadius: 20,
                                        fontSize: 11,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {groupName}
                                    </span>
                                    <span
                                      style={{ fontSize: 12, color: "#aaa" }}
                                    >
                                      {groupTasks.length}
                                    </span>
                                  </div>

                                  {groupExpanded && (
                                    <table
                                      className="task-table"
                                      style={{ marginBottom: 4 }}
                                    >
                                      <thead>
                                        <tr>
                                          <th style={{ paddingLeft: 32 }}>
                                            Name
                                          </th>
                                          {groupBy !== "status" && (
                                            <th>Status</th>
                                          )}
                                          <th>Priority</th>
                                          <th>Assignees</th>
                                          <th>Due date</th>
                                          {getFields().map((f) => (
                                            <th key={f.id}>{f.field_name}</th>
                                          ))}
                                          <th></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {groupTasks.map((task) => (
                                          <tr key={task.id}>
                                            <td style={{ paddingLeft: 32 }}>
                                              <span
                                                style={{
                                                  fontWeight: 500,
                                                  cursor: "pointer",
                                                }}
                                                onClick={() =>
                                                  openEditTask(task)
                                                }
                                              >
                                                {task.title}
                                              </span>
                                            </td>
                                            {groupBy !== "status" && (
                                              <td>
                                                <span
                                                  className="badge"
                                                  style={{
                                                    background:
                                                      getStatusColor(
                                                        task.status,
                                                      ) + "22",
                                                    color: getStatusColor(
                                                      task.status,
                                                    ),
                                                  }}
                                                >
                                                  {task.status}
                                                </span>
                                              </td>
                                            )}
                                            <td>
                                              <span
                                                className="badge"
                                                style={getPriorityStyle(
                                                  task.priority,
                                                )}
                                              >
                                                {task.priority}
                                              </span>
                                            </td>
                                            <td>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  flexWrap: "wrap",
                                                  gap: 3,
                                                }}
                                              >
                                                {(task.assignees?.length > 0
                                                  ? task.assignees
                                                  : task.assignee
                                                    ? [task.assignee]
                                                    : []
                                                ).map((name) => (
                                                  <span
                                                    key={name}
                                                    style={{
                                                      background: "#f0f0ef",
                                                      borderRadius: 20,
                                                      padding: "1px 7px",
                                                      fontSize: 11,
                                                      fontWeight: 500,
                                                    }}
                                                  >
                                                    {name}
                                                  </span>
                                                ))}
                                                {!task.assignees?.length &&
                                                  !task.assignee &&
                                                  "—"}
                                              </div>
                                            </td>
                                            <td
                                              style={{
                                                fontSize: 12,
                                                color: "#555",
                                              }}
                                            >
                                              {task.due_date || "—"}
                                            </td>
                                            {getFields().map((f) => {
                                              const fv =
                                                task.task_field_values?.find(
                                                  (v) => v.field_id === f.id,
                                                );
                                              return (
                                                <td
                                                  key={f.id}
                                                  style={{
                                                    fontSize: 12,
                                                    color: "#555",
                                                  }}
                                                >
                                                  {fv?.value || "—"}
                                                </td>
                                              );
                                            })}
                                            <td>
                                              <div
                                                style={{
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: 4,
                                                }}
                                              >
                                                <select
                                                  value={task.status}
                                                  onChange={(e) =>
                                                    updateTaskStatus(
                                                      task.id,
                                                      e.target.value,
                                                    )
                                                  }
                                                  style={{
                                                    fontSize: 11,
                                                    padding: "3px 6px",
                                                  }}
                                                >
                                                  {getStatuses().map((s) => (
                                                    <option key={s} value={s}>
                                                      {s}
                                                    </option>
                                                  ))}
                                                </select>
                                                <div className="task-row-actions">
                                                  <button
                                                    className="btn btn-sm"
                                                    onClick={() =>
                                                      openEditTask(task)
                                                    }
                                                  >
                                                    ✏️
                                                  </button>
                                                  <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() =>
                                                      deleteTask(task.id)
                                                    }
                                                  >
                                                    🗑
                                                  </button>
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Tasks not in any folder */}
                {(() => {
                  const noFolderTasks = tasks.filter((t) => !t.folder_id);
                  if (noFolderTasks.length === 0) return null;
                  return (
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        marginBottom: 16,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 16px",
                          background: "#fafaf9",
                          borderBottom: "1px solid #e8e8e8",
                        }}
                      >
                        <span
                          style={{ fontSize: 14, fontWeight: 600, flex: 1 }}
                        >
                          📋 No folder
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#888",
                            background: "#f0f0ef",
                            borderRadius: 20,
                            padding: "1px 8px",
                          }}
                        >
                          {noFolderTasks.length} tasks
                        </span>
                      </div>
                      <table className="task-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Priority</th>
                            <th>Assignees</th>
                            <th>Due date</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {noFolderTasks.map((task) => (
                            <tr key={task.id}>
                              <td style={{ fontWeight: 500 }}>{task.title}</td>
                              <td>
                                <span
                                  className="badge"
                                  style={{
                                    background:
                                      getStatusColor(task.status) + "22",
                                    color: getStatusColor(task.status),
                                  }}
                                >
                                  {task.status}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="badge"
                                  style={getPriorityStyle(task.priority)}
                                >
                                  {task.priority}
                                </span>
                              </td>
                              <td style={{ fontSize: 12 }}>
                                {(task.assignees?.length > 0
                                  ? task.assignees
                                  : task.assignee
                                    ? [task.assignee]
                                    : ["—"]
                                ).join(", ")}
                              </td>
                              <td style={{ fontSize: 12 }}>
                                {task.due_date || "—"}
                              </td>
                              <td>
                                <div className="task-row-actions">
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
                  );
                })()}

                {(activeSpace.folders || []).length === 0 &&
                  tasks.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "#aaa",
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                      <div style={{ fontSize: 14, marginBottom: 4 }}>
                        No folders yet
                      </div>
                      <div style={{ fontSize: 12 }}>
                        Add a folder from the sidebar to organise your tasks
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              /* FOLDER LEVEL — show tasks grouped by selected groupBy */
              <div>
                {Object.entries(getGroupedTasks()).map(
                  ([groupName, groupTasks]) => {
                    const isExpanded = expandedGroups[groupName] !== false;
                    return (
                      <div key={groupName} style={{ marginBottom: 16 }}>
                        <div
                          className="status-group-header"
                          onClick={() =>
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [groupName]: !isExpanded,
                            }))
                          }
                        >
                          <span style={{ fontSize: 10 }}>
                            {isExpanded ? "▾" : "▸"}
                          </span>
                          <span
                            style={{
                              background:
                                groupBy === "status"
                                  ? getStatusColor(groupName)
                                  : "#f0f0ef",
                              color: groupBy === "status" ? "#fff" : "#333",
                              padding: "2px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 600,
                              border:
                                groupBy !== "status"
                                  ? "1px solid #e8e8e8"
                                  : "none",
                            }}
                          >
                            {groupName}
                          </span>
                          <span style={{ fontSize: 12, color: "#aaa" }}>
                            {groupTasks.length}
                          </span>
                        </div>

                        {isExpanded && groupTasks.length > 0 && (
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
                                  {groupBy !== "status" && <th>Status</th>}
                                  <th>Priority</th>
                                  <th>Assignees</th>
                                  <th>Due date</th>
                                  {getFields().map((f) => (
                                    <th key={f.id}>{f.field_name}</th>
                                  ))}
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupTasks.map((task) => (
                                  <tr key={task.id}>
                                    <td>
                                      <span
                                        style={{
                                          fontWeight: 500,
                                          cursor: "pointer",
                                        }}
                                        onClick={() => openEditTask(task)}
                                      >
                                        {task.title}
                                      </span>
                                    </td>
                                    {groupBy !== "status" && (
                                      <td>
                                        <span
                                          className="badge"
                                          style={{
                                            background:
                                              getStatusColor(task.status) +
                                              "22",
                                            color: getStatusColor(task.status),
                                          }}
                                        >
                                          {task.status}
                                        </span>
                                      </td>
                                    )}
                                    <td>
                                      <span
                                        className="badge"
                                        style={getPriorityStyle(task.priority)}
                                      >
                                        {task.priority}
                                      </span>
                                    </td>
                                    <td>
                                      <div
                                        style={{
                                          display: "flex",
                                          flexWrap: "wrap",
                                          gap: 3,
                                        }}
                                      >
                                        {(task.assignees?.length > 0
                                          ? task.assignees
                                          : task.assignee
                                            ? [task.assignee]
                                            : []
                                        ).map((name) => (
                                          <span
                                            key={name}
                                            style={{
                                              background: "#f0f0ef",
                                              borderRadius: 20,
                                              padding: "1px 7px",
                                              fontSize: 11,
                                              fontWeight: 500,
                                            }}
                                          >
                                            {name}
                                          </span>
                                        ))}
                                        {!task.assignees?.length &&
                                          !task.assignee &&
                                          "—"}
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        fontSize: 12,
                                        color:
                                          task.due_date &&
                                          new Date(task.due_date) <
                                            new Date() &&
                                          task.status !== "Done"
                                            ? "#b91c1c"
                                            : "#555",
                                      }}
                                    >
                                      {task.due_date
                                        ? new Date(task.due_date) <
                                            new Date() && task.status !== "Done"
                                          ? `⚠️ ${task.due_date}`
                                          : task.due_date
                                        : "—"}
                                    </td>
                                    {getFields().map((f) => {
                                      const fv = task.task_field_values?.find(
                                        (v) => v.field_id === f.id,
                                      );
                                      return (
                                        <td
                                          key={f.id}
                                          style={{
                                            fontSize: 12,
                                            color: "#555",
                                          }}
                                        >
                                          {fv?.value || "—"}
                                        </td>
                                      );
                                    })}
                                    <td>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                        }}
                                      >
                                        <select
                                          value={task.status}
                                          onChange={(e) =>
                                            updateTaskStatus(
                                              task.id,
                                              e.target.value,
                                            )
                                          }
                                          style={{
                                            fontSize: 11,
                                            padding: "3px 6px",
                                          }}
                                        >
                                          {getStatuses().map((s) => (
                                            <option key={s} value={s}>
                                              {s}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="task-row-actions">
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
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {isExpanded && groupTasks.length === 0 && (
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
                  },
                )}
              </div>
            )}
          </div>
        )}

        {/* BOARD VIEW */}
        {viewMode === "board" && (
          <div className="kanban-board">
            {Object.entries(getGroupedTasks()).map(
              ([groupName, groupTasks]) => (
                <div key={groupName} className="kanban-col">
                  <div className="kanban-col-header">
                    <span
                      style={{
                        background:
                          groupBy === "status"
                            ? getStatusColor(groupName)
                            : "#f0f0ef",
                        color: groupBy === "status" ? "#fff" : "#333",
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 11,
                      }}
                    >
                      {groupName}
                    </span>
                    <span style={{ fontSize: 12, color: "#aaa" }}>
                      {groupTasks.length}
                    </span>
                  </div>
                  {groupTasks.map((task) => (
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
                          marginBottom: 4,
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
                      {((task.assignees && task.assignees.length > 0) ||
                        task.assignee) && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 3,
                            marginTop: 4,
                          }}
                        >
                          {(task.assignees && task.assignees.length > 0
                            ? task.assignees
                            : [task.assignee]
                          ).map((name) => (
                            <span
                              key={name}
                              style={{
                                background: "#f0f0ef",
                                borderRadius: 20,
                                padding: "1px 6px",
                                fontSize: 10,
                                color: "#333",
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ),
            )}
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
                  onChange={(e) => {
                    const selectedSpace = spaces.find(
                      (s) => s.id === e.target.value,
                    );
                    const firstStatus =
                      selectedSpace?.space_statuses?.length > 0
                        ? selectedSpace.space_statuses.sort(
                            (a, b) => a.status_order - b.status_order,
                          )[0].name
                        : "To Do";
                    setNewTask((prev) => ({
                      ...prev,
                      space_id: e.target.value,
                      folder_id: "",
                      status: firstStatus,
                    }));
                  }}
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

              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Assignees</label>
                <div
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: 6,
                    padding: "6px 10px",
                    background: "#fff",
                    minHeight: 38,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      marginBottom: newTask.assignees.length > 0 ? 6 : 0,
                    }}
                  >
                    {newTask.assignees.map((name) => (
                      <span
                        key={name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 20,
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {name}
                        <span
                          style={{
                            cursor: "pointer",
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                          onClick={() =>
                            setNewTask((prev) => ({
                              ...prev,
                              assignees: prev.assignees.filter(
                                (a) => a !== name,
                              ),
                            }))
                          }
                        >
                          ×
                        </span>
                      </span>
                    ))}
                  </div>
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (name && !newTask.assignees.includes(name)) {
                        const member = members.find(
                          (m) => m.full_name === name,
                        );
                        setNewTask((prev) => ({
                          ...prev,
                          assignees: [...prev.assignees, name],
                          assignee_id: prev.assignee_id || member?.id || "",
                        }));
                      }
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      fontSize: 13,
                      padding: "2px 0",
                      width: "100%",
                      outline: "none",
                    }}
                  >
                    <option value="">+ Add assignee...</option>
                    {members
                      .filter((m) => !newTask.assignees.includes(m.full_name))
                      .map((m) => (
                        <option key={m.id} value={m.full_name}>
                          {m.full_name}
                        </option>
                      ))}
                  </select>
                </div>
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
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
              {activeFolder ? (
                <>
                  <span>Folder: </span>
                  <strong>{activeFolder.name}</strong>
                </>
              ) : (
                <>
                  <span>Space: </span>
                  <strong>{activeSpace?.name}</strong>
                </>
              )}
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

            <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
              {activeFolder ? (
                <>
                  <span>Folder: </span>
                  <strong>{activeFolder.name}</strong>
                </>
              ) : (
                <>
                  <span>Space: </span>
                  <strong>{activeSpace?.name}</strong>
                </>
              )}
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
              {activeFolder && !(activeFolder.space_statuses?.length > 0)
                ? `Inherited from space (${modalSpaceStatuses.length})`
                : `Current statuses (${modalSpaceStatuses.length})`}
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
