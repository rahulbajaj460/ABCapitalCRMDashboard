import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import ImportTasks from "./ImportTasks";

const PRIORITY_STYLES = {
  High: { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  Medium: { bg: "#fef9c3", color: "#854d0e", dot: "#eab308" },
  Low: { bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
};

function PriorityDot({ priority }) {
  const s = PRIORITY_STYLES[priority] || PRIORITY_STYLES.Medium;
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: s.dot,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

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
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
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

  // ── Task drawer state ──
  const [drawerTask, setDrawerTask] = useState(null); // task being viewed
  const [drawerEdits, setDrawerEdits] = useState({}); // unsaved edits
  const [drawerFieldValues, setDrawerFieldValues] = useState({});
  const [drawerSaved, setDrawerSaved] = useState(false);
  const drawerRef = useRef(null);

  // ── New task quick-create (inline at bottom of group) ──
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
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

  const [newStatus, setNewStatus] = useState({ name: "", color: "#378ADD" });
  const [showImport, setShowImport] = useState(false);
  const [modalSpaceStatuses, setModalSpaceStatuses] = useState([]);
  const [statusActionMsg, setStatusActionMsg] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);

  function updateVisibleColumns(cols) {
    setVisibleColumns(cols);
    localStorage.setItem("abc_visible_columns", JSON.stringify(cols));
  }

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
    function handler(e) {
      if (showColumnPicker && !e.target.closest(".column-picker-wrap"))
        setShowColumnPicker(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColumnPicker]);
  // Close drawer on Escape
  useEffect(() => {
    function handler(e) {
      if (e.key === "Escape") setDrawerTask(null);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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
    if (activeFolder) query = query.eq("folder_id", activeFolder.id);
    else if (activeSpace) query = query.eq("space_id", activeSpace.id);
    if (profile?.role === "member") query = query.eq("assignee_id", profile.id);
    const { data } = await query;
    if (data) {
      setTasks(data);
      // Refresh drawer task if open
      if (drawerTask) {
        const updated = data.find((t) => t.id === drawerTask.id);
        if (updated) setDrawerTask(updated);
      }
    }
  }

  // ── Status helpers ──
  function getStatuses() {
    if (activeFolder) {
      const fs = (activeSpace?.space_statuses || [])
        .filter((s) => s.folder_id === activeFolder.id)
        .sort((a, b) => a.status_order - b.status_order);
      if (fs.length > 0) return fs.map((s) => s.name);
      const sl = (activeSpace?.space_statuses || [])
        .filter((s) => !s.folder_id)
        .sort((a, b) => a.status_order - b.status_order);
      if (sl.length > 0) return sl.map((s) => s.name);
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
    const spaceLevel = (activeSpace?.space_statuses || [])
      .filter((s) => !s.folder_id)
      .sort((a, b) => a.status_order - b.status_order);
    if (spaceLevel.length > 0) return spaceLevel.map((s) => s.name);
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  function getFolderStatuses(folder) {
    const fs = (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folder.id)
      .sort((a, b) => a.status_order - b.status_order);
    if (fs.length > 0) return fs.map((s) => s.name);
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
    if (unique.length > 0) return unique;
    (activeSpace?.space_statuses || [])
      .filter((s) => !s.folder_id)
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
      const ff = activeFolder.space_fields || [];
      if (ff.length > 0)
        return ff.sort((a, b) => a.field_order - b.field_order);
    }
    return (activeSpace?.space_fields || []).sort(
      (a, b) => a.field_order - b.field_order,
    );
  }

  function getFolderFields(folder) {
    const ff = folder.space_fields || [];
    if (ff.length > 0) return ff.sort((a, b) => a.field_order - b.field_order);
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
    return (
      {
        "To Do": "#888",
        "In Progress": "#7c3aed",
        "In Review": "#d97706",
        Done: "#16a34a",
        "Client Cancelled": "#f59e0b",
      }[status] || "#888"
    );
  }

  function getStatusColorForFolder(status, folder) {
    const found = (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folder.id)
      .find((s) => s.name === status);
    return found ? found.color : getStatusColor(status);
  }

  function getPriorityStyle(priority) {
    const s = PRIORITY_STYLES[priority] || PRIORITY_STYLES.Medium;
    return { background: s.bg, color: s.color };
  }

  function getSelectedSpaceFolders() {
    return spaces.find((s) => s.id === newTask.space_id)?.folders || [];
  }

  function getSelectedSpaceStatuses() {
    const space = spaces.find((s) => s.id === newTask.space_id);
    if (!space) return ["To Do", "In Progress", "In Review", "Done"];
    if (newTask.folder_id) {
      const fs = (space.space_statuses || [])
        .filter((s) => s.folder_id === newTask.folder_id)
        .sort((a, b) => a.status_order - b.status_order);
      if (fs.length > 0) return fs.map((s) => s.name);
    }
    const seen = new Set();
    const unique = [];
    (space.space_statuses || [])
      .filter(
        (s) =>
          s.folder_id &&
          (space.folders || []).map((f) => f.id).includes(s.folder_id),
      )
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
      const ff = folder?.space_fields || [];
      if (ff.length > 0)
        return ff.sort((a, b) => a.field_order - b.field_order);
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
    if (groupBy === "status")
      return getStatuses().reduce((acc, s) => {
        acc[s] = taskList.filter((t) => t.status === s);
        return acc;
      }, {});
    if (groupBy === "folder") {
      const groups = {};
      (activeSpace?.folders || []).forEach((f) => {
        groups[f.name] = taskList.filter((t) => t.folder_id === f.id);
      });
      const ug = taskList.filter((t) => !t.folder_id);
      if (ug.length > 0) groups["No folder"] = ug;
      return groups;
    }
    if (groupBy === "assignee") {
      const groups = {};
      taskList.forEach((task) => {
        const names =
          task.assignees?.length > 0
            ? task.assignees
            : task.assignee
              ? [task.assignee]
              : ["Unassigned"];
        names.forEach((n) => {
          if (!groups[n]) groups[n] = [];
          groups[n].push(task);
        });
      });
      return Object.fromEntries(
        Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    if (groupBy === "priority")
      return ["High", "Medium", "Low"].reduce((acc, p) => {
        acc[p] = taskList.filter((t) => t.priority === p);
        return acc;
      }, {});
    return { "All tasks": taskList };
  }

  // ── Drawer open/close ──
  function openDrawer(task) {
    setDrawerTask(task);
    const fvMap = {};
    (task.task_field_values || []).forEach((fv) => {
      fvMap[fv.field_id] = fv.value;
    });
    setDrawerFieldValues(fvMap);
    // Initialize edits with current task values — empty string means "no due date" not "today"
    setDrawerEdits({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignees: task.assignees || [],
      due_date: task.due_date || "", // keep empty if not set
    });
  }

  function closeDrawer() {
    setDrawerTask(null);
    setDrawerEdits({});
  }

  async function saveDrawer() {
    if (!drawerTask) return;
    setDrawerSaving(true);

    const titleVal = (drawerEdits.title ?? drawerTask.title)?.trim();
    if (!titleVal) {
      setDrawerSaving(false);
      return;
    }

    const payload = {
      title: titleVal,
      description: drawerEdits.description ?? drawerTask.description ?? "",
      status: drawerEdits.status ?? drawerTask.status,
      priority: drawerEdits.priority ?? drawerTask.priority,
      assignees: drawerEdits.assignees ?? drawerTask.assignees ?? [],
      assignee: (drawerEdits.assignees ?? drawerTask.assignees ?? [])[0] || "",
      due_date:
        (drawerEdits.due_date !== undefined
          ? drawerEdits.due_date
          : drawerTask.due_date) || null,
    };

    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", drawerTask.id);
    if (error) {
      console.error("Save task error:", error);
      setDrawerSaving(false);
      return;
    }

    // Save field values — re-fetch current values to avoid stale data
    const { data: currentFVs } = await supabase
      .from("task_field_values")
      .select("*")
      .eq("task_id", drawerTask.id);
    for (const [fieldId, value] of Object.entries(drawerFieldValues)) {
      const existing = (currentFVs || []).find((v) => v.field_id === fieldId);
      if (existing) {
        await supabase
          .from("task_field_values")
          .update({ value })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("task_field_values")
          .insert({ task_id: drawerTask.id, field_id: fieldId, value });
      }
    }

    // Refresh tasks and update drawer with latest data
    let query = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .order("created_at", { ascending: false });
    if (activeFolder) query = query.eq("folder_id", activeFolder.id);
    else if (activeSpace) query = query.eq("space_id", activeSpace.id);
    if (profile?.role === "member") query = query.eq("assignee_id", profile.id);
    const { data: refreshed } = await query;
    if (refreshed) {
      setTasks(refreshed);
      const updated = refreshed.find((t) => t.id === drawerTask.id);
      if (updated) {
        setDrawerTask(updated);
        // Sync drawerEdits with saved values so re-save works correctly
        setDrawerEdits({
          title: updated.title,
          description: updated.description || "",
          status: updated.status,
          priority: updated.priority,
          assignees: updated.assignees || [],
          due_date: updated.due_date || "",
        });
        const fvMap = {};
        (updated.task_field_values || []).forEach((fv) => {
          fvMap[fv.field_id] = fv.value;
        });
        setDrawerFieldValues(fvMap);
      }
    }
    setDrawerSaving(false);
    setDrawerSaved(true);
    setTimeout(() => setDrawerSaved(false), 2000);
  }

  // ── Task CRUD ──
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
    const { data } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (data && Object.keys(taskFieldValues).length > 0) {
      for (const [fieldId, value] of Object.entries(taskFieldValues)) {
        await supabase
          .from("task_field_values")
          .insert({ task_id: data.id, field_id: fieldId, value });
      }
    }
    setShowNewTaskModal(false);
    setTaskFieldValues({});
    fetchTasks();
  }

  async function deleteTask(taskId) {
    if (!confirm("Delete this task?")) return;
    if (drawerTask?.id === taskId) closeDrawer();
    await supabase.from("tasks").delete().eq("id", taskId);
    fetchTasks();
  }

  async function updateTaskStatus(taskId, newSt) {
    await supabase.from("tasks").update({ status: newSt }).eq("id", taskId);
    if (drawerTask?.id === taskId)
      setDrawerEdits((prev) => ({ ...prev, status: newSt }));
    fetchTasks();
  }

  async function addCustomField() {
    if (!newField.field_name.trim() || !activeSpace) return;
    await supabase
      .from("space_fields")
      .insert({
        space_id: activeSpace.id,
        folder_id: activeFolder?.id || null,
        field_name: newField.field_name.trim(),
        field_type: newField.field_type,
        field_order: getFields().length + 1,
      });
    setNewField({ field_name: "", field_type: "text" });
    setShowFieldModal(false);
    onRefreshSpaces();
  }

  async function deleteCustomField(fieldId) {
    if (!confirm("Delete this custom field? All values will also be deleted."))
      return;
    await supabase.from("space_fields").delete().eq("id", fieldId);
    onRefreshSpaces();
    fetchTasks();
  }

  async function addCustomStatus() {
    if (!newStatus.name.trim() || !activeSpace) return;
    setStatusLoading(true);
    setStatusActionMsg("");
    if (activeFolder) {
      const { data: eFS } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id);
      if (!eFS || eFS.length === 0) {
        const { data: sS } = await supabase
          .from("space_statuses")
          .select("*")
          .eq("space_id", activeSpace.id)
          .is("folder_id", null)
          .order("status_order");
        if (sS?.length > 0)
          await supabase
            .from("space_statuses")
            .insert(
              sS.map((s) => ({
                space_id: activeSpace.id,
                folder_id: activeFolder.id,
                name: s.name,
                color: s.color,
                status_order: s.status_order,
              })),
            );
      }
    }
    let dupQ = supabase.from("space_statuses").select("name");
    if (activeFolder) dupQ = dupQ.eq("folder_id", activeFolder.id);
    else dupQ = dupQ.eq("space_id", activeSpace.id).is("folder_id", null);
    const { data: existing } = await dupQ;
    if (
      (existing || [])
        .map((s) => s.name.toLowerCase())
        .includes(newStatus.name.trim().toLowerCase())
    ) {
      setStatusActionMsg("⚠️ A status with this name already exists.");
      setStatusLoading(false);
      return;
    }
    const { error } = await supabase
      .from("space_statuses")
      .insert({
        space_id: activeSpace.id,
        folder_id: activeFolder?.id || null,
        name: newStatus.name.trim(),
        color: newStatus.color,
        status_order: (existing?.length || 0) + 1,
      });
    if (error) {
      setStatusActionMsg("❌ Failed to add status.");
    } else {
      const n = newStatus.name.trim();
      setNewStatus({ name: "", color: "#378ADD" });
      setStatusActionMsg(`✅ "${n}" added successfully.`);
      await fetchModalStatuses();
      await onRefreshSpaces();
      fetchTasks();
    }
    setStatusLoading(false);
  }

  async function deleteCustomStatus(statusId, statusName) {
    if (
      !confirm(
        `Delete "${statusName}"? Tasks will be moved to the next available status.`,
      )
    )
      return;
    setStatusLoading(true);
    setStatusActionMsg("");
    const remaining = modalSpaceStatuses.filter((s) => s.id !== statusId);
    const fallback = remaining.length > 0 ? remaining[0].name : null;
    if (fallback)
      await supabase
        .from("tasks")
        .update({ status: fallback })
        .eq("space_id", activeSpace.id)
        .eq("status", statusName);
    const { error } = await supabase
      .from("space_statuses")
      .delete()
      .eq("id", statusId);
    if (error) {
      setStatusActionMsg("❌ Failed to delete status.");
      setStatusLoading(false);
      return;
    }
    setStatusActionMsg(
      fallback
        ? `✅ "${statusName}" deleted. Affected tasks moved to "${fallback}".`
        : `✅ "${statusName}" deleted.`,
    );
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
    }
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

  function openNewTask() {
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
    setShowNewTaskModal(true);
  }

  // ─── Table head ───
  function renderTableHead(fieldList, indented = false) {
    return (
      <thead>
        <tr>
          <th style={indented ? { paddingLeft: 32 } : {}}>Name</th>
          {groupBy !== "status" && <th>Status</th>}
          {visibleColumns.includes("priority") && <th>Priority</th>}
          {visibleColumns.includes("assignees") && <th>Assignees</th>}
          {visibleColumns.includes("due_date") && <th>Due date</th>}
          {fieldList
            .filter((f) => visibleColumns.includes(`field_${f.id}`))
            .map((f) => (
              <th key={f.id}>{f.field_name}</th>
            ))}
          <th style={{ minWidth: 140 }}>Status</th>
          <th style={{ width: 60 }}></th>
        </tr>
      </thead>
    );
  }

  // ─── Task row — clicking name opens drawer ───
  function renderTaskRow(task, statusList, fieldList, folderCtx = null) {
    const statusColor = folderCtx
      ? getStatusColorForFolder(task.status, folderCtx)
      : getStatusColor(task.status);
    const isOverdue =
      task.due_date &&
      new Date(task.due_date) < new Date() &&
      task.status !== "Done";
    const isActive = drawerTask?.id === task.id;

    return (
      <tr
        key={task.id}
        style={{
          background: isActive ? "#f0f7ff" : undefined,
          cursor: "pointer",
        }}
        onClick={() => openDrawer(task)}
      >
        <td style={folderCtx ? { paddingLeft: 32 } : {}}>
          <span style={{ fontWeight: 500 }}>{task.title}</span>
          {task.description && (
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
              {task.description.slice(0, 60)}
              {task.description.length > 60 ? "..." : ""}
            </div>
          )}
        </td>
        {groupBy !== "status" && (
          <td>
            <span
              className="badge"
              style={{ background: statusColor + "22", color: statusColor }}
            >
              {task.status}
            </span>
          </td>
        )}
        {visibleColumns.includes("priority") && (
          <td>
            <span className="badge" style={getPriorityStyle(task.priority)}>
              {task.priority}
            </span>
          </td>
        )}
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
        <td style={{ minWidth: 140 }} onClick={(e) => e.stopPropagation()}>
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
        <td style={{ width: 60 }} onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => deleteTask(task.id)}
            style={{ padding: "3px 8px", fontSize: 11 }}
          >
            🗑
          </button>
        </td>
      </tr>
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

  // ── Task drawer edits ──
  const dStatus = drawerEdits.status ?? drawerTask?.status;
  const dPriority = drawerEdits.priority ?? drawerTask?.priority;
  const dAssignees = drawerEdits.assignees ?? drawerTask?.assignees ?? [];
  const dDueDate = drawerEdits.due_date ?? drawerTask?.due_date ?? "";
  const dTitle = drawerEdits.title ?? drawerTask?.title ?? "";
  const dDesc = drawerEdits.description ?? drawerTask?.description ?? "";

  const drawerStatuses = getStatuses();
  const drawerFields = getFields();

  return (
    <div
      style={{ display: "flex", flex: 1, overflow: "hidden", height: "100%" }}
    >
      {/* ── MAIN PANEL ── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div className="page-header">
          <div>
            <div
              className="page-title"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              {activeSpace && (
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: activeSpace.color || "#378ADD",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {activeSpace.icon || "🏢"}
                </span>
              )}
              {pageTitle}
            </div>
            {activeSpace && (
              <div
                className="page-subtitle"
                style={{ marginLeft: activeSpace ? 42 : 0 }}
              >
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
        <div className="toolbar-row">
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
          <div className="toolbar-right">
            <div className="toolbar-search">
              <span style={{ color: "#bbb", fontSize: 13 }}>🔍</span>
              <input
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div
              style={{ position: "relative" }}
              className="column-picker-wrap"
            >
              <button
                className="toolbar-btn"
                onClick={() => setShowColumnPicker((prev) => !prev)}
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
              className="toolbar-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              {getUniqueStatuses().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="toolbar-select"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="status">Group by: Status</option>
              <option value="folder">Group by: Folder</option>
              <option value="assignee">Group by: Assignee</option>
              <option value="priority">Group by: Priority</option>
            </select>
          </div>
        </div>

        <div className="content-area">
          {viewMode === "list" && (
            <div>
              {activeSpace && !activeFolder ? (
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
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 7,
                              }}
                            >
                              <svg
                                width="15"
                                height="13"
                                viewBox="0 0 16 14"
                                fill="none"
                                style={{ flexShrink: 0 }}
                              >
                                <path
                                  d="M1 3C1 2.17 1.67 1.5 2.5 1.5H5.8L7.3 3H13.5C14.33 3 15 3.67 15 4.5V11C15 11.83 14.33 12.5 13.5 12.5H2.5C1.67 12.5 1 11.83 1 11V3Z"
                                  fill="#9ca3af"
                                />
                                <path
                                  d="M1 5.5C1 4.67 1.67 4 2.5 4H13.5C14.33 4 15 4.67 15 5.5V11C15 11.83 14.33 12.5 13.5 12.5H2.5C1.67 12.5 1 11.83 1 11V5.5Z"
                                  fill="#6b7280"
                                />
                              </svg>
                              {folder.name}
                            </span>
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
                                      ? getStatusColorForFolder(
                                          groupName,
                                          folder,
                                        )
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
                                          style={{
                                            fontSize: 10,
                                            color: "#aaa",
                                          }}
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
                                          style={{
                                            fontSize: 12,
                                            color: "#aaa",
                                          }}
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

                  {(() => {
                    const nft = tasks.filter((t) => !t.folder_id);
                    if (nft.length === 0) return null;
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
                            {nft.length} tasks
                          </span>
                        </div>
                        <table className="task-table">
                          {renderTableHead(getFields())}
                          <tbody>
                            {nft.map((task) =>
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
                                {renderTableHead(getFields())}
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
                        onClick={() => openDrawer(task)}
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
                        {(task.assignees?.length > 0 || task.assignee) && (
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
              style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "#aaa",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>No tasks yet</div>
              <div style={{ fontSize: 12 }}>
                Click "+ New Task" to create your first task
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          TASK DETAIL DRAWER — right side panel
          ══════════════════════════════════════════ */}
      {drawerTask && (
        <div
          ref={drawerRef}
          style={{
            width: 420,
            flexShrink: 0,
            borderLeft: "1px solid #e8e8e8",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: "100%",
            boxShadow: "-4px 0 20px rgba(0,0,0,0.06)",
            animation: "slideInRight 0.18s ease",
          }}
        >
          {/* Drawer header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid #ebebeb",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#fff",
              flexShrink: 0,
            }}
          >
            <div
              style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ fontSize: 11, color: "#aaa" }}>
                {activeSpace?.name}
                {activeFolder ? ` / ${activeFolder.name}` : ""}
              </span>
            </div>
            <button
              onClick={saveDrawer}
              disabled={drawerSaving}
              style={{
                padding: "5px 14px",
                borderRadius: 7,
                border: "none",
                background: drawerSaved ? "#16a34a" : "#1d4ed8",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
                minWidth: 70,
              }}
            >
              {drawerSaving ? "Saving..." : drawerSaved ? "Saved ✓" : "Save"}
            </button>
            <button
              onClick={closeDrawer}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid #e0e0e0",
                background: "#fff",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
              }}
            >
              ✕
            </button>
          </div>

          {/* Drawer body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 20px 28px",
              scrollbarWidth: "thin",
              scrollbarColor: "#e0e0de transparent",
            }}
          >
            {/* Task title */}
            <textarea
              value={dTitle}
              onChange={(e) =>
                setDrawerEdits((prev) => ({ ...prev, title: e.target.value }))
              }
              style={{
                width: "100%",
                fontSize: 18,
                fontWeight: 700,
                color: "#1a1a1a",
                border: "none",
                outline: "none",
                resize: "none",
                background: "transparent",
                fontFamily: "inherit",
                lineHeight: 1.35,
                marginBottom: 20,
                padding: 0,
                boxSizing: "border-box",
                minHeight: 54,
              }}
              onFocus={(e) => (e.target.style.background = "#f9f9f9")}
              onBlur={(e) => (e.target.style.background = "transparent")}
            />

            {/* Fields grid */}
            {[
              {
                label: "Status",
                icon: "◎",
                content: (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {drawerStatuses.map((s) => {
                      const sc = getStatusColor(s);
                      const isActive = dStatus === s;
                      return (
                        <button
                          key={s}
                          onClick={() =>
                            setDrawerEdits((prev) => ({ ...prev, status: s }))
                          }
                          style={{
                            padding: "4px 12px",
                            borderRadius: 20,
                            border: isActive ? "none" : "1.5px solid #e0e0e0",
                            background: isActive ? sc : "#fff",
                            color: isActive ? "#fff" : "#555",
                            fontSize: 12,
                            fontWeight: isActive ? 600 : 400,
                            cursor: "pointer",
                            transition: "all 0.1s",
                          }}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                ),
              },
              {
                label: "Priority",
                icon: "⚑",
                content: (
                  <div style={{ display: "flex", gap: 6 }}>
                    {["High", "Medium", "Low"].map((p) => {
                      const ps = PRIORITY_STYLES[p];
                      const isActive = dPriority === p;
                      return (
                        <button
                          key={p}
                          onClick={() =>
                            setDrawerEdits((prev) => ({ ...prev, priority: p }))
                          }
                          style={{
                            padding: "4px 12px",
                            borderRadius: 20,
                            border: isActive ? "none" : "1.5px solid #e0e0e0",
                            background: isActive ? ps.bg : "#fff",
                            color: isActive ? ps.color : "#555",
                            fontSize: 12,
                            fontWeight: isActive ? 600 : 400,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {isActive && <PriorityDot priority={p} />}
                          {p}
                        </button>
                      );
                    })}
                  </div>
                ),
              },
              {
                label: "Assignees",
                icon: "👤",
                content: (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginBottom: dAssignees.length > 0 ? 8 : 0,
                      }}
                    >
                      {dAssignees.map((name) => (
                        <span
                          key={name}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            borderRadius: 20,
                            padding: "3px 10px",
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
                              setDrawerEdits((prev) => ({
                                ...prev,
                                assignees: (
                                  prev.assignees ??
                                  drawerTask.assignees ??
                                  []
                                ).filter((a) => a !== name),
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
                        if (name && !dAssignees.includes(name))
                          setDrawerEdits((prev) => ({
                            ...prev,
                            assignees: [
                              ...(prev.assignees ?? drawerTask.assignees ?? []),
                              name,
                            ],
                          }));
                      }}
                      style={{
                        fontSize: 12,
                        padding: "5px 8px",
                        borderRadius: 7,
                        border: "1px solid #e0e0e0",
                        background: "#fff",
                        color: "#555",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">+ Add assignee</option>
                      {members
                        .filter((m) => !dAssignees.includes(m.full_name))
                        .map((m) => (
                          <option key={m.id} value={m.full_name}>
                            {m.full_name}
                          </option>
                        ))}
                    </select>
                  </div>
                ),
              },
              {
                label: "Due date",
                icon: "📅",
                content: (
                  <input
                    type="date"
                    value={dDueDate}
                    onChange={(e) =>
                      setDrawerEdits((prev) => ({
                        ...prev,
                        due_date: e.target.value,
                      }))
                    }
                    style={{
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 7,
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      color: "#555",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  />
                ),
              },
            ].map(({ label, icon, content }) => (
              <div key={label} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#aaa",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{icon}</span>
                  {label}
                </div>
                {content}
              </div>
            ))}

            {/* Custom fields */}
            {drawerFields.length > 0 && (
              <div
                style={{
                  borderTop: "1px solid #f0f0f0",
                  paddingTop: 16,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#aaa",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    marginBottom: 12,
                  }}
                >
                  Custom fields
                </div>
                {drawerFields.map((field) => {
                  const val = drawerFieldValues[field.id] || "";
                  return (
                    <div key={field.id} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#666",
                          marginBottom: 5,
                        }}
                      >
                        {field.field_name}
                      </div>
                      {field.field_type === "dropdown" &&
                      field.field_options?.length > 0 ? (
                        <select
                          value={val}
                          onChange={(e) =>
                            setDrawerFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          style={{
                            fontSize: 12,
                            padding: "5px 10px",
                            borderRadius: 7,
                            border: "1px solid #e0e0e0",
                            background: "#fff",
                            width: "100%",
                            outline: "none",
                          }}
                        >
                          <option value="">Select {field.field_name}...</option>
                          {field.field_options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={
                            field.field_type === "date"
                              ? "date"
                              : field.field_type === "number"
                                ? "number"
                                : field.field_type === "email"
                                  ? "email"
                                  : "text"
                          }
                          placeholder={`Enter ${field.field_name}...`}
                          value={val}
                          onChange={(e) =>
                            setDrawerFieldValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          style={{
                            fontSize: 12,
                            padding: "7px 10px",
                            borderRadius: 7,
                            border: "1px solid #e0e0e0",
                            background: "#fff",
                            width: "100%",
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                          onFocus={(e) =>
                            (e.target.style.borderColor = "#1d4ed8")
                          }
                          onBlur={(e) =>
                            (e.target.style.borderColor = "#e0e0e0")
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Description */}
            <div
              style={{
                borderTop: "1px solid #f0f0f0",
                paddingTop: 16,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#aaa",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 8,
                }}
              >
                📝 Description
              </div>
              <textarea
                value={dDesc}
                onChange={(e) =>
                  setDrawerEdits((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Add a description..."
                style={{
                  width: "100%",
                  fontSize: 13,
                  padding: "10px 12px",
                  border: "1.5px solid #e0e0e0",
                  borderRadius: 8,
                  resize: "vertical",
                  minHeight: 100,
                  outline: "none",
                  fontFamily: "inherit",
                  color: "#333",
                  lineHeight: 1.6,
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#1d4ed8")}
                onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
              />
            </div>

            {/* Delete at bottom */}
            <div
              style={{
                borderTop: "1px solid #f0f0f0",
                paddingTop: 16,
                marginTop: 8,
              }}
            >
              <button
                onClick={() => deleteTask(drawerTask.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: "1px solid #fca5a5",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                🗑 Delete task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW TASK MODAL ── */}
      {showNewTaskModal && (
        <div
          className="modal-overlay"
          onClick={(e) =>
            e.target === e.currentTarget && setShowNewTaskModal(false)
          }
        >
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">New task</div>
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
                      ) : (
                        <input
                          type={
                            field.field_type === "date"
                              ? "date"
                              : field.field_type === "number"
                                ? "number"
                                : field.field_type === "email"
                                  ? "email"
                                  : "text"
                          }
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
              <button
                className="btn"
                onClick={() => setShowNewTaskModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveTask}>
                Create task
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
                  <span>Folder: </span>
                  <strong>{activeFolder.name}</strong>
                </>
              ) : (
                <>
                  <span>Space: </span>
                  <strong>{activeSpace?.name}</strong>
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

      {/* Drawer slide-in animation */}
      <style>{`@keyframes slideInRight { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
