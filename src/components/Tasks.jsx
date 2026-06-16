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
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("abc_visible_columns");
      return saved ? JSON.parse(saved) : ["priority", "assignees", "due_date"];
    } catch {
      return ["priority", "assignees", "due_date"];
    }
  });

  function updateVisibleColumns(cols) {
    setVisibleColumns(cols);
    localStorage.setItem("abc_visible_columns", JSON.stringify(cols));
  }

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
  useEffect(() => {
    if (activeSpace)
      setNewTask((prev) => ({ ...prev, space_id: activeSpace.id }));
  }, [activeSpace]);
  useEffect(() => {
    function handleClickOutside(e) {
      if (showColumnPicker && !e.target.closest(".column-picker-wrap")) {
        setShowColumnPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnPicker]);

  async function fetchMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    if (data) setMembers(data);
  }

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
    const { data } = await query;
    if (data) setTasks(data);
  }

  function getStatuses() {
    if (activeFolder) {
      const folderStatuses = (activeSpace?.space_statuses || [])
        .filter((s) => s.folder_id === activeFolder.id)
        .sort((a, b) => a.status_order - b.status_order);
      if (folderStatuses.length > 0) return folderStatuses.map((s) => s.name);
    }
    const allFolderIds = (activeSpace?.folders || []).map((f) => f.id);
    const seen = new Set();
    const unique = [];
    (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id && allFolderIds.includes(s.folder_id))
      .sort((a, b) => a.status_order - b.status_order)
      .forEach((s) => {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          unique.push(s.name);
        }
      });
    if (unique.length > 0) return unique;
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  // Get statuses for a specific folder (used in space-level view)
  function getFolderStatuses(folder) {
    const folderStatuses = (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folder.id)
      .sort((a, b) => a.status_order - b.status_order);
    if (folderStatuses.length > 0) return folderStatuses.map((s) => s.name);
    // Fall back to space-level statuses
    return getStatuses();
  }

  function getUniqueStatuses() {
    if (activeFolder) return getStatuses();
    const allFolderIds = (activeSpace?.folders || []).map((f) => f.id);
    const seen = new Set();
    const unique = [];
    (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id && allFolderIds.includes(s.folder_id))
      .sort((a, b) => a.status_order - b.status_order)
      .forEach((s) => {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          unique.push(s.name);
        }
      });
    return unique.length > 0
      ? unique
      : ["To Do", "In Progress", "In Review", "Done"];
  }

  function getFields() {
    if (activeFolder) {
      const folderFields = activeFolder.space_fields || [];
      if (folderFields.length > 0)
        return folderFields.sort((a, b) => a.field_order - b.field_order);
    }
    return (activeSpace?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  // Get fields for a specific folder (used in space-level view)
  function getFolderFields(folder) {
    const folderFields = folder.space_fields || [];
    if (folderFields.length > 0)
      return folderFields.sort((a, b) => a.field_order - b.field_order);
    return (activeSpace?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  function getStatusColor(status) {
    if (activeFolder) {
      const found = (activeSpace?.space_statuses || [])
        .filter((s) => s.folder_id === activeFolder.id)
        .find((s) => s.name === status);
      if (found) return found.color;
    }
    const found = (activeSpace?.space_statuses || []).find(
      (s) => s.name === status,
    );
    if (found) return found.color;
    const defaults = {
      "To Do": "#888",
      "In Progress": "#7c3aed",
      "In Review": "#d97706",
      Done: "#16a34a",
      "Client Cancelled": "#f59e0b",
    };
    return defaults[status] || "#888";
  }

  function getStatusColorForFolder(status, folder) {
    const found = (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folder.id)
      .find((s) => s.name === status);
    if (found) return found.color;
    return getStatusColor(status);
  }

  function getPriorityStyle(priority) {
    if (priority === "High") return { background: "#fee2e2", color: "#b91c1c" };
    if (priority === "Low") return { background: "#dcfce7", color: "#15803d" };
    return { background: "#fef9c3", color: "#854d0e" };
  }

  function getSelectedSpaceFolders() {
    const space = spaces.find((s) => s.id === newTask.space_id);
    return space?.folders || [];
  }

  function getSelectedSpaceStatuses() {
    const space = spaces.find((s) => s.id === newTask.space_id);
    if (!space) return ["To Do", "In Progress", "In Review", "Done"];
    if (newTask.folder_id) {
      const folderStatuses = (space.space_statuses || [])
        .filter((s) => s.folder_id === newTask.folder_id)
        .sort((a, b) => a.status_order - b.status_order);
      if (folderStatuses.length > 0) return folderStatuses.map((s) => s.name);
    }
    const allFolderIds = (space.folders || []).map((f) => f.id);
    const seen = new Set();
    const unique = [];
    (space.space_statuses || [])
      .filter((s) => s.folder_id && allFolderIds.includes(s.folder_id))
      .sort((a, b) => a.status_order - b.status_order)
      .forEach((s) => {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          unique.push(s.name);
        }
      });
    return unique.length > 0
      ? unique
      : ["To Do", "In Progress", "In Review", "Done"];
  }

  function getSelectedSpaceFields() {
    const space = spaces.find((s) => s.id === newTask.space_id);
    if (!space) return [];
    if (newTask.folder_id) {
      const folder = space.folders?.find((f) => f.id === newTask.folder_id);
      const folderFields = folder?.space_fields || [];
      if (folderFields.length > 0)
        return folderFields.sort((a, b) => a.field_order - b.field_order);
    }
    return (space.space_fields || []).sort(
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
    const taskList = filteredTasks;
    if (groupBy === "status") {
      return getStatuses().reduce((acc, status) => {
        acc[status] = taskList.filter((t) => t.status === status);
        return acc;
      }, {});
    }
    if (groupBy === "folder") {
      const groups = {};
      if (activeSpace) {
        (activeSpace.folders || []).forEach((f) => {
          groups[f.name] = taskList.filter((t) => t.folder_id === f.id);
        });
      }
      const ungrouped = taskList.filter((t) => !t.folder_id);
      if (ungrouped.length > 0) groups["No folder"] = ungrouped;
      return groups;
    }
    if (groupBy === "assignee") {
      const groups = {};
      taskList.forEach((task) => {
        const assignees =
          task.assignees?.length > 0
            ? task.assignees
            : task.assignee
              ? [task.assignee]
              : ["Unassigned"];
        assignees.forEach((name) => {
          if (!groups[name]) groups[name] = [];
          groups[name].push(task);
        });
      });
      return Object.fromEntries(
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    if (groupBy === "priority") {
      return ["High", "Medium", "Low"].reduce((acc, p) => {
        acc[p] = taskList.filter((t) => t.priority === p);
        return acc;
      }, {});
    }
    return { "All tasks": taskList };
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
      await supabase.from("tasks").update(payload).eq("id", editingTask.id);
      taskId = editingTask.id;
    } else {
      const { data } = await supabase
        .from("tasks")
        .insert(payload)
        .select()
        .single();
      if (data) taskId = data.id;
    }
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

  async function ensureDefaultStatuses() {
    if (!activeSpace || !activeFolder) return;
    const { data: existing } = await supabase
      .from("space_statuses")
      .select("name")
      .eq("folder_id", activeFolder.id);
    const existingNames = (existing || []).map((s) => s.name);
    const defaults = [
      { name: "To Do", color: "#888780", status_order: 1 },
      { name: "In Progress", color: "#7c3aed", status_order: 2 },
      { name: "In Review", color: "#d97706", status_order: 3 },
      { name: "Done", color: "#16a34a", status_order: 4 },
    ];
    const toInsert = defaults.filter((d) => !existingNames.includes(d.name));
    if (toInsert.length === 0) return;
    await supabase
      .from("space_statuses")
      .insert(
        toInsert.map((d) => ({
          ...d,
          space_id: activeSpace.id,
          folder_id: activeFolder.id,
        })),
      );
  }

  async function addCustomStatus() {
    if (!newStatus.name.trim() || !activeSpace) return;
    setStatusLoading(true);
    setStatusActionMsg("");

    if (activeFolder) {
      const { data: existingFolderStatuses } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id);
      if (!existingFolderStatuses || existingFolderStatuses.length === 0) {
        const { data: spaceStatuses } = await supabase
          .from("space_statuses")
          .select("*")
          .eq("space_id", activeSpace.id)
          .is("folder_id", null)
          .order("status_order");
        if (spaceStatuses && spaceStatuses.length > 0) {
          await supabase.from("space_statuses").insert(
            spaceStatuses.map((s) => ({
              space_id: activeSpace.id,
              folder_id: activeFolder.id,
              name: s.name,
              color: s.color,
              status_order: s.status_order,
            })),
          );
        }
      }
    }

    let dupQuery = supabase.from("space_statuses").select("name");
    if (activeFolder) {
      dupQuery = dupQuery.eq("folder_id", activeFolder.id);
    } else {
      dupQuery = dupQuery.eq("space_id", activeSpace.id).is("folder_id", null);
    }
    const { data: existing } = await dupQuery;
    const existingNames = (existing || []).map((s) => s.name.toLowerCase());

    if (existingNames.includes(newStatus.name.trim().toLowerCase())) {
      setStatusActionMsg("⚠️ A status with this name already exists.");
      setStatusLoading(false);
      return;
    }

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

  async function deleteCustomStatus(statusId, statusName) {
    if (
      !confirm(
        `Delete "${statusName}"? Tasks with this status will be moved to the next available status.`,
      )
    )
      return;
    setStatusLoading(true);
    setStatusActionMsg("");
    const remaining = modalSpaceStatuses.filter((s) => s.id !== statusId);
    const fallback = remaining.length > 0 ? remaining[0].name : null;
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
    await fetchModalStatuses();
    await onRefreshSpaces();
    fetchTasks();
    setStatusLoading(false);
  }

  async function fetchModalStatuses() {
    if (!activeSpace) return;
    if (activeFolder) {
      const { data } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id)
        .order("status_order");
      setModalSpaceStatuses(data || []);
      return data || [];
    } else {
      const folderIds = (activeSpace.folders || []).map((f) => f.id);
      if (folderIds.length === 0) {
        const { data } = await supabase
          .from("space_statuses")
          .select("*")
          .eq("space_id", activeSpace.id)
          .is("folder_id", null)
          .order("status_order");
        setModalSpaceStatuses(data || []);
        return data || [];
      }
      const { data } = await supabase
        .from("space_statuses")
        .select("*")
        .in("folder_id", folderIds)
        .order("status_order");
      const seen = new Set();
      const unique = (data || []).filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      setModalSpaceStatuses(unique);
      return unique;
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

  // Reusable task row renderer
  function renderTaskRow(task, statusList, fieldList, folderCtx = null) {
    const statusColor = folderCtx
      ? getStatusColorForFolder(task.status, folderCtx)
      : getStatusColor(task.status);
    const isOverdue =
      task.due_date &&
      new Date(task.due_date) < new Date() &&
      task.status !== "Done";

    return (
      <tr key={task.id}>
        {/* Name */}
        <td style={{ paddingLeft: folderCtx ? 32 : undefined }}>
          <span
            style={{ fontWeight: 500, cursor: "pointer" }}
            onClick={() => openEditTask(task)}
          >
            {task.title}
          </span>
          {task.description && (
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              {task.description.slice(0, 60)}
              {task.description.length > 60 ? "..." : ""}
            </div>
          )}
        </td>

        {/* Status badge — only when not grouping by status */}
        {groupBy !== "status" && visibleColumns.includes("status") && (
          <td>
            <span
              className="badge"
              style={{ background: statusColor + "22", color: statusColor }}
            >
              {task.status}
            </span>
          </td>
        )}

        {/* Priority */}
        {visibleColumns.includes("priority") && (
          <td>
            <span className="badge" style={getPriorityStyle(task.priority)}>
              {task.priority}
            </span>
          </td>
        )}

        {/* Assignees */}
        {visibleColumns.includes("assignees") && (
          <td>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
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
              {!task.assignees?.length && !task.assignee && "—"}
            </div>
          </td>
        )}

        {/* Due date */}
        {visibleColumns.includes("due_date") && (
          <td
            style={{
              fontSize: 12,
              color: isOverdue ? "#b91c1c" : "#555",
              fontWeight: isOverdue ? 600 : 400,
            }}
          >
            {task.due_date
              ? isOverdue
                ? `⚠️ ${task.due_date}`
                : task.due_date
              : "—"}
          </td>
        )}

        {/* Custom fields — only ones visible */}
        {fieldList
          .filter((f) => visibleColumns.includes(`field_${f.id}`))
          .map((f) => {
            const fv = task.task_field_values?.find((v) => v.field_id === f.id);
            return (
              <td key={f.id}>
                {fv?.value ? (
                  f.field_type === "dropdown" ? (
                    <span
                      style={{
                        background: "#f0f0ef",
                        borderRadius: 20,
                        padding: "1px 8px",
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#333",
                      }}
                    >
                      {fv.value}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#555" }}>
                      {fv.value}
                    </span>
                  )
                ) : (
                  "—"
                )}
              </td>
            );
          })}

        {/* Status dropdown */}
        <td style={{ minWidth: 130 }}>
          <select
            value={task.status}
            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
            style={{ fontSize: 11, padding: "3px 6px" }}
          >
            {statusList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>

        {/* Actions */}
        <td style={{ width: 70 }}>
          <div className="task-row-actions" style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-sm" onClick={() => openEditTask(task)}>
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
    );
  }

  // Reusable table header renderer
  function renderTableHead(
    fieldList,
    showStatusBadge = false,
    indented = false,
  ) {
    return (
      <thead>
        <tr>
          <th style={indented ? { paddingLeft: 32 } : {}}>Name</th>
          {showStatusBadge &&
            groupBy !== "status" &&
            visibleColumns.includes("status") && <th>Status</th>}
          {visibleColumns.includes("priority") && <th>Priority</th>}
          {visibleColumns.includes("assignees") && <th>Assignees</th>}
          {visibleColumns.includes("due_date") && <th>Due date</th>}
          {fieldList
            .filter((f) => visibleColumns.includes(`field_${f.id}`))
            .map((f) => (
              <th key={f.id}>{f.field_name}</th>
            ))}
          <th style={{ minWidth: 130 }}>Status</th>
          <th style={{ width: 70 }}></th>
        </tr>
      </thead>
    );
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
        onDone={async () => {
          await onRefreshSpaces();
          setShowImport(false);
          fetchTasks();
        }}
        onRefreshSpaces={onRefreshSpaces}
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

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fff",
          minHeight: 48,
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="search-wrap">
            <span style={{ color: "#aaa" }}>🔍</span>
            <input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ position: "relative" }} className="column-picker-wrap">
            <button
              className="btn btn-sm"
              onClick={() => setShowColumnPicker((prev) => !prev)}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              ⊞ Columns
            </button>
            {showColumnPicker && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  background: "#fff",
                  border: "1px solid #e8e8e8",
                  borderRadius: 8,
                  padding: "12px 14px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                  zIndex: 100,
                  minWidth: 200,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#888",
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                  }}
                >
                  Visible columns
                </div>
                {[
                  { key: "priority", label: "Priority" },
                  { key: "assignees", label: "Assignees" },
                  { key: "due_date", label: "Due date" },
                  { key: "status", label: "Status badge" },
                  ...getFields().map((f) => ({
                    key: `field_${f.id}`,
                    label: f.field_name,
                  })),
                ].map((col) => (
                  <label
                    key={col.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 0",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.key)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...visibleColumns, col.key]
                          : visibleColumns.filter((c) => c !== col.key);
                        updateVisibleColumns(next);
                      }}
                      style={{ width: 14, height: 14, cursor: "pointer" }}
                    />
                    {col.label}
                  </label>
                ))}
                <div
                  style={{
                    borderTop: "1px solid #e8e8e8",
                    marginTop: 8,
                    paddingTop: 8,
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11 }}
                    onClick={() =>
                      updateVisibleColumns([
                        "priority",
                        "assignees",
                        "due_date",
                      ])
                    }
                  >
                    Reset
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: 11 }}
                    onClick={() => setShowColumnPicker(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="all">All statuses</option>
            {getUniqueStatuses().map((s) => (
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
            {activeSpace && !activeFolder ? (
              /* SPACE LEVEL — show folders as sections */
              <div>
                {(activeSpace.folders || []).map((folder) => {
                  const folderTasks = tasks.filter(
                    (t) => t.folder_id === folder.id,
                  );
                  const filteredFolderTasks = folderTasks.filter((t) => {
                    if (statusFilter !== "all" && t.status !== statusFilter)
                      return false;
                    if (
                      search &&
                      !t.title.toLowerCase().includes(search.toLowerCase())
                    )
                      return false;
                    return true;
                  });
                  const isExpanded = expandedGroups[folder.id] !== false;
                  const folderStatusList = getFolderStatuses(folder);
                  const folderFieldList = getFolderFields(folder);

                  const grouped =
                    groupBy === "status"
                      ? folderStatusList.reduce((acc, s) => {
                          acc[s] = filteredFolderTasks.filter(
                            (t) => t.status === s,
                          );
                          return acc;
                        }, {})
                      : groupBy === "priority"
                        ? ["High", "Medium", "Low"].reduce((acc, p) => {
                            acc[p] = filteredFolderTasks.filter(
                              (t) => t.priority === p,
                            );
                            return acc;
                          }, {})
                        : groupBy === "assignee"
                          ? filteredFolderTasks.reduce((acc, task) => {
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
                          : { "All tasks": filteredFolderTasks };

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

                      {isExpanded && (
                        <div style={{ padding: "8px 0" }}>
                          {filteredFolderTasks.length === 0 ? (
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
                            Object.entries(grouped).map(
                              ([groupName, groupTasks]) => {
                                if (groupTasks.length === 0) return null;
                                const groupKey = `${folder.id}_${groupName}`;
                                const groupExpanded =
                                  expandedGroups[groupKey] !== false;
                                const groupColor =
                                  groupBy === "status"
                                    ? getStatusColorForFolder(groupName, folder)
                                    : "#f0f0ef";

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
                                          background: groupColor,
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
                                        {renderTableHead(
                                          folderFieldList,
                                          true,
                                          true,
                                        )}
                                        <tbody>
                                          {groupTasks.map((task) =>
                                            renderTaskRow(
                                              task,
                                              folderStatusList,
                                              folderFieldList,
                                              folder,
                                            ),
                                          )}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                );
                              },
                            )
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
                        {renderTableHead(getFields(), true)}
                        <tbody>
                          {noFolderTasks.map((task) =>
                            renderTaskRow(task, getStatuses(), getFields()),
                          )}
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
              /* FOLDER LEVEL — show tasks grouped */
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
                              {renderTableHead(getFields(), true)}
                              <tbody>
                                {groupTasks.map((task) =>
                                  renderTaskRow(
                                    task,
                                    getStatuses(),
                                    getFields(),
                                  ),
                                )}
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
                          {(task.assignees?.length > 0
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
                    const sel = spaces.find((s) => s.id === e.target.value);
                    const firstStatus =
                      sel?.space_statuses?.length > 0
                        ? sel.space_statuses.sort(
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
                      {field.field_type === "dropdown" &&
                      field.field_options?.length > 0 ? (
                        <select
                          value={taskFieldValues[field.id] || ""}
                          onChange={(e) =>
                            setTaskFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select {field.field_name}...</option>
                          {field.field_options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.field_type === "date" ? (
                        <input
                          type="date"
                          value={taskFieldValues[field.id] || ""}
                          onChange={(e) =>
                            setTaskFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                        />
                      ) : field.field_type === "number" ? (
                        <input
                          type="number"
                          placeholder={`Enter ${field.field_name}...`}
                          value={taskFieldValues[field.id] || ""}
                          onChange={(e) =>
                            setTaskFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                        />
                      ) : field.field_type === "email" ? (
                        <input
                          type="email"
                          placeholder={`Enter ${field.field_name}...`}
                          value={taskFieldValues[field.id] || ""}
                          onChange={(e) =>
                            setTaskFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                        />
                      ) : (
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
                      )}
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

      {/* CUSTOM FIELD MODAL */}
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
                <option value="phone">Phone</option>
                <option value="url">URL</option>
                <option value="dropdown">Dropdown</option>
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

      {/* STATUS MODAL */}
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
                  Folder: <strong>{activeFolder.name}</strong>
                </>
              ) : (
                <>
                  Space: <strong>{activeSpace?.name}</strong>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      background: "#fef9c3",
                      color: "#854d0e",
                      padding: "1px 8px",
                      borderRadius: 20,
                    }}
                  >
                    Showing all folder statuses combined
                  </span>
                </>
              )}
            </div>
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
            <div
              style={{ borderTop: "1px solid #e8e8e8", margin: "4px 0 16px" }}
            />
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
