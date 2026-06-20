import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import ImportTasks from "./ImportTasks";

const PRIORITY_STYLES = {
  High: { bg: "#fee2e2", color: "#b91c1c", dot: "#ef4444" },
  Medium: { bg: "#fef9c3", color: "#854d0e", dot: "#eab308" },
  Low: { bg: "#dcfce7", color: "#15803d", dot: "#22c55e" },
};

const FORMULA_PRESETS = [
  {
    key: "days_since_created",
    label: "Days since created",
    fn: (task) =>
      Math.floor((Date.now() - new Date(task.created_at)) / 86400000),
  },
  {
    key: "days_since_updated",
    label: "Days since updated",
    fn: (task) =>
      Math.floor(
        (Date.now() - new Date(task.updated_at || task.created_at)) / 86400000,
      ),
  },
  {
    key: "days_until_due",
    label: "Days until due date",
    fn: (task) =>
      task.due_date
        ? Math.ceil((new Date(task.due_date) - Date.now()) / 86400000)
        : null,
  },
  { key: "custom", label: "Custom (manual text)", fn: () => null },
];

function computeFormula(field, task) {
  if (field.field_type !== "formula") return null;
  const opts = field.field_options || [];
  const key = opts[0] || "days_since_created";
  const now = Date.now();
  if (key === "days_since_created") {
    if (!task.created_at) return "—";
    const days = Math.floor((now - new Date(task.created_at)) / 86400000);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (key === "days_since_updated") {
    const ref = task.updated_at || task.created_at;
    if (!ref) return "—";
    const days = Math.floor((now - new Date(ref)) / 86400000);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (key === "days_until_due") {
    if (!task.due_date) return "No due date";
    const days = Math.ceil((new Date(task.due_date) - now) / 86400000);
    if (days < 0)
      return `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`;
    if (days === 0) return "Due today";
    return `${days} day${days !== 1 ? "s" : ""} left`;
  }
  if (key === "custom") {
    const expr = (opts[1] || "").trim();
    if (!expr) return "—";
    if (expr.includes("days_since(created_at)")) {
      const days = Math.floor((now - new Date(task.created_at)) / 86400000);
      return expr.replace("days_since(created_at)", `${days} days`);
    }
    if (
      expr.includes("days_until(due_date)") ||
      expr.includes("days_between(created_at, due_date)")
    ) {
      if (!task.due_date) return "No due date";
      const days = Math.ceil((new Date(task.due_date) - now) / 86400000);
      const label =
        days < 0
          ? `${Math.abs(days)} days overdue`
          : days === 0
            ? "Due today"
            : `${days} days left`;
      return expr
        .replace("days_until(due_date)", label)
        .replace("days_between(created_at, due_date)", label);
    }
    return expr;
  }
  return "—";
}

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

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFullDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [newField, setNewField] = useState({
    field_name: "",
    field_type: "text",
    field_options: [],
    formula_key: "days_since_created",
    custom_formula: "",
  });
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [editingFieldOptions, setEditingFieldOptions] = useState([]);
  // Local overrides so custom-field create/delete/edit reflect instantly
  // without waiting on the parent's spaces prop to refresh.
  const [fieldOptionsOverride, setFieldOptionsOverride] = useState({});
  const [locallyAddedFields, setLocallyAddedFields] = useState([]);
  const [locallyDeletedFieldIds, setLocallyDeletedFieldIds] = useState([]);
  const [fieldAddedFlash, setFieldAddedFlash] = useState(false);
  const [members, setMembers] = useState([]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const s = localStorage.getItem("abc_visible_columns");
      return s ? JSON.parse(s) : ["priority", "assignees", "due_date"];
    } catch {
      return ["priority", "assignees", "due_date"];
    }
  });

  // Drawer
  const [drawerTask, setDrawerTask] = useState(null);
  const [drawerEdits, setDrawerEdits] = useState({});
  const [drawerFieldValues, setDrawerFieldValues] = useState({});
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerSaved, setDrawerSaved] = useState(false);
  const [drawerTab, setDrawerTab] = useState("details"); // "details" | "history"
  const [taskHistory, setTaskHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const drawerRef = useRef(null);

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
    date_done: "",
    date_closed: "",
    date_updated_manual: "",
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
    if (activeSpace) setNewTask((p) => ({ ...p, space_id: activeSpace.id }));
  }, [activeSpace]);
  useEffect(() => {
    function h(e) {
      if (showColumnPicker && !e.target.closest(".column-picker-wrap"))
        setShowColumnPicker(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showColumnPicker]);
  useEffect(() => {
    function h(e) {
      if (e.key === "Escape") {
        setDrawerTask(null);
        setDrawerTab("details");
      }
    }
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  async function fetchMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    if (data) setMembers(data);
  }

  async function fetchTasks() {
    let q = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (activeFolder) q = q.eq("folder_id", activeFolder.id);
    else if (activeSpace) q = q.eq("space_id", activeSpace.id);
    if (profile?.role === "member") q = q.eq("assignee_id", profile.id);
    const { data } = await q;
    if (data) {
      setTasks(data);
      if (drawerTask) {
        const u = data.find((t) => t.id === drawerTask.id);
        if (u) setDrawerTask(u);
      }
    }
  }

  async function fetchTaskHistory(taskId) {
    setHistoryLoading(true);
    const { data } = await supabase
      .from("task_history")
      .select("*")
      .eq("task_id", taskId)
      .order("changed_at", { ascending: false })
      .limit(50);
    setTaskHistory(data || []);
    setHistoryLoading(false);
  }

  // Status helpers
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
  function applyFieldOverrides(fields, scopeSpaceId, scopeFolderId) {
    // Start with prop fields, apply option overrides, drop locally-deleted ones
    let result = fields
      .filter((f) => !locallyDeletedFieldIds.includes(f.id))
      .map((f) =>
        fieldOptionsOverride[f.id] !== undefined
          ? { ...f, field_options: fieldOptionsOverride[f.id] }
          : f,
      );
    // Merge in any fields added locally that the parent prop doesn't have yet
    const existingIds = new Set(result.map((f) => f.id));
    const extras = locallyAddedFields.filter(
      (f) =>
        !existingIds.has(f.id) &&
        !locallyDeletedFieldIds.includes(f.id) &&
        f.space_id === scopeSpaceId &&
        (f.folder_id || null) === (scopeFolderId || null),
    );
    if (extras.length > 0) result = [...result, ...extras];
    return result;
  }
  function getFields() {
    if (activeFolder) {
      const ff = activeFolder.space_fields || [];
      if (ff.length > 0)
        return applyFieldOverrides(
          ff.sort((a, b) => a.field_order - b.field_order),
          activeSpace?.id,
          activeFolder.id,
        );
    }
    return applyFieldOverrides(
      (activeSpace?.space_fields || []).sort(
        (a, b) => a.field_order - b.field_order,
      ),
      activeSpace?.id,
      null,
    );
  }
  function getFolderFields(folder) {
    const ff = folder.space_fields || [];
    if (ff.length > 0)
      return applyFieldOverrides(
        ff.sort((a, b) => a.field_order - b.field_order),
        activeSpace?.id,
        folder.id,
      );
    return applyFieldOverrides(
      (activeSpace?.space_fields || []).sort(
        (a, b) => a.field_order - b.field_order,
      ),
      activeSpace?.id,
      null,
    );
  }
  function getStatusColor(status) {
    if (activeFolder) {
      const f = (activeSpace?.space_statuses || [])
        .filter((s) => s.folder_id === activeFolder.id)
        .find((s) => s.name === status);
      if (f) return f.color;
    }
    const f = (activeSpace?.space_statuses || []).find(
      (s) => s.name === status,
    );
    if (f) return f.color;
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
    const f = (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folder.id)
      .find((s) => s.name === status);
    return f ? f.color : getStatusColor(status);
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
        return applyFieldOverrides(
          ff.sort((a, b) => a.field_order - b.field_order),
          space.id,
          newTask.folder_id,
        );
    }
    return applyFieldOverrides(
      (space.space_fields || []).sort((a, b) => a.field_order - b.field_order),
      space.id,
      null,
    );
  }

  // ── Sorting ──
  function handleSort(key) {
    setSortConfig((prev) => {
      if (prev.key === key) {
        // toggle asc -> desc -> off
        if (prev.direction === "asc") return { key, direction: "desc" };
        return { key: null, direction: "asc" };
      }
      return { key, direction: "asc" };
    });
  }

  function getSortValue(task, key) {
    if (key === "title") return (task.title || "").toLowerCase();
    if (key === "priority") {
      const order = { High: 3, Medium: 2, Low: 1 };
      return order[task.priority] || 0;
    }
    if (key === "assignees")
      return (
        task.assignees?.[0]?.toLowerCase() || task.assignee?.toLowerCase() || ""
      );
    if (
      key === "due_date" ||
      key === "date_done" ||
      key === "date_closed" ||
      key === "date_updated_manual"
    )
      return task[key] ? new Date(task[key]).getTime() : null;
    if (key.startsWith("field_")) {
      const fieldId = key.replace("field_", "");
      const fv = task.task_field_values?.find((v) => v.field_id === fieldId);
      const val = fv?.value || "";
      const num = Number(val);
      return !isNaN(num) && val.trim() !== "" ? num : val.toLowerCase();
    }
    return "";
  }

  function sortTasks(taskList) {
    if (!sortConfig.key) return taskList;
    const sorted = [...taskList].sort((a, b) => {
      const va = getSortValue(a, sortConfig.key);
      const vb = getSortValue(b, sortConfig.key);
      // nulls/empties always sort last regardless of direction
      const aEmpty = va === null || va === undefined || va === "";
      const bEmpty = vb === null || vb === undefined || vb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (va < vb) return sortConfig.direction === "asc" ? -1 : 1;
      if (va > vb) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  function getGroupedTasks() {
    const tl = filteredTasks;
    let result;
    if (groupBy === "status") {
      result = getStatuses().reduce((acc, s) => {
        acc[s] = tl.filter((t) => t.status === s);
        return acc;
      }, {});
    } else if (groupBy === "folder") {
      const g = {};
      (activeSpace?.folders || []).forEach((f) => {
        g[f.name] = tl.filter((t) => t.folder_id === f.id);
      });
      const ug = tl.filter((t) => !t.folder_id);
      if (ug.length > 0) g["No folder"] = ug;
      result = g;
    } else if (groupBy === "assignee") {
      const g = {};
      tl.forEach((task) => {
        const names =
          task.assignees?.length > 0
            ? task.assignees
            : task.assignee
              ? [task.assignee]
              : ["Unassigned"];
        names.forEach((n) => {
          if (!g[n]) g[n] = [];
          g[n].push(task);
        });
      });
      result = Object.fromEntries(
        Object.entries(g).sort(([a], [b]) => a.localeCompare(b)),
      );
    } else if (groupBy === "priority") {
      result = ["High", "Medium", "Low"].reduce((acc, p) => {
        acc[p] = tl.filter((t) => t.priority === p);
        return acc;
      }, {});
    } else {
      result = { "All tasks": tl };
    }
    // Apply column sort within each group, independent of grouping
    return Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, sortTasks(v)]),
    );
  }

  // Drawer
  function openDrawer(task) {
    setDrawerTask(task);
    const fvMap = {};
    (task.task_field_values || []).forEach((fv) => {
      fvMap[fv.field_id] = fv.value;
    });
    setDrawerFieldValues(fvMap);
    setDrawerEdits({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignees: task.assignees || [],
      due_date: task.due_date || "",
      date_done: task.date_done || "",
      date_closed: task.date_closed || "",
      date_updated_manual: task.date_updated_manual || "",
    });
    setDrawerTab("details");
  }
  function closeDrawer() {
    setDrawerTask(null);
    setDrawerEdits({});
    setDrawerTab("details");
    setTaskHistory([]);
  }

  // Build change diff for history
  function buildChanges(oldTask, newPayload) {
    const changes = {};
    const fields = [
      "title",
      "status",
      "priority",
      "assignees",
      "due_date",
      "description",
    ];
    fields.forEach((f) => {
      const oldVal =
        f === "assignees" ? JSON.stringify(oldTask[f] || []) : oldTask[f];
      const newVal =
        f === "assignees" ? JSON.stringify(newPayload[f] || []) : newPayload[f];
      if (oldVal !== newVal)
        changes[f] = { from: oldTask[f], to: newPayload[f] };
    });
    return changes;
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
      date_done:
        (drawerEdits.date_done !== undefined
          ? drawerEdits.date_done
          : drawerTask.date_done) || null,
      date_closed:
        (drawerEdits.date_closed !== undefined
          ? drawerEdits.date_closed
          : drawerTask.date_closed) || null,
      date_updated_manual:
        (drawerEdits.date_updated_manual !== undefined
          ? drawerEdits.date_updated_manual
          : drawerTask.date_updated_manual) || null,
      updated_by: profile?.full_name || "Unknown",
      updated_at: new Date().toISOString(),
    };
    const changes = buildChanges(drawerTask, payload);
    const { error } = await supabase
      .from("tasks")
      .update(payload)
      .eq("id", drawerTask.id);
    if (error) {
      console.error("Save error:", error);
      setDrawerSaving(false);
      return;
    }

    // Save history entry if anything changed
    if (Object.keys(changes).length > 0) {
      await supabase.from("task_history").insert({
        task_id: drawerTask.id,
        changed_by: profile?.full_name || "Unknown",
        changed_at: new Date().toISOString(),
        changes,
        snapshot: { ...drawerTask, ...payload },
      });
    }

    // Save field values
    const { data: currentFVs } = await supabase
      .from("task_field_values")
      .select("*")
      .eq("task_id", drawerTask.id);
    for (const [fieldId, value] of Object.entries(drawerFieldValues)) {
      const existing = (currentFVs || []).find((v) => v.field_id === fieldId);
      if (existing)
        await supabase
          .from("task_field_values")
          .update({ value })
          .eq("id", existing.id);
      else
        await supabase
          .from("task_field_values")
          .insert({ task_id: drawerTask.id, field_id: fieldId, value });
    }

    let q = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (activeFolder) q = q.eq("folder_id", activeFolder.id);
    else if (activeSpace) q = q.eq("space_id", activeSpace.id);
    if (profile?.role === "member") q = q.eq("assignee_id", profile.id);
    const { data: refreshed } = await q;
    if (refreshed) {
      setTasks(refreshed);
      const updated = refreshed.find((t) => t.id === drawerTask.id);
      if (updated) {
        setDrawerTask(updated);
        setDrawerEdits({
          title: updated.title,
          description: updated.description || "",
          status: updated.status,
          priority: updated.priority,
          assignees: updated.assignees || [],
          due_date: updated.due_date || "",
          date_done: updated.date_done || "",
          date_closed: updated.date_closed || "",
          date_updated_manual: updated.date_updated_manual || "",
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
    // Refresh history if on history tab
    if (drawerTab === "history") fetchTaskHistory(drawerTask.id);
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
      date_done: newTask.date_done || null,
      date_closed: newTask.date_closed || null,
      date_updated_manual: newTask.date_updated_manual || null,
      updated_by: profile?.full_name || "Unknown",
      updated_at: new Date().toISOString(),
    };
    const { data } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (data && Object.keys(taskFieldValues).length > 0) {
      for (const [fieldId, value] of Object.entries(taskFieldValues))
        await supabase
          .from("task_field_values")
          .insert({ task_id: data.id, field_id: fieldId, value });
    }
    // Record creation in history
    if (data) {
      await supabase.from("task_history").insert({
        task_id: data.id,
        changed_by: profile?.full_name || "Unknown",
        changed_at: new Date().toISOString(),
        changes: { created: true },
        snapshot: data,
      });
    }
    setShowNewTaskModal(false);
    setTaskFieldValues({});
    fetchTasks();
  }

  async function deleteTask(taskId) {
    if (!confirm("Move this task to Trash? You can restore it later.")) return;
    if (drawerTask?.id === taskId) closeDrawer();
    await supabase
      .from("tasks")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.full_name || "Unknown",
      })
      .eq("id", taskId);
    fetchTasks();
  }

  async function updateTaskStatus(taskId, newSt) {
    const task = tasks.find((t) => t.id === taskId);
    const oldStatus = task?.status;
    await supabase
      .from("tasks")
      .update({
        status: newSt,
        updated_by: profile?.full_name || "Unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (task && oldStatus !== newSt) {
      await supabase.from("task_history").insert({
        task_id: taskId,
        changed_by: profile?.full_name || "Unknown",
        changed_at: new Date().toISOString(),
        changes: { status: { from: oldStatus, to: newSt } },
      });
    }
    if (drawerTask?.id === taskId)
      setDrawerEdits((p) => ({ ...p, status: newSt }));
    fetchTasks();
  }

  async function addCustomField() {
    if (!newField.field_name.trim() || !activeSpace) return;
    let fieldOptions = null;
    if (newField.field_type === "dropdown")
      fieldOptions = newField.field_options?.filter((o) => o.trim()) || [];
    else if (newField.field_type === "formula")
      fieldOptions = [newField.formula_key, newField.custom_formula || ""];
    const payload = {
      space_id: activeSpace.id,
      folder_id: activeFolder?.id || null,
      field_name: newField.field_name.trim(),
      field_type: newField.field_type,
      field_order: getFields().length + 1,
      field_options: fieldOptions,
    };
    const { data, error } = await supabase
      .from("space_fields")
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      // Reflect instantly in the UI without waiting on the parent prop
      setLocallyAddedFields((prev) => [...prev, data]);
      setFieldAddedFlash(true);
      setTimeout(() => setFieldAddedFlash(false), 1800);
    }
    setNewField({
      field_name: "",
      field_type: "text",
      field_options: [],
      formula_key: "days_since_created",
      custom_formula: "",
    });
    // Keep modal open so the new field is visible in "Existing fields" above
    onRefreshSpaces();
  }

  async function deleteCustomField(fieldId) {
    if (!confirm("Delete this custom field? All values will also be deleted."))
      return;
    // Hide instantly from the UI
    setLocallyDeletedFieldIds((prev) => [...prev, fieldId]);
    await supabase.from("space_fields").delete().eq("id", fieldId);
    onRefreshSpaces();
    fetchTasks();
  }

  function startEditFieldOptions(field) {
    setEditingFieldId(field.id);
    setEditingFieldOptions(field.field_options || []);
  }

  function cancelEditFieldOptions() {
    setEditingFieldId(null);
    setEditingFieldOptions([]);
  }

  async function saveFieldOptions(fieldId) {
    const cleaned = editingFieldOptions.map((o) => o.trim()).filter(Boolean);
    // Apply locally first so the UI updates instantly
    setFieldOptionsOverride((prev) => ({ ...prev, [fieldId]: cleaned }));
    await supabase
      .from("space_fields")
      .update({ field_options: cleaned })
      .eq("id", fieldId);
    setEditingFieldId(null);
    setEditingFieldOptions([]);
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
          await supabase.from("space_statuses").insert(
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
    const { error } = await supabase.from("space_statuses").insert({
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
        ? `✅ "${statusName}" deleted. Tasks moved to "${fallback}".`
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
      date_done: "",
      date_closed: "",
      date_updated_manual: "",
    });
    setShowNewTaskModal(true);
  }

  function SortableHeader({ sortKey, children, style }) {
    const isActive = sortConfig.key === sortKey;
    return (
      <th
        onClick={() => handleSort(sortKey)}
        style={{
          cursor: "pointer",
          userSelect: "none",
          color: isActive ? "#1d4ed8" : undefined,
          ...style,
        }}
        title="Click to sort"
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {children}
          <span
            style={{
              fontSize: 10,
              color: isActive ? "#1d4ed8" : "#ccc",
              opacity: isActive ? 1 : 0.6,
            }}
          >
            {isActive ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </span>
      </th>
    );
  }

  function renderTableHead(fieldList, indented = false) {
    return (
      <thead>
        <tr>
          <SortableHeader
            sortKey="title"
            style={indented ? { paddingLeft: 32 } : {}}
          >
            Name
          </SortableHeader>
          {groupBy !== "status" && <th>Status</th>}
          {visibleColumns.includes("priority") && (
            <SortableHeader sortKey="priority">Priority</SortableHeader>
          )}
          {visibleColumns.includes("assignees") && (
            <SortableHeader sortKey="assignees">Assignees</SortableHeader>
          )}
          {visibleColumns.includes("due_date") && (
            <SortableHeader sortKey="due_date">Due date</SortableHeader>
          )}
          {visibleColumns.includes("date_done") && (
            <SortableHeader sortKey="date_done">Date Done</SortableHeader>
          )}
          {visibleColumns.includes("date_closed") && (
            <SortableHeader sortKey="date_closed">Date Closed</SortableHeader>
          )}
          {visibleColumns.includes("date_updated_manual") && (
            <SortableHeader sortKey="date_updated_manual">
              Date Updated
            </SortableHeader>
          )}
          {fieldList
            .filter((f) => visibleColumns.includes(`field_${f.id}`))
            .map((f) => (
              <SortableHeader key={f.id} sortKey={`field_${f.id}`}>
                {f.field_name}
              </SortableHeader>
            ))}
          <th style={{ minWidth: 140 }}>Status</th>
          <th style={{ width: 60 }}></th>
        </tr>
      </thead>
    );
  }

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
          {task.updated_by && (
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
              ✎ {task.updated_by} · {timeAgo(task.updated_at)}
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
        {visibleColumns.includes("date_done") && (
          <td style={{ fontSize: 12, color: "#555" }}>
            {task.date_done || "—"}
          </td>
        )}
        {visibleColumns.includes("date_closed") && (
          <td style={{ fontSize: 12, color: "#555" }}>
            {task.date_closed || "—"}
          </td>
        )}
        {visibleColumns.includes("date_updated_manual") && (
          <td style={{ fontSize: 12, color: "#555" }}>
            {task.date_updated_manual || "—"}
          </td>
        )}
        {fieldList
          .filter((f) => visibleColumns.includes(`field_${f.id}`))
          .map((f) => {
            const fv = task.task_field_values?.find((v) => v.field_id === f.id);
            return (
              <td key={f.id}>
                {f.field_type === "formula" ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#7c3aed",
                      background: "#faf5ff",
                      borderRadius: 20,
                      padding: "1px 8px",
                    }}
                  >
                    ƒ {computeFormula(f, task)}
                  </span>
                ) : fv?.value ? (
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
                  ) : f.field_type === "username" ? (
                    <span
                      style={{
                        background: members.some(
                          (m) => m.full_name === fv.value,
                        )
                          ? "#eff6ff"
                          : "#f0f0ef",
                        color: members.some((m) => m.full_name === fv.value)
                          ? "#1d4ed8"
                          : "#555",
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
  if (showImport)
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

  const dStatus = drawerEdits.status ?? drawerTask?.status;
  const dPriority = drawerEdits.priority ?? drawerTask?.priority;
  const dAssignees = drawerEdits.assignees ?? drawerTask?.assignees ?? [];
  const dDueDate = drawerEdits.due_date ?? drawerTask?.due_date ?? "";
  const dDateDone = drawerEdits.date_done ?? drawerTask?.date_done ?? "";
  const dDateClosed = drawerEdits.date_closed ?? drawerTask?.date_closed ?? "";
  const dDateUpdatedManual =
    drawerEdits.date_updated_manual ?? drawerTask?.date_updated_manual ?? "";
  const dTitle = drawerEdits.title ?? drawerTask?.title ?? "";
  const dDesc = drawerEdits.description ?? drawerTask?.description ?? "";
  const drawerStatuses = getStatuses();
  const drawerFields = getFields();

  // History change label
  function changeLabel(field, change) {
    if (field === "created") return "Task created";
    if (field === "status")
      return `Status: ${change.from || "—"} → ${change.to}`;
    if (field === "priority")
      return `Priority: ${change.from || "—"} → ${change.to}`;
    if (field === "title") return `Renamed: "${change.to}"`;
    if (field === "assignees") {
      const oldA = change.from || [];
      const newA = change.to || [];
      const added = newA.filter((a) => !oldA.includes(a));
      const removed = oldA.filter((a) => !newA.includes(a));
      const parts = [];
      if (added.length) parts.push(`Added ${added.join(", ")}`);
      if (removed.length) parts.push(`Removed ${removed.join(", ")}`);
      return "Assignees: " + (parts.join("; ") || "changed");
    }
    if (field === "due_date")
      return `Due date: ${change.from || "none"} → ${change.to || "none"}`;
    if (field === "description") return "Description updated";
    return `${field} changed`;
  }

  return (
    <div
      style={{ display: "flex", flex: 1, overflow: "hidden", height: "100%" }}
    >
      {/* MAIN PANEL */}
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
                onClick={() => setShowColumnPicker((p) => !p)}
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
                    { key: "date_done", label: "Date Done" },
                    { key: "date_closed", label: "Date Closed" },
                    { key: "date_updated_manual", label: "Date Updated" },
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
            {sortConfig.key && (
              <button
                className="toolbar-btn"
                onClick={() => setSortConfig({ key: null, direction: "asc" })}
                title="Clear column sort"
                style={{ color: "#1d4ed8", fontWeight: 600 }}
              >
                ✕ Sort: {sortConfig.key.replace("field_", "")} (
                {sortConfig.direction === "asc" ? "▲" : "▼"})
              </button>
            )}
          </div>
        </div>

        <div className="content-area">
          {viewMode === "list" && (
            <div className="task-table-scroll">
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
                    const groupedRaw =
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
                    const grouped = Object.fromEntries(
                      Object.entries(groupedRaw).map(([k, v]) => [
                        k,
                        sortTasks(v),
                      ]),
                    );
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
                            setExpandedGroups((p) => ({
                              ...p,
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
                                          setExpandedGroups((p) => ({
                                            ...p,
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
                    const nft = sortTasks(tasks.filter((t) => !t.folder_id));
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
                              setExpandedGroups((p) => ({
                                ...p,
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
                        {task.updated_by && (
                          <div
                            style={{
                              fontSize: 10,
                              color: "#bbb",
                              marginTop: 4,
                            }}
                          >
                            ✎ {task.updated_by} · {timeAgo(task.updated_at)}
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

      {/* TASK DETAIL DRAWER */}
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
              padding: "12px 18px",
              borderBottom: "1px solid #ebebeb",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#fff",
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#aaa",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {activeSpace?.name}
                {activeFolder ? ` / ${activeFolder.name}` : ""}
              </div>
              {drawerTask.updated_by && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#bbb",
                    marginTop: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#22c55e",
                      display: "inline-block",
                    }}
                  />
                  Last saved by{" "}
                  <strong style={{ color: "#555" }}>
                    {drawerTask.updated_by}
                  </strong>{" "}
                  · {timeAgo(drawerTask.updated_at)}
                </div>
              )}
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
                flexShrink: 0,
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
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Drawer tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #ebebeb",
              background: "#fff",
              flexShrink: 0,
            }}
          >
            {[
              { key: "details", label: "Details" },
              { key: "history", label: "History" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setDrawerTab(tab.key);
                  if (tab.key === "history") fetchTaskHistory(drawerTask.id);
                }}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  fontSize: 12,
                  fontWeight: drawerTab === tab.key ? 600 : 400,
                  color: drawerTab === tab.key ? "#1d4ed8" : "#888",
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${drawerTab === tab.key ? "#1d4ed8" : "transparent"}`,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Drawer body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "#e0e0de transparent",
            }}
          >
            {/* DETAILS TAB */}
            {drawerTab === "details" && (
              <div style={{ padding: "20px 20px 28px" }}>
                <textarea
                  value={dTitle}
                  onChange={(e) =>
                    setDrawerEdits((p) => ({ ...p, title: e.target.value }))
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

                {[
                  {
                    label: "Status",
                    icon: "◎",
                    content: (
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
                        {drawerStatuses.map((s) => {
                          const sc = getStatusColor(s);
                          const isActive = dStatus === s;
                          return (
                            <button
                              key={s}
                              onClick={() =>
                                setDrawerEdits((p) => ({ ...p, status: s }))
                              }
                              style={{
                                padding: "4px 12px",
                                borderRadius: 20,
                                border: isActive
                                  ? "none"
                                  : "1.5px solid #e0e0e0",
                                background: isActive ? sc : "#fff",
                                color: isActive ? "#fff" : "#555",
                                fontSize: 12,
                                fontWeight: isActive ? 600 : 400,
                                cursor: "pointer",
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
                                setDrawerEdits((prev) => ({
                                  ...prev,
                                  priority: p,
                                }))
                              }
                              style={{
                                padding: "4px 12px",
                                borderRadius: 20,
                                border: isActive
                                  ? "none"
                                  : "1.5px solid #e0e0e0",
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
                                  setDrawerEdits((p) => ({
                                    ...p,
                                    assignees: (
                                      p.assignees ??
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
                              setDrawerEdits((p) => ({
                                ...p,
                                assignees: [
                                  ...(p.assignees ??
                                    drawerTask.assignees ??
                                    []),
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
                          setDrawerEdits((p) => ({
                            ...p,
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
                  {
                    label: "Date Done",
                    icon: "✅",
                    content: (
                      <input
                        type="date"
                        value={dDateDone}
                        onChange={(e) =>
                          setDrawerEdits((p) => ({
                            ...p,
                            date_done: e.target.value,
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
                  {
                    label: "Date Closed",
                    icon: "🔒",
                    content: (
                      <input
                        type="date"
                        value={dDateClosed}
                        onChange={(e) =>
                          setDrawerEdits((p) => ({
                            ...p,
                            date_closed: e.target.value,
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
                  {
                    label: "Date Updated",
                    icon: "🔄",
                    content: (
                      <input
                        type="date"
                        value={dDateUpdatedManual}
                        onChange={(e) =>
                          setDrawerEdits((p) => ({
                            ...p,
                            date_updated_manual: e.target.value,
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
                          {field.field_type === "formula" ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#7c3aed",
                                  background: "#faf5ff",
                                  border: "1px solid #e9d5ff",
                                  borderRadius: 7,
                                  padding: "5px 12px",
                                }}
                              >
                                ƒ {computeFormula(field, drawerTask)}
                              </span>
                              <span style={{ fontSize: 11, color: "#aaa" }}>
                                {
                                  FORMULA_PRESETS.find(
                                    (p) =>
                                      p.key ===
                                      (field.field_options?.[0] ||
                                        "days_since_created"),
                                  )?.label
                                }
                              </span>
                            </div>
                          ) : field.field_type === "username" ? (
                            <div>
                              <input
                                list={`members-list-${field.id}`}
                                placeholder="Select or type a name..."
                                value={val}
                                onChange={(e) =>
                                  setDrawerFieldValues((p) => ({
                                    ...p,
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
                              <datalist id={`members-list-${field.id}`}>
                                {members.map((m) => (
                                  <option key={m.id} value={m.full_name} />
                                ))}
                              </datalist>
                            </div>
                          ) : field.field_type === "dropdown" &&
                            field.field_options?.length > 0 ? (
                            <select
                              value={val}
                              onChange={(e) =>
                                setDrawerFieldValues((p) => ({
                                  ...p,
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
                              <option value="">
                                Select {field.field_name}...
                              </option>
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
                                setDrawerFieldValues((p) => ({
                                  ...p,
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
                      setDrawerEdits((p) => ({
                        ...p,
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
            )}

            {/* HISTORY TAB */}
            {drawerTab === "history" && (
              <div style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>
                  Showing last 50 changes to this task
                </div>
                {historyLoading ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#aaa",
                      textAlign: "center",
                      padding: "24px 0",
                    }}
                  >
                    Loading history...
                  </div>
                ) : taskHistory.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 13, color: "#aaa" }}>
                      No history yet
                    </div>
                    <div style={{ fontSize: 12, color: "#ccc", marginTop: 4 }}>
                      Changes will appear here after saving
                    </div>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    {/* Timeline line */}
                    <div
                      style={{
                        position: "absolute",
                        left: 15,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        background: "#e8e8e8",
                        borderRadius: 2,
                      }}
                    />
                    {taskHistory.map((entry, idx) => (
                      <div
                        key={entry.id}
                        style={{
                          display: "flex",
                          gap: 12,
                          marginBottom: 20,
                          position: "relative",
                        }}
                      >
                        {/* Timeline dot */}
                        <div
                          style={{
                            width: 30,
                            flexShrink: 0,
                            display: "flex",
                            justifyContent: "center",
                            paddingTop: 2,
                          }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: entry.changes?.created
                                ? "#22c55e"
                                : "#1d4ed8",
                              border: "2px solid #fff",
                              boxShadow: "0 0 0 2px #e8e8e8",
                              flexShrink: 0,
                            }}
                          />
                        </div>
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            <div
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: "#1d4ed8",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {(entry.changed_by || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#1a1a1a",
                              }}
                            >
                              {entry.changed_by}
                            </span>
                            <span style={{ fontSize: 11, color: "#aaa" }}>
                              ·
                            </span>
                            <span
                              style={{ fontSize: 11, color: "#aaa" }}
                              title={formatFullDate(entry.changed_at)}
                            >
                              {timeAgo(entry.changed_at)}
                            </span>
                          </div>
                          <div
                            style={{
                              background: "#f9f9f9",
                              borderRadius: 8,
                              padding: "8px 12px",
                              border: "1px solid #e8e8e8",
                            }}
                          >
                            {Object.entries(entry.changes || {}).map(
                              ([field, change]) => (
                                <div
                                  key={field}
                                  style={{
                                    fontSize: 12,
                                    color: "#444",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 6,
                                    marginBottom: 3,
                                  }}
                                >
                                  <span
                                    style={{
                                      color:
                                        field === "created"
                                          ? "#22c55e"
                                          : "#1d4ed8",
                                      fontWeight: 700,
                                      fontSize: 11,
                                      flexShrink: 0,
                                      marginTop: 1,
                                    }}
                                  >
                                    {field === "created" ? "✦" : "→"}
                                  </span>
                                  <span>{changeLabel(field, change)}</span>
                                </div>
                              ),
                            )}
                          </div>
                          {entry.changed_at && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#ccc",
                                marginTop: 3,
                              }}
                            >
                              {formatFullDate(entry.changed_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW TASK MODAL */}
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
                  setNewTask((p) => ({ ...p, title: e.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                placeholder="Add details..."
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((p) => ({ ...p, description: e.target.value }))
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
                    setNewTask((p) => ({
                      ...p,
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
                    setNewTask((p) => ({ ...p, folder_id: e.target.value }))
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
                    setNewTask((p) => ({ ...p, status: e.target.value }))
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
                    setNewTask((p) => ({ ...p, priority: e.target.value }))
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
                            setNewTask((p) => ({
                              ...p,
                              assignees: p.assignees.filter((a) => a !== name),
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
                        setNewTask((p) => ({
                          ...p,
                          assignees: [...p.assignees, name],
                          assignee_id: p.assignee_id || member?.id || "",
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
                    setNewTask((p) => ({ ...p, due_date: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date Done</label>
                <input
                  type="date"
                  value={newTask.date_done}
                  onChange={(e) =>
                    setNewTask((p) => ({ ...p, date_done: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date Closed</label>
                <input
                  type="date"
                  value={newTask.date_closed}
                  onChange={(e) =>
                    setNewTask((p) => ({ ...p, date_closed: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date Updated</label>
                <input
                  type="date"
                  value={newTask.date_updated_manual}
                  onChange={(e) =>
                    setNewTask((p) => ({
                      ...p,
                      date_updated_manual: e.target.value,
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
                      {field.field_type === "formula" ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#7c3aed",
                            background: "#faf5ff",
                            border: "1px solid #e9d5ff",
                            borderRadius: 7,
                            padding: "6px 10px",
                          }}
                        >
                          ƒ Auto-computed —{" "}
                          {FORMULA_PRESETS.find(
                            (p) =>
                              p.key ===
                              (field.field_options?.[0] ||
                                "days_since_created"),
                          )?.label || "formula"}
                        </div>
                      ) : field.field_type === "username" ? (
                        <div>
                          <input
                            list={`members-list-new-${field.id}`}
                            placeholder="Select or type a name..."
                            value={taskFieldValues[field.id] || ""}
                            onChange={(e) =>
                              setTaskFieldValues((p) => ({
                                ...p,
                                [field.id]: e.target.value,
                              }))
                            }
                          />
                          <datalist id={`members-list-new-${field.id}`}>
                            {members.map((m) => (
                              <option key={m.id} value={m.full_name} />
                            ))}
                          </datalist>
                        </div>
                      ) : field.field_type === "dropdown" &&
                        field.field_options?.length > 0 ? (
                        <select
                          value={taskFieldValues[field.id] || ""}
                          onChange={(e) =>
                            setTaskFieldValues((p) => ({
                              ...p,
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
                            setTaskFieldValues((p) => ({
                              ...p,
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
          <div className="modal" style={{ maxWidth: 480 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div className="modal-title" style={{ margin: 0 }}>
                Custom fields
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setShowFieldModal(false)}
              >
                ✕
              </button>
            </div>
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
              <div style={{ marginBottom: 18 }}>
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
                      padding: "8px 12px",
                      background: "#f5f5f4",
                      borderRadius: 7,
                      marginBottom: 6,
                      border: "1px solid #e8e8e8",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>
                          {f.field_name}
                        </span>
                        {f.field_type === "dropdown" &&
                          editingFieldId !== f.id &&
                          f.field_options?.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 3,
                                marginTop: 4,
                              }}
                            >
                              {f.field_options.map((o) => (
                                <span
                                  key={o}
                                  style={{
                                    fontSize: 10,
                                    background: "#eff6ff",
                                    color: "#1d4ed8",
                                    borderRadius: 20,
                                    padding: "1px 7px",
                                  }}
                                >
                                  {o}
                                </span>
                              ))}
                            </div>
                          )}
                        {f.field_type === "formula" &&
                          f.field_options?.length > 0 && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#7c3aed",
                                marginTop: 2,
                              }}
                            >
                              ƒ{" "}
                              {FORMULA_PRESETS.find(
                                (p) => p.key === f.field_options[0],
                              )?.label || f.field_options[0]}
                            </div>
                          )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "#aaa",
                            background: "#fff",
                            border: "1px solid #e0e0e0",
                            borderRadius: 20,
                            padding: "1px 8px",
                          }}
                        >
                          {f.field_type}
                        </span>
                        {f.field_type === "dropdown" &&
                          editingFieldId !== f.id && (
                            <button
                              className="btn btn-sm"
                              style={{ padding: "2px 8px", fontSize: 11 }}
                              onClick={() => startEditFieldOptions(f)}
                            >
                              ✏️ Edit options
                            </button>
                          )}
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => deleteCustomField(f.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Inline dropdown options editor */}
                    {f.field_type === "dropdown" && editingFieldId === f.id && (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: "1px solid #e0e0e0",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#888",
                            marginBottom: 6,
                          }}
                        >
                          Edit options — one per line
                        </div>
                        <textarea
                          autoFocus
                          value={editingFieldOptions.join("\n")}
                          onChange={(e) =>
                            setEditingFieldOptions(e.target.value.split("\n"))
                          }
                          style={{
                            minHeight: 90,
                            resize: "vertical",
                            fontFamily: "inherit",
                            fontSize: 13,
                            width: "100%",
                            boxSizing: "border-box",
                          }}
                        />
                        {editingFieldOptions.filter((o) => o.trim()).length >
                          0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 4,
                              marginTop: 8,
                            }}
                          >
                            {editingFieldOptions
                              .filter((o) => o.trim())
                              .map((o, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: 11,
                                    background: "#eff6ff",
                                    color: "#1d4ed8",
                                    borderRadius: 20,
                                    padding: "2px 9px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {o.trim()}
                                </span>
                              ))}
                          </div>
                        )}
                        <div
                          style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}
                        >
                          Removing an option won't change existing tasks already
                          set to it — it just won't be selectable for new ones.
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button
                            className="btn btn-sm"
                            onClick={cancelEditFieldOptions}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => saveFieldOptions(f.id)}
                          >
                            Save options
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                background: "#f9f9f9",
                borderRadius: 10,
                padding: "14px 14px 10px",
                border: "1px solid #e8e8e8",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  marginBottom: 12,
                }}
              >
                Add new field
              </div>
              <div className="form-group">
                <label className="form-label">Field name</label>
                <input
                  autoFocus
                  placeholder="e.g. TRN, Domain, Created By, Days in Process"
                  value={newField.field_name}
                  onChange={(e) =>
                    setNewField((p) => ({ ...p, field_name: e.target.value }))
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    newField.field_type !== "dropdown" &&
                    newField.field_type !== "formula" &&
                    addCustomField()
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Field type</label>
                <select
                  value={newField.field_type}
                  onChange={(e) =>
                    setNewField((p) => ({
                      ...p,
                      field_type: e.target.value,
                      field_options: [],
                      formula_key: "days_since_created",
                      custom_formula: "",
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="url">URL</option>
                  <option value="username">Username</option>
                  <option value="dropdown">Dropdown — pick from options</option>
                  <option value="formula">Formula — auto computed</option>
                </select>
              </div>
              {newField.field_type === "dropdown" && (
                <div className="form-group">
                  <label className="form-label">
                    Dropdown options{" "}
                    <span
                      style={{ fontWeight: 400, color: "#aaa", marginLeft: 6 }}
                    >
                      — one per line
                    </span>
                  </label>
                  <textarea
                    placeholder={
                      "e.g.\nAccounting and Tax\nCT Filing\nVAT\nBusiness Set Up"
                    }
                    value={(newField.field_options || []).join("\n")}
                    onChange={(e) =>
                      setNewField((p) => ({
                        ...p,
                        field_options: e.target.value.split("\n"),
                      }))
                    }
                    style={{
                      minHeight: 100,
                      resize: "vertical",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  />
                  {(newField.field_options || []).filter((o) => o.trim())
                    .length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      {(newField.field_options || [])
                        .filter((o) => o.trim())
                        .map((o, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 11,
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: 20,
                              padding: "2px 9px",
                              fontWeight: 500,
                            }}
                          >
                            {o.trim()}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {newField.field_type === "formula" && (
                <div className="form-group">
                  <label className="form-label">Choose formula type</label>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {[
                      {
                        key: "days_since_created",
                        label: "Days since task created",
                        hint: "Auto-computed — e.g. shows '5 days', '12 days'",
                        example:
                          "Useful for tracking how long a task has been open",
                      },
                      {
                        key: "days_since_updated",
                        label: "Days since last updated",
                        hint: "Auto-computed — resets to 0 each time the task is saved",
                        example: "Useful for spotting stale tasks",
                      },
                      {
                        key: "days_until_due",
                        label: "Days until due date",
                        hint: "Auto-computed — e.g. '3 days left' or '2 days overdue'",
                        example: "Requires a due date to be set on the task",
                      },
                      {
                        key: "custom",
                        label: "Custom formula expression",
                        hint: "Write your own expression — stored and displayed as-is",
                        example:
                          "e.g. days_since(created_at), days_between(created_at, due_date)",
                      },
                    ].map((opt) => {
                      const isSelected =
                        (newField.formula_key || "days_since_created") ===
                        opt.key;
                      return (
                        <div
                          key={opt.key}
                          onClick={() =>
                            setNewField((p) => ({ ...p, formula_key: opt.key }))
                          }
                          style={{
                            padding: "10px 14px",
                            borderRadius: 8,
                            cursor: "pointer",
                            border: `1.5px solid ${isSelected ? "#1d4ed8" : "#e0e0e0"}`,
                            background: isSelected ? "#eff6ff" : "#fff",
                            transition: "all 0.12s",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                flexShrink: 0,
                                border: `2px solid ${isSelected ? "#1d4ed8" : "#ccc"}`,
                                background: isSelected ? "#1d4ed8" : "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {isSelected && (
                                <div
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: "#fff",
                                  }}
                                />
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#1a1a1a",
                              }}
                            >
                              {opt.label}
                            </div>
                          </div>
                          <div style={{ marginLeft: 26, marginTop: 3 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#7c3aed",
                                fontWeight: 500,
                              }}
                            >
                              {opt.hint}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#aaa",
                                marginTop: 1,
                              }}
                            >
                              {opt.example}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(newField.formula_key || "days_since_created") ===
                    "custom" && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        background: "#faf5ff",
                        borderRadius: 8,
                        border: "1px solid #e9d5ff",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#7c3aed",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: ".04em",
                        }}
                      >
                        Formula expression
                      </div>
                      <input
                        placeholder="e.g. days_since(created_at) or days_between(created_at, due_date)"
                        value={newField.custom_formula || ""}
                        onChange={(e) =>
                          setNewField((p) => ({
                            ...p,
                            custom_formula: e.target.value,
                          }))
                        }
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          background: "#fff",
                          borderColor: "#e9d5ff",
                        }}
                      />
                      <div
                        style={{
                          fontSize: 11,
                          color: "#aaa",
                          marginTop: 6,
                          lineHeight: 1.6,
                        }}
                      >
                        Supported:{" "}
                        <code
                          style={{
                            background: "#f0e7ff",
                            padding: "1px 5px",
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          days_since(created_at)
                        </code>{" "}
                        ·{" "}
                        <code
                          style={{
                            background: "#f0e7ff",
                            padding: "1px 5px",
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          days_between(created_at, due_date)
                        </code>{" "}
                        ·{" "}
                        <code
                          style={{
                            background: "#f0e7ff",
                            padding: "1px 5px",
                            borderRadius: 4,
                            fontSize: 11,
                          }}
                        >
                          days_until(due_date)
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => setShowFieldModal(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={addCustomField}
                disabled={
                  !newField.field_name.trim() ||
                  (newField.field_type === "dropdown" &&
                    !(newField.field_options || []).some((o) => o.trim()))
                }
                style={
                  fieldAddedFlash
                    ? { background: "#16a34a", transition: "background 0.2s" }
                    : { transition: "background 0.2s" }
                }
              >
                {fieldAddedFlash ? "Added ✓" : "Add field"}
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
                  setNewStatus((p) => ({ ...p, name: e.target.value }));
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
                    setNewStatus((p) => ({ ...p, color: e.target.value }))
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

      <style>{`@keyframes slideInRight { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}
