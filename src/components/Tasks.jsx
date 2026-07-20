import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabase";
import ImportTasks from "./ImportTasks";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

// ── Toolbar button for rich text editor ──
function TBBtn({ onClick, active, title, children }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      style={{
        padding: "3px 7px",
        borderRadius: 5,
        border: "none",
        background: active ? "#dbeafe" : "transparent",
        color: active ? "#1d4ed8" : "#555",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        minWidth: 26,
        lineHeight: 1.4,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f0f0ef"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

// Normalize stored description: plain text → HTML paragraph
function normalizeDesc(val) {
  if (!val) return "";
  if (val.trimStart().startsWith("<")) return val;
  return val.split("\n").map((l) => `<p>${l || "<br/>"}</p>`).join("");
}

// ── Rich text description editor ──
function TaskDescEditor({ value, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Add a description..." }),
    ],
    content: normalizeDesc(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const setLink = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  // Sync content when drawer opens a different task
  const prevValue = useRef(value);
  useEffect(() => {
    if (!editor) return;
    const norm = normalizeDesc(value);
    if (prevValue.current !== value) {
      prevValue.current = value;
      if (editor.getHTML() !== norm) {
        editor.commands.setContent(norm, false);
      }
    }
  }, [value, editor]);

  if (!editor) return null;

  const Div = () => <div style={{ width: 1, height: 16, background: "#e8e8e8", margin: "0 3px" }} />;

  return (
    <div style={{ border: "1.5px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}
      onFocus={(e) => e.currentTarget.style.borderColor = "#1d4ed8"}
      onBlur={(e) => e.currentTarget.style.borderColor = "#e0e0e0"}
    >
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 1, padding: "6px 8px", borderBottom: "1px solid #e8e8e8", background: "#fafaf9", alignItems: "center" }}>
        <TBBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><s>S</s></TBBtn>
        <Div />
        <TBBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">H1</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">H2</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">H3</TBBtn>
        <Div />
        <TBBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">• List</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">1. List</TBBtn>
        <Div />
        <TBBtn onClick={setLink} active={editor.isActive("link")} title="Link">🔗</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">{"<>"}</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">{"{ }"}</TBBtn>
        <Div />
        <TBBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">"</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="Undo">↩</TBBtn>
        <TBBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="Redo">↪</TBBtn>
      </div>
      {/* Content area */}
      <div style={{ padding: "12px 14px", minHeight: 120, background: "#fff", fontSize: 13, lineHeight: 1.7 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

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

function fmtDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toISOString().slice(0, 10);
}

function parseFlexibleDate(str) {
  if (!str) return null;
  // Strip ordinal suffixes: 26th → 26, 2nd → 2, 1st → 1, 3rd → 3
  const cleaned = str.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
  // Strip leading day name if present: "Thursday, February 26 2026" → "February 26 2026"
  const withoutDay = cleaned.replace(/^[A-Za-z]+,\s*/, "");
  const d = new Date(withoutDay);
  return isNaN(d) ? null : d;
}

// Returns a human-readable formula expression for a formula field, e.g.
// "TODAY() − [Pre-approved date]" so users see the actual computation.
function describeFormula(field) {
  if (field.field_type !== "formula") return "";
  const opts = field.field_options || [];
  const key = opts[0] || "days_since_created";
  switch (key) {
    case "days_since_created":
      return "TODAY() − Created Date";
    case "days_since_updated":
      return "TODAY() − Last Updated";
    case "days_until_due":
      return "Due Date − TODAY()";
    case "days_since_date_field": {
      const name = (opts[1] || "").trim();
      return name ? `TODAY() − [${name}]` : "TODAY() − [date field]";
    }
    case "custom":
      return (opts[1] || "").trim() || "(no formula)";
    default:
      return key;
  }
}

function computeFormula(field, task, allFields, lookupFields) {
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
  if (key === "days_since_date_field") {
    const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const target = norm(opts[1]);
    if (!target) return "—";
    // Duplicate field names can exist across scopes/imports, so match ALL
    // fields with this name and find the value stored against any of them.
    const pool = [...(allFields || []), ...(lookupFields || [])];
    const matchingIds = new Set(
      pool.filter((f) => norm(f.field_name) === target).map((f) => f.id),
    );
    if (matchingIds.size === 0) return `(field "${opts[1]}" not found)`;
    const fv = (task.task_field_values || []).find(
      (v) => matchingIds.has(v.field_id) && v.value,
    );
    if (!fv?.value) return "—";
    const d = parseFlexibleDate(fv.value);
    if (!d) return "—";
    const days = Math.floor((now - d) / 86400000);
    return `${days} day${days !== 1 ? "s" : ""}`;
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
  activeList,
  profile,
  onRefreshSpaces,
}) {
  const [tasks, setTasks] = useState([]);
  const [taskMeta, setTaskMeta] = useState({}); // { [taskId]: { attachmentCount, checklistChecked, checklistTotal } }
  const [descPopup, setDescPopup] = useState(null); // { taskId, x, y }
  const [viewMode, setViewMode] = useState("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSubtasks, setExpandedSubtasks] = useState({}); // taskId -> bool
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [statusMenu, setStatusMenu] = useState(null); // { taskId, statuses, x, y }
  const [assignMenu, setAssignMenu] = useState(null); // { taskId, x, y, current }
  const [assignSearch, setAssignSearch] = useState("");
  const [folderListCounts, setFolderListCounts] = useState({}); // listId -> exact count
  const [listStatusCounts, setListStatusCounts] = useState({}); // status -> exact count (active list)
  const [listCursor, setListCursor] = useState(null); // created_at of last loaded task
  const [listHasMore, setListHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadSentinelRef = useRef(null);
  const LIST_PAGE = 300;
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignSearch, setBulkAssignSearch] = useState("");
  // Filter tree: a group has { id, kind:"group", conj:"AND"|"OR", children:[] }
  // children are conditions { id, kind:"cond", field, op, value } or nested groups.
  const [filterTree, setFilterTree] = useState({ id: "root", kind: "group", conj: "AND", children: [] });
  const [draftTree, setDraftTree] = useState({ id: "root", kind: "group", conj: "AND", children: [] });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]); // [{ name, tree }]
  const [showSavedMenu, setShowSavedMenu] = useState(false);
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
  const DEFAULT_VISIBLE_COLUMNS = ["priority", "assignees", "due_date"];
  const DEFAULT_COLUMN_ORDER = [
    "priority", "assignees", "due_date", "date_done", "date_closed", "date_updated_manual",
  ];
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  // columnOrder defines the display sequence of ALL orderable columns (visible + hidden)
  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER);
  const [viewSaved, setViewSaved] = useState(false);
  const [viewDirty, setViewDirty] = useState(false); // unsaved column changes
  const [dragOverColKey, setDragOverColKey] = useState(null);
  const draggedColKey = useRef(null);
  const viewSaveTimer = useRef(null);
  const fetchToken = useRef(0); // guards against stale fetchTasks overwriting newer ones

  // Column widths in px — shared across every group's table so columns
  // always line up, and resizable by dragging the handle on each header.
  const DEFAULT_COLUMN_WIDTHS = { // eslint-disable-line no-unused-vars
    name: 320,
    status_inline: 130,
    priority: 130,
    assignees: 200,
    due_date: 150,
    date_done: 150,
    date_closed: 150,
    date_updated_manual: 150,
    status_select: 160,
    actions: 60,
  };
  const [columnWidths, setColumnWidths] = useState({ ...DEFAULT_COLUMN_WIDTHS });
  const resizingCol = useRef(null);

  function getColWidth(key) {
    return columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key] || 120;
  }

  const COLUMN_LABELS = {
    priority: "Priority",
    assignees: "Assignees",
    due_date: "Due date",
    date_done: "Date Done",
    date_closed: "Date Closed",
    date_updated_manual: "Date Updated",
  };

  // Single source of truth for which data columns are active and in what
  // order — respects columnOrder so users can reorder via drag or arrows.
  function getActiveColumns(fieldList) {
    const fieldKeys = fieldList.map((f) => `field_${f.id}`);
    // merge saved order with any new custom fields not yet tracked
    const fullOrder = [
      ...columnOrder,
      ...fieldKeys.filter((k) => !columnOrder.includes(k)),
    ];
    return fullOrder
      .filter((key) => visibleColumns.includes(key))
      .map((key) => {
        if (key.startsWith("field_")) {
          const f = fieldList.find((f) => `field_${f.id}` === key);
          if (!f) return null;
          return { key, label: f.field_name, sortable: true, field: f };
        }
        return { key, label: COLUMN_LABELS[key] || key, sortable: true };
      })
      .filter(Boolean);
  }

  function buildGridTemplate(fieldList, indented) {
    const activeCols = getActiveColumns(fieldList);
    const parts = [];
    parts.push(
      `${getColWidth("name")}px`,
      ...activeCols.map((c) => `${getColWidth(c.key)}px`),
      `${getColWidth("status_select")}px`,
      `${getColWidth("actions")}px`,
    );
    return parts.join(" ");
  }

  // ── View persistence helpers ──────────────────────────────────────────────

  function getCurrentScope() {
    if (activeList) return { scope_type: "list", scope_id: activeList.id };
    if (activeFolder) return { scope_type: "folder", scope_id: activeFolder.id };
    if (activeSpace) return { scope_type: "space", scope_id: activeSpace.id };
    return null;
  }

  async function fetchViewConfig() {
    const scope = getCurrentScope();
    if (!scope) return;
    const { data } = await supabase
      .from("task_list_views")
      .select("columns")
      .eq("scope_type", scope.scope_type)
      .eq("scope_id", scope.scope_id)
      .maybeSingle();
    if (!data?.columns) {
      // No saved view for this scope — reset to defaults so columns from
      // the previously-viewed scope don't carry over.
      setColumnOrder(DEFAULT_COLUMN_ORDER);
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
      setViewDirty(false);
      return;
    }
    setViewDirty(false);
    const saved = data.columns; // array of { key, visible, width }
    const order = saved.map((c) => c.key);
    const visible = saved.filter((c) => c.visible).map((c) => c.key);
    const widths = {};
    saved.forEach((c) => { if (c.width) widths[c.key] = c.width; });
    setColumnOrder(order.length ? order : DEFAULT_COLUMN_ORDER);
    setVisibleColumns(visible.length ? visible : DEFAULT_VISIBLE_COLUMNS);
    setColumnWidths((prev) => ({ ...prev, ...widths }));
  }

  // Column tweaks (reorder, toggle, resize) now only mark the view as having
  // unsaved changes — they no longer auto-persist. The shared view for this
  // scope changes only when someone clicks "Save view" (publishView).
  function saveViewConfig() {
    setViewDirty(true);
  }

  // Persist the current column layout as the shared view for this scope so
  // every user sees it (until someone saves a different one).
  async function publishView() {
    const scope = getCurrentScope();
    if (!scope) return;
    const columns = columnOrder.map((key) => ({
      key,
      visible: visibleColumns.includes(key),
      width: columnWidths[key] || null,
    }));
    const { error } = await supabase.from("task_list_views").upsert(
      { ...scope, columns, updated_at: new Date().toISOString() },
      { onConflict: "scope_type,scope_id" },
    );
    if (error) {
      alert("Could not save the view: " + (error.message || "permission denied"));
      return;
    }
    setViewDirty(false);
    setViewSaved(true);
    setTimeout(() => setViewSaved(false), 2000);
  }

  function moveColumnOrder(key, direction) {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      saveViewConfig(next, undefined, undefined);
      return next;
    });
  }

  function dropColumn(dragKey, overKey) {
    if (!dragKey || dragKey === overKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragKey);
      const insertAt = next.indexOf(overKey);
      next.splice(insertAt >= 0 ? insertAt : next.length, 0, dragKey);
      saveViewConfig(next, undefined, undefined);
      return next;
    });
    setDragOverColKey(null);
    draggedColKey.current = null;
  }

  // ─────────────────────────────────────────────────────────────────────────

  function persistColumnWidths(next) {
    setColumnWidths(next);
    saveViewConfig(undefined, undefined, next);
  }

  function startColumnResize(key, e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getColWidth(key);
    resizingCol.current = key;
    function onMove(ev) {
      const delta = ev.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [key]: newWidth }));
    }
    function onUp() {
      resizingCol.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setColumnWidths((prev) => {
        saveViewConfig(undefined, undefined, prev);
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Drawer
  const [drawerTask, setDrawerTask] = useState(null);
  const [drawerEdits, setDrawerEdits] = useState({});
  const [drawerFieldValues, setDrawerFieldValues] = useState({});
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerSaved, setDrawerSaved] = useState(false);
  const [drawerTab, setDrawerTab] = useState("details"); // "details" | "history" | "attachments" | "comments"
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [taskHistory, setTaskHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);
  // Lists (folder sub-lists)
  const [spaceLists, setSpaceLists] = useState([]); // all lists for the active space
  const [listFields, setListFields] = useState([]); // space_fields scoped to active list
  const [listStatuses, setListStatuses] = useState([]); // space_statuses scoped to active list
  const [allListStatuses, setAllListStatuses] = useState([]); // space_statuses for all lists in space

  useEffect(() => {
    if (!activeSpace) { setSpaceLists([]); return; }
    supabase.from("lists").select("*").eq("space_id", activeSpace.id).is("deleted_at", null).order("created_at")
      .then(({ data }) => setSpaceLists(data || []));
  }, [activeSpace]);

  useEffect(() => {
    if (!activeList) { setListFields([]); return; }
    supabase.from("space_fields").select("*").eq("list_id", activeList.id).order("field_order")
      .then(({ data }) => {
        const fields = data || [];
        setListFields(fields);
        // Ensure custom field keys are tracked in columnOrder so ↑↓ arrows work
        const fieldKeys = fields.map((f) => `field_${f.id}`);
        setColumnOrder((prev) => {
          const missing = fieldKeys.filter((k) => !prev.includes(k));
          return missing.length ? [...prev, ...missing] : prev;
        });
      });
  }, [activeList]);

  useEffect(() => {
    if (!activeList) { setListStatuses([]); return; }
    supabase.from("space_statuses").select("*").eq("list_id", activeList.id).order("status_order")
      .then(({ data }) => setListStatuses(data || []));
  }, [activeList]);

  // Fetch all list-scoped statuses for the space so folder-level can merge them
  useEffect(() => {
    if (!activeSpace) { setAllListStatuses([]); return; }
    supabase.from("space_statuses").select("*").eq("space_id", activeSpace.id).not("list_id", "is", null).order("status_order")
      .then(({ data }) => setAllListStatuses(data || []));
  }, [activeSpace]);

  // Checklists
  const [checklists, setChecklists] = useState([]);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [newChecklistName, setNewChecklistName] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemText, setNewItemText] = useState({}); // { checklistId: text }
  const [editingChecklistName, setEditingChecklistName] = useState(null); // checklistId
  const [editingChecklistNameVal, setEditingChecklistNameVal] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemVal, setEditingItemVal] = useState("");
  const [itemMenuOpen, setItemMenuOpen] = useState(null); // item.id
  const [itemMenuPos, setItemMenuPos] = useState({ top: 0, left: 0 });
  const [clMenuOpen, setClMenuOpen] = useState(null); // checklist id
  const [clMenuPos, setClMenuPos] = useState({ top: 0, left: 0 });
  const drawerRef = useRef(null);

  // ── Wiki Docs tab ──
  const [linkedDocs, setLinkedDocs] = useState([]);
  const [linkedDocsLoading, setLinkedDocsLoading] = useState(false);
  const [allWikiArticles, setAllWikiArticles] = useState([]);
  const [allWikiCategories, setAllWikiCategories] = useState([]);
  const [docSearch, setDocSearch] = useState("");
  const [showDocPicker, setShowDocPicker] = useState(false);

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
  const [showExportModal, setShowExportModal] = useState(false);
  const [modalSpaceStatuses, setModalSpaceStatuses] = useState([]);
  const [statusActionMsg, setStatusActionMsg] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editingStatusData, setEditingStatusData] = useState({ name: "", color: "#378ADD" });

  function updateVisibleColumns(cols) {
    setVisibleColumns(cols);
    saveViewConfig(undefined, cols, undefined);
  }

  useEffect(() => {
    if (!activeSpace) return; // wait until space context is restored after refresh
    fetchTasks();
    fetchViewConfig();
  }, [activeSpace, activeFolder, activeList]);
  useEffect(() => {
    fetchMembers();
  }, []);
  useEffect(() => {
    if (activeSpace) setNewTask((p) => ({ ...p, space_id: activeSpace.id }));
  }, [activeSpace]);
  // Merge space-level field keys into columnOrder so ↑↓ arrows work before any drag-drop
  useEffect(() => {
    const fields = activeSpace?.space_fields || [];
    if (!fields.length) return;
    const fieldKeys = fields.map((f) => `field_${f.id}`);
    setColumnOrder((prev) => {
      const missing = fieldKeys.filter((k) => !prev.includes(k));
      return missing.length ? [...prev, ...missing] : prev;
    });
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
      if (showFilterPanel && !e.target.closest(".filter-panel-wrap"))
        setShowFilterPanel(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showFilterPanel]);
  // Infinite scroll: load more list rows when the bottom sentinel is visible.
  useEffect(() => {
    const el = loadSentinelRef.current;
    if (!el || !activeList || !listHasMore) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreListTasks(); },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeList, listHasMore, loadingMore, listCursor]);
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
    const token = ++fetchToken.current;
    // Folder overview can hold thousands of tasks across its lists — a single
    // query hits Supabase's row/payload cap and returns nothing. Fetch each
    // list separately (each under the cap) and merge so rows show for all lists.
    if (activeFolder && !activeList) {
      // Query the folder's lists fresh (no dependency on spaceLists timing).
      const { data: fLists } = await supabase.from("lists").select("id")
        .eq("folder_id", activeFolder.id).is("deleted_at", null);
      const folderListIds = (fLists || []).map((l) => l.id);
      const counts = {};
      const perList = await Promise.all(
        folderListIds.map(async (id) => {
          const [{ data }, { count }] = await Promise.all([
            supabase.from("tasks").select("*, task_field_values(*)").is("deleted_at", null)
              .eq("list_id", id).order("created_at", { ascending: false }).limit(1000),
            supabase.from("tasks").select("id", { count: "exact", head: true })
              .is("deleted_at", null).eq("list_id", id).is("parent_task_id", null),
          ]);
          counts[id] = count || 0;
          return data || [];
        }),
      );
      const { data: noList } = await supabase.from("tasks").select("*, task_field_values(*)")
        .is("deleted_at", null).eq("folder_id", activeFolder.id).is("list_id", null)
        .order("created_at", { ascending: false }).limit(1000);
      if (fetchToken.current !== token) return; // a newer fetch superseded this
      setFolderListCounts(counts);
      const merged = [...perList.flat(), ...(noList || [])];
      setTasks(merged);
      if (drawerTask) {
        const u = merged.find((t) => t.id === drawerTask.id);
        if (u) setDrawerTask(u);
      }
      fetchTaskMeta(merged.map((t) => t.id));
      return;
    }
    // List view: try a small first page (infinite scroll). If the bounded
    // query fails/returns nothing (some large lists time out on
    // ordered+limited joins), fall back to the plain fetch so rows show.
    if (activeList) {
      let { data } = await supabase
        .from("tasks").select("*, task_field_values(*)").is("deleted_at", null)
        .eq("list_id", activeList.id).order("created_at", { ascending: false })
        .limit(LIST_PAGE);
      let rows = data || [];
      if (rows.length === 0) {
        const { data: d2 } = await supabase
          .from("tasks").select("*, task_field_values(*)").is("deleted_at", null)
          .eq("list_id", activeList.id).order("created_at", { ascending: false });
        rows = d2 || [];
        setListHasMore(false);       // paging unreliable here; show what loaded
        setListCursor(null);
      } else {
        setListCursor(rows[rows.length - 1].created_at);
        setListHasMore(rows.length === LIST_PAGE);
      }
      if (fetchToken.current !== token) return; // a newer fetch superseded this
      setTasks(rows);
      if (drawerTask) {
        const u = rows.find((t) => t.id === drawerTask.id);
        if (u) setDrawerTask(u);
      }
      fetchTaskMeta(rows.map((t) => t.id));
      fetchListStatusCounts();
      return;
    }
    let q = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (activeSpace) q = q.eq("space_id", activeSpace.id);
    const { data } = await q;
    if (fetchToken.current !== token) return; // a newer fetch superseded this
    if (data) {
      setTasks(data);
      if (drawerTask) {
        const u = data.find((t) => t.id === drawerTask.id);
        if (u) setDrawerTask(u);
      }
      fetchTaskMeta(data.map((t) => t.id));
    }
  }

  // Load the next page of the active list (cursor by created_at) and append.
  async function loadMoreListTasks() {
    if (!activeList || !listHasMore || loadingMore || !listCursor) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from("tasks").select("*, task_field_values(*)").is("deleted_at", null)
      .eq("list_id", activeList.id).lt("created_at", listCursor)
      .order("created_at", { ascending: false }).limit(LIST_PAGE);
    const rows = data || [];
    if (rows.length) {
      setTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...rows.filter((t) => !seen.has(t.id))];
      });
      setListCursor(rows[rows.length - 1].created_at);
      fetchTaskMeta(rows.map((t) => t.id));
    }
    setListHasMore(rows.length === LIST_PAGE);
    setLoadingMore(false);
  }

  async function fetchListStatusCounts() {
    if (!activeList) { setListStatusCounts({}); return; }
    const statuses = getStatusesForList(activeList.id);
    const counts = {};
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true })
          .is("deleted_at", null).eq("list_id", activeList.id).is("parent_task_id", null).eq("status", s);
        counts[s] = count || 0;
      }),
    );
    setListStatusCounts(counts);
  }

  async function fetchTaskMeta(taskIds) {
    if (!taskIds.length) return;
    const [{ data: attData }, { data: clData }, { data: clItemData }] = await Promise.all([
      supabase.from("task_attachments").select("task_id").in("task_id", taskIds),
      supabase.from("task_checklists").select("id, task_id").in("task_id", taskIds),
      supabase.from("task_checklist_items").select("checklist_id, is_checked"),
    ]);
    const meta = {};
    (attData || []).forEach(({ task_id }) => {
      if (!meta[task_id]) meta[task_id] = { attachmentCount: 0, checklistChecked: 0, checklistTotal: 0 };
      meta[task_id].attachmentCount = (meta[task_id].attachmentCount || 0) + 1;
    });
    const clMap = {}; // checklist_id -> task_id
    (clData || []).forEach(({ id, task_id }) => { clMap[id] = task_id; });
    (clItemData || []).forEach(({ checklist_id, is_checked }) => {
      const task_id = clMap[checklist_id];
      if (!task_id) return;
      if (!meta[task_id]) meta[task_id] = { attachmentCount: 0, checklistChecked: 0, checklistTotal: 0 };
      meta[task_id].checklistTotal = (meta[task_id].checklistTotal || 0) + 1;
      if (is_checked) meta[task_id].checklistChecked = (meta[task_id].checklistChecked || 0) + 1;
    });
    setTaskMeta(meta);
  }

  // ── Export tasks to CSV ──
  // Mirrors the columns the CSV import understands, so a file exported
  // here can be re-imported (or imported into another folder) without
  // needing to remap anything.
  function csvEscape(val) {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function exportTasksToCSV(currentViewOnly = false) {
    const fieldList = getFields();
    const exportTasks = filteredTasks;

    const BUILTIN_ALL = [
      { key: "title",               label: "Task Name" },
      { key: "status",              label: "Status" },
      { key: "priority",            label: "Priority" },
      { key: "assignees",           label: "Assignee" },
      { key: "due_date",            label: "Due Date" },
      { key: "created_at",          label: "Date Created" },
      { key: "date_done",           label: "Date Done" },
      { key: "date_closed",         label: "Date Closed" },
      { key: "date_updated_manual", label: "Date Updated" },
      { key: "description",         label: "Description" },
    ];

    // Visible built-in keys (from the column picker mapping)
    const VISIBLE_BUILTIN_MAP = {
      priority:             "Priority",
      assignees:            "Assignee",
      due_date:             "Due Date",
      date_done:            "Date Done",
      date_closed:          "Date Closed",
      date_updated_manual:  "Date Updated",
    };
    let builtins, fields;
    if (currentViewOnly) {
      // Current view = Task Name + Status + only the visible toggleable columns
      // (Date Created / Description are NOT forced in).
      const toggleableInOrder = columnOrder.filter((k) => VISIBLE_BUILTIN_MAP[k] && visibleColumns.includes(k));
      builtins = [
        BUILTIN_ALL.find((c) => c.key === "title"),
        BUILTIN_ALL.find((c) => c.key === "status"),
        ...toggleableInOrder.map((k) => ({ key: k, label: VISIBLE_BUILTIN_MAP[k] })),
      ];
      // custom fields in columnOrder sequence, only visible ones
      const orderedFieldIds = columnOrder
        .filter((k) => k.startsWith("field_") && visibleColumns.includes(k))
        .map((k) => k.replace("field_", ""));
      fields = orderedFieldIds.map((id) => fieldList.find((f) => f.id === id)).filter(Boolean);
    } else {
      builtins = BUILTIN_ALL;
      fields = fieldList;
    }

    const headers = [...builtins.map((c) => c.label), ...fields.map((f) => f.field_name)];

    const rows = exportTasks.map((task) => {
      const assigneeStr = (
        task.assignees?.length > 0 ? task.assignees : task.assignee ? [task.assignee] : []
      ).join(", ");

      const builtinValues = builtins.map((c) => {
        if (c.key === "title")               return task.title || "";
        if (c.key === "status")              return task.status || "";
        if (c.key === "priority")            return task.priority || "";
        if (c.key === "assignees")           return assigneeStr;
        if (c.key === "due_date")            return task.due_date || "";
        if (c.key === "created_at")          return task.created_at ? task.created_at.split("T")[0] : "";
        if (c.key === "date_done")           return task.date_done || "";
        if (c.key === "date_closed")         return task.date_closed || "";
        if (c.key === "date_updated_manual") return task.date_updated_manual || "";
        if (c.key === "description")         return task.description || "";
        return "";
      });

      const customValues = fields.map((f) => {
        if (f.field_type === "formula") return computeFormula(f, task, fieldList, activeSpace?.space_fields) || "";
        const fv = task.task_field_values?.find((v) => v.field_id === f.id);
        return fv?.value || "";
      });

      return [...builtinValues, ...customValues];
    });

    const csvLines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
    // Prepend a UTF-8 BOM so Excel decodes special characters (—, é, etc.)
    // correctly instead of mangling them (e.g. "—" -> ",Äî").
    const blob = new Blob(["﻿" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const scopeName = activeList?.name || activeFolder?.name || activeSpace?.name || "tasks";
    const dateStr = new Date().toISOString().split("T")[0];
    const suffix = currentViewOnly ? "_view" : "_all";
    link.href = url;
    link.download = `${scopeName.replace(/[^a-z0-9]+/gi, "_")}_export${suffix}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // ── Attachment helpers ──
  async function fetchAttachments(taskId) {
    setAttachmentsLoading(true);
    const { data } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("uploaded_at", { ascending: false });
    setAttachments(data || []);
    setAttachmentsLoading(false);
  }

  async function uploadAttachment(file) {
    if (!drawerTask || !file) return;
    setUploadingFile(true);
    const path = `${drawerTask.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(path, file, { upsert: false });
    if (uploadError) {
      alert(
        `Upload failed: ${uploadError.message}\n\nMake sure:\n1. The "task-attachments" storage bucket exists in Supabase\n2. The storage bucket has a policy allowing authenticated uploads`,
      );
      setUploadingFile(false);
      return;
    }
    const { error: insertError } = await supabase
      .from("task_attachments")
      .insert({
        task_id: drawerTask.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: path,
        uploaded_by: profile?.full_name || "Unknown",
      });
    if (insertError) {
      alert(
        `Database error: ${insertError.message}\n\nMake sure the task_attachments table exists and has RLS enabled with the correct policy.`,
      );
      // Clean up the uploaded file since DB insert failed
      await supabase.storage.from("task-attachments").remove([path]);
      setUploadingFile(false);
      return;
    }
    await fetchAttachments(drawerTask.id);
    fetchTaskMeta([drawerTask.id]);
    setUploadingFile(false);
  }

  async function downloadAttachment(attachment) {
    const { data, error } = await supabase.storage
      .from("task-attachments")
      .download(attachment.storage_path);
    if (error || !data) {
      console.error("Download error:", error);
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function deleteAttachment(attachment) {
    if (!confirm(`Delete "${attachment.file_name}"?`)) return;
    await supabase.storage
      .from("task-attachments")
      .remove([attachment.storage_path]);
    await supabase.from("task_attachments").delete().eq("id", attachment.id);
    await fetchAttachments(drawerTask.id);
    fetchTaskMeta([drawerTask.id]);
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileIcon(type) {
    if (!type) return "📎";
    if (type.startsWith("image/")) return "🖼";
    if (type === "application/pdf") return "📄";
    if (type.includes("word") || type.includes("document")) return "📝";
    if (
      type.includes("sheet") ||
      type.includes("excel") ||
      type.includes("csv")
    )
      return "📊";
    if (type.includes("zip") || type.includes("compressed")) return "🗜";
    return "📎";
  }

  // ── Checklist helpers ──
  async function fetchComments(taskId) {
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from("task_comments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) console.error("fetchComments error:", error);
    setComments(data || []);
    setCommentsLoading(false);
  }

  async function submitComment() {
    if (!commentText.trim() || !drawerTask) return;
    setCommentSubmitting(true);
    const { error } = await supabase.from("task_comments").insert({
      task_id: drawerTask.id,
      profile_id: profile?.id,
      content: commentText.trim(),
    });
    if (error) {
      console.error("submitComment error:", error);
      setCommentSubmitting(false);
      return;
    }
    setCommentText("");
    await fetchComments(drawerTask.id);
    setCommentSubmitting(false);
  }

  async function deleteComment(commentId) {
    await supabase.from("task_comments").delete().eq("id", commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  async function saveEditComment(commentId) {
    if (!editingCommentText.trim()) return;
    await supabase.from("task_comments").update({ content: editingCommentText.trim(), updated_at: new Date().toISOString() }).eq("id", commentId);
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, content: editingCommentText.trim() } : c));
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  async function fetchChecklists(taskId) {
    setChecklistsLoading(true);
    const { data: lists } = await supabase
      .from("task_checklists")
      .select("*")
      .eq("task_id", taskId)
      .order("list_order");
    if (!lists) {
      setChecklistsLoading(false);
      return;
    }
    const { data: items } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", taskId)
      .order("item_order");
    const merged = lists.map((l) => ({
      ...l,
      items: (items || []).filter((i) => i.checklist_id === l.id),
    }));
    setChecklists(merged);
    setChecklistsLoading(false);
  }

  async function fetchLinkedDocs(taskId) {
    setLinkedDocsLoading(true);
    const { data } = await supabase
      .from("task_wiki_links")
      .select("id, article_id, wiki_articles(id, title, category_id, wiki_categories(name))")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    setLinkedDocs(data || []);
    setLinkedDocsLoading(false);
  }

  async function fetchAllWikiArticles() {
    if (allWikiArticles.length) return; // already loaded
    const [{ data: cats }, { data: arts }] = await Promise.all([
      supabase.from("wiki_categories").select("id, name").is("deleted_at", null).order("category_order"),
      supabase.from("wiki_articles").select("id, title, category_id").is("deleted_at", null).order("title"),
    ]);
    setAllWikiCategories(cats || []);
    setAllWikiArticles(arts || []);
  }

  async function linkDocToTask(article) {
    if (!drawerTask) return;
    const already = linkedDocs.find((l) => l.article_id === article.id);
    if (already) return;
    const { data } = await supabase
      .from("task_wiki_links")
      .insert({ task_id: drawerTask.id, article_id: article.id })
      .select("id, article_id, wiki_articles(id, title, category_id, wiki_categories(name))")
      .single();
    if (data) setLinkedDocs((prev) => [...prev, data]);
    setShowDocPicker(false);
    setDocSearch("");
  }

  async function unlinkDoc(linkId) {
    await supabase.from("task_wiki_links").delete().eq("id", linkId);
    setLinkedDocs((prev) => prev.filter((l) => l.id !== linkId));
  }

  async function addChecklist(taskId) {
    const name = newChecklistName.trim() || "Checklist";
    const { data } = await supabase
      .from("task_checklists")
      .insert({ task_id: taskId, name, list_order: checklists.length })
      .select()
      .single();
    if (data) {
      setChecklists((prev) => [...prev, { ...data, items: [] }]);
      setNewChecklistName("");
      setAddingChecklist(false);
      fetchTaskMeta([taskId]);
    }
  }

  async function renameChecklist(checklistId, name) {
    await supabase
      .from("task_checklists")
      .update({ name })
      .eq("id", checklistId);
    setChecklists((prev) =>
      prev.map((c) => (c.id === checklistId ? { ...c, name } : c)),
    );
    setEditingChecklistName(null);
  }

  async function deleteChecklist(checklistId) {
    if (!confirm("Delete this checklist and all its items?")) return;
    await supabase.from("task_checklists").delete().eq("id", checklistId);
    setChecklists((prev) => prev.filter((c) => c.id !== checklistId));
    if (drawerTask) fetchTaskMeta([drawerTask.id]);
  }

  async function checkAllItems(checklistId, checked) {
    const cl = checklists.find((c) => c.id === checklistId);
    if (!cl) return;
    const ids = cl.items.map((i) => i.id);
    await supabase.from("task_checklist_items").update({ is_checked: checked }).in("id", ids);
    setChecklists((prev) =>
      prev.map((c) =>
        c.id === checklistId
          ? { ...c, items: c.items.map((i) => ({ ...i, is_checked: checked })) }
          : c,
      ),
    );
    if (drawerTask) fetchTaskMeta([drawerTask.id]);
  }

  async function addChecklistItem(checklistId, taskId) {
    const text = (newItemText[checklistId] || "").trim();
    if (!text) return;
    const checklist = checklists.find((c) => c.id === checklistId);
    const { data } = await supabase
      .from("task_checklist_items")
      .insert({
        checklist_id: checklistId,
        task_id: taskId,
        title: text,
        is_checked: false,
        item_order: checklist?.items?.length || 0,
      })
      .select()
      .single();
    if (data) {
      setChecklists((prev) =>
        prev.map((c) =>
          c.id === checklistId ? { ...c, items: [...c.items, data] } : c,
        ),
      );
      setNewItemText((prev) => ({ ...prev, [checklistId]: "" }));
      if (drawerTask) fetchTaskMeta([drawerTask.id]);
    }
  }

  async function toggleChecklistItem(item) {
    const newVal = !item.is_checked;
    await supabase
      .from("task_checklist_items")
      .update({ is_checked: newVal })
      .eq("id", item.id);
    setChecklists((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((i) =>
          i.id === item.id ? { ...i, is_checked: newVal } : i,
        ),
      })),
    );
    if (drawerTask) fetchTaskMeta([drawerTask.id]);
  }

  async function deleteChecklistItem(item) {
    await supabase.from("task_checklist_items").delete().eq("id", item.id);
    setChecklists((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.filter((i) => i.id !== item.id),
      })),
    );
    if (drawerTask) fetchTaskMeta([drawerTask.id]);
  }

  async function renameChecklistItem(item, newTitle) {
    const title = newTitle.trim();
    if (!title || title === item.title) { setEditingItemId(null); return; }
    await supabase.from("task_checklist_items").update({ title }).eq("id", item.id);
    setChecklists((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((i) => i.id === item.id ? { ...i, title } : i),
      })),
    );
    setEditingItemId(null);
  }

  function checklistProgress(checklist) {
    const total = checklist.items.length;
    const done = checklist.items.filter((i) => i.is_checked).length;
    return {
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }

  function totalChecklistProgress(taskChecklists) {
    const total = taskChecklists.reduce((s, c) => s + c.items.length, 0);
    const done = taskChecklists.reduce(
      (s, c) => s + c.items.filter((i) => i.is_checked).length,
      0,
    );
    return { total, done };
  }

  // Status helpers
  function getStatuses() {
    if (activeList) {
      if (listStatuses.length > 0) return listStatuses.map((s) => s.name);
      // fall through to folder/space statuses
    }
    if (activeFolder) {
      // Folder level: merge all list statuses for lists in this folder + folder-scoped statuses
      return getMergedFolderStatuses(activeFolder.id);
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

  // Returns merged unique status names for all lists inside a folder + folder-scoped statuses
  function getMergedFolderStatuses(folderId) {
    const folderListIds = new Set(
      spaceLists.filter((l) => l.folder_id === folderId).map((l) => l.id)
    );
    const seen = new Set();
    const merged = [];
    // List-scoped statuses for all lists in this folder
    allListStatuses
      .filter((s) => folderListIds.has(s.list_id))
      .sort((a, b) => a.status_order - b.status_order)
      .forEach((s) => {
        if (!seen.has(s.name)) { seen.add(s.name); merged.push(s.name); }
      });
    // Folder-scoped statuses
    (activeSpace?.space_statuses || [])
      .filter((s) => s.folder_id === folderId && !s.list_id)
      .sort((a, b) => a.status_order - b.status_order)
      .forEach((s) => {
        if (!seen.has(s.name)) { seen.add(s.name); merged.push(s.name); }
      });
    if (merged.length > 0) return merged;
    // Fall back to space-level statuses
    const sl = (activeSpace?.space_statuses || [])
      .filter((s) => !s.folder_id && !s.list_id)
      .sort((a, b) => a.status_order - b.status_order);
    if (sl.length > 0) return sl.map((s) => s.name);
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  // Returns status names for a specific list (isolated)
  function getStatusesForList(listId) {
    const ls = allListStatuses
      .filter((s) => s.list_id === listId)
      .sort((a, b) => a.status_order - b.status_order);
    if (ls.length > 0) return ls.map((s) => s.name);
    // Fall back to parent folder/space statuses
    const list = spaceLists.find((l) => l.id === listId);
    if (list?.folder_id) return getMergedFolderStatuses(list.folder_id);
    return ["To Do", "In Progress", "In Review", "Done"];
  }

  function getFolderStatuses(folder) {
    return getMergedFolderStatuses(folder.id);
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
  function applyFieldOverrides(fields, scopeSpaceId, scopeFolderId, scopeListId) {
    // Start with prop fields, apply option overrides, drop locally-deleted ones
    let result = fields
      .filter((f) => !locallyDeletedFieldIds.includes(f.id))
      .map((f) =>
        fieldOptionsOverride[f.id] !== undefined
          ? { ...f, field_options: fieldOptionsOverride[f.id] }
          : f,
      );
    // Merge in any fields added locally that the parent prop doesn't have yet,
    // scoped correctly so a field added in one list doesn't leak into siblings.
    const existingIds = new Set(result.map((f) => f.id));
    const extras = locallyAddedFields.filter((f) => {
      if (existingIds.has(f.id) || locallyDeletedFieldIds.includes(f.id)) return false;
      if (f.space_id !== scopeSpaceId) return false;
      if (scopeListId != null) return f.list_id === scopeListId; // list view: only this list's fields
      // folder/space view: folder-scoped, or any list field within scope
      return (f.folder_id || null) === (scopeFolderId || null) || f.list_id != null;
    });
    if (extras.length > 0) result = [...result, ...extras];
    return result;
  }
  function getFields() {
    if (activeList) {
      // List-scoped fields only — never fall through to folder/sibling fields
      return applyFieldOverrides(
        [...listFields].sort((a, b) => a.field_order - b.field_order),
        activeSpace?.id,
        activeFolder?.id,
        activeList.id,
      );
    }
    if (activeFolder) {
      // Folder-scoped fields + fields scoped to any list inside this folder,
      // deduplicated by name so the folder aggregates its lists' columns.
      const folderListIds = new Set(
        spaceLists.filter((l) => l.folder_id === activeFolder.id).map((l) => l.id)
      );
      const seen = new Set();
      const ff = (activeSpace?.space_fields || [])
        .filter((f) => f.folder_id === activeFolder.id || (f.list_id && folderListIds.has(f.list_id)))
        .filter((f) => {
          if (seen.has(f.field_name)) return false;
          seen.add(f.field_name);
          return true;
        });
      return applyFieldOverrides(
        [...ff].sort((a, b) => a.field_order - b.field_order),
        activeSpace?.id,
        activeFolder.id,
      );
    }
    // Space level: all fields (space + folder + list scoped), deduplicated by name
    const seen = new Set();
    const allSpaceFields = (activeSpace?.space_fields || []).filter((f) => {
      if (seen.has(f.field_name)) return false;
      seen.add(f.field_name);
      return true;
    });
    return applyFieldOverrides(
      [...allSpaceFields].sort((a, b) => a.field_order - b.field_order),
      activeSpace?.id,
      null,
    );
  }
  function getFolderFields(folder) {
    const folderListIds = new Set(
      spaceLists.filter((l) => l.folder_id === folder.id).map((l) => l.id)
    );
    const ff = (activeSpace?.space_fields || []).filter(
      (f) => f.folder_id === folder.id || (f.list_id && folderListIds.has(f.list_id))
    );
    if (ff.length > 0)
      return applyFieldOverrides(
        [...ff].sort((a, b) => a.field_order - b.field_order),
        activeSpace?.id,
        folder.id,
      );
    return applyFieldOverrides(
      (activeSpace?.space_fields || []).filter((f) => !f.folder_id && !f.list_id)
        .sort((a, b) => a.field_order - b.field_order),
      activeSpace?.id,
      null,
    );
  }
  function getStatusColor(status) {
    const allStatuses = activeSpace?.space_statuses || [];
    // Most specific first: list-scoped
    if (activeList) {
      const f = allStatuses.find((s) => s.list_id === activeList.id && s.name === status);
      if (f) return f.color;
    }
    // Then folder-scoped
    if (activeFolder) {
      const f = allStatuses.find((s) => s.folder_id === activeFolder.id && !s.list_id && s.name === status);
      if (f) return f.color;
    }
    // Then any match (space-level)
    const f = allStatuses.find((s) => !s.list_id && !s.folder_id && s.name === status);
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
    const allStatuses = activeSpace?.space_statuses || [];
    // Check folder-scoped first, then any list-scoped status within this folder
    const f = allStatuses.find((s) => s.folder_id === folder.id && !s.list_id && s.name === status)
      || allStatuses.find((s) => s.folder_id === folder.id && s.list_id && s.name === status);
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
    // When creating a task in an active list context, show only that list's fields
    if (activeList) {
      return applyFieldOverrides(
        [...listFields].sort((a, b) => a.field_order - b.field_order),
        space.id,
        activeFolder?.id || null,
      );
    }
    if (newTask.folder_id) {
      // Folder view: show only folder-scoped fields (not list-scoped ones from siblings)
      const ff = (space.space_fields || []).filter(
        (f) => f.folder_id === newTask.folder_id && !f.list_id
      );
      return applyFieldOverrides(
        ff.sort((a, b) => a.field_order - b.field_order),
        space.id,
        newTask.folder_id,
      );
    }
    // Space level: only space-scoped fields (no folder_id, no list_id)
    return applyFieldOverrides(
      (space.space_fields || [])
        .filter((f) => !f.folder_id && !f.list_id)
        .sort((a, b) => a.field_order - b.field_order),
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

  // A status counts as "done" if its name is Done/Complete/Completed/Closed.
  function isDoneStatus(status) {
    const s = (status || "").toLowerCase().trim();
    return s === "done" || s === "complete" || s === "completed" || s === "closed";
  }

  // Map of parent_task_id -> [child tasks], built from all fetched tasks so
  // subtasks can be rendered nested under their parent everywhere.
  const childrenByParent = (() => {
    const m = {};
    for (const t of tasks) {
      if (t.parent_task_id) {
        (m[t.parent_task_id] ||= []).push(t);
      }
    }
    return m;
  })();
  // Recursively count subtask completion (done vs total) for a parent.
  function subtaskProgress(taskId) {
    const kids = childrenByParent[taskId] || [];
    let done = 0, total = 0;
    for (const k of kids) {
      total += 1;
      if (isDoneStatus(k.status)) done += 1;
      const sub = subtaskProgress(k.id);
      done += sub.done;
      total += sub.total;
    }
    return { done, total };
  }

  function taskAssigneeNames(task) {
    return task.assignees?.length
      ? task.assignees
      : task.assignee
        ? [task.assignee]
        : [];
  }
  function taskFieldValue(task, fieldId) {
    return task.task_field_values?.find((v) => v.field_id === fieldId)?.value || "";
  }
  // Evaluate a single condition against a task.
  function condMatch(f, task) {
    if (!f.field) return true;
    let raw;
    if (f.field === "status") raw = task.status || "";
    else if (f.field === "priority") raw = task.priority || "";
    else if (f.field === "assignee") raw = taskAssigneeNames(task);
    else if (f.field === "due_date") raw = task.due_date || "";
    else if (f.field.startsWith("field_")) raw = taskFieldValue(task, f.field.replace("field_", ""));
    else raw = "";
    const isArr = Array.isArray(raw);
    const val = f.value;
    // Incomplete condition (value-requiring op with no value) = no constraint.
    if (f.op !== "is_set" && f.op !== "is_empty" && (val === undefined || val === "")) return true;
    switch (f.op) {
      case "is": return isArr ? raw.includes(val) : String(raw) === String(val);
      case "is_not": return isArr ? !raw.includes(val) : String(raw) !== String(val);
      case "contains": return String(isArr ? raw.join(",") : raw).toLowerCase().includes(String(val || "").toLowerCase());
      case "is_set": return isArr ? raw.length > 0 : !!raw;
      case "is_empty": return isArr ? raw.length === 0 : !raw;
      case "before": return !!raw && !!val && new Date(raw) < new Date(val);
      case "after": return !!raw && !!val && new Date(raw) > new Date(val);
      case "on": return !!raw && !!val && String(raw).slice(0, 10) === val;
      default: return true;
    }
  }
  // Recursively evaluate a group. Each child (after the first) carries its own
  // conjunction linking it to the previous one, evaluated with standard
  // precedence: AND binds tighter than OR (so A AND B OR C = (A AND B) OR C).
  function groupMatch(group, task) {
    const kids = group.children || [];
    if (kids.length === 0) return true;
    const evalChild = (ch) => (ch.kind === "group" ? groupMatch(ch, task) : condMatch(ch, task));
    let orAcc = false;
    let andAcc = evalChild(kids[0]);
    for (let i = 1; i < kids.length; i++) {
      const res = evalChild(kids[i]);
      if ((kids[i].conj || "AND") === "OR") {
        orAcc = orAcc || andAcc;
        andAcc = res;
      } else {
        andAcc = andAcc && res;
      }
    }
    return orAcc || andAcc;
  }
  function passesFilters(task) {
    return groupMatch(filterTree, task);
  }
  // Count leaf conditions in the tree (for the Filter button badge).
  function countConditions(group) {
    return (group.children || []).reduce(
      (n, ch) => n + (ch.kind === "group" ? countConditions(ch) : 1),
      0,
    );
  }
  const filterCount = countConditions(filterTree);
  const draftCount = countConditions(draftTree);
  const draftDirty = JSON.stringify(draftTree) !== JSON.stringify(filterTree);

  // ── Immutable tree edit helpers ──
  const newId = () => `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  function treeAddChild(root, groupId, child) {
    const rec = (g) =>
      g.id === groupId
        ? { ...g, children: [...g.children, child] }
        : { ...g, children: g.children.map((c) => (c.kind === "group" ? rec(c) : c)) };
    return rec(root);
  }
  function treeUpdate(root, id, patch) {
    const rec = (g) => ({
      ...g,
      ...(g.id === id ? patch : {}),
      children: g.children.map((c) =>
        c.id === id ? { ...c, ...patch } : c.kind === "group" ? rec(c) : c,
      ),
    });
    return rec(root);
  }
  function treeRemove(root, id) {
    const rec = (g) => ({
      ...g,
      children: g.children
        .filter((c) => c.id !== id)
        .map((c) => (c.kind === "group" ? rec(c) : c)),
    });
    return rec(root);
  }
  function addCondition(groupId) {
    setDraftTree((t) => treeAddChild(t, groupId, { id: newId(), kind: "cond", field: "status", op: "is", value: "" }));
  }
  function addNestedGroup(groupId) {
    setDraftTree((t) => treeAddChild(t, groupId, { id: newId(), kind: "group", conj: "AND", children: [{ id: newId(), kind: "cond", field: "status", op: "is", value: "" }] }));
  }

  // ── Saved filters (persisted in localStorage) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem("abc_saved_filters");
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  function persistSavedFilters(next) {
    setSavedFilters(next);
    try { localStorage.setItem("abc_saved_filters", JSON.stringify(next)); } catch { /* ignore */ }
  }
  function saveCurrentFilter() {
    if (draftCount === 0) return;
    const name = prompt("Name this filter set:");
    if (!name?.trim()) return;
    const next = [...savedFilters.filter((s) => s.name !== name.trim()), { name: name.trim(), tree: draftTree }];
    persistSavedFilters(next);
  }
  function loadSavedFilter(s) {
    setDraftTree(s.tree);
    setFilterTree(s.tree); // apply immediately
    setShowSavedMenu(false);
  }
  function deleteSavedFilter(name) {
    persistSavedFilters(savedFilters.filter((s) => s.name !== name));
  }
  function clearFilters() {
    const empty = { id: "root", kind: "group", conj: "AND", children: [] };
    setDraftTree(empty);
    setFilterTree(empty);
  }
  function applyFilters() {
    setFilterTree(draftTree);
  }

  // ── Filter builder helpers ──
  function filterableFields() {
    const base = [
      { value: "status", label: "Status" },
      { value: "priority", label: "Priority" },
      { value: "assignee", label: "Assignee" },
      { value: "due_date", label: "Due date" },
    ];
    const custom = getFields().map((f) => ({ value: `field_${f.id}`, label: f.field_name, ftype: f.field_type, options: f.field_options }));
    return [...base, ...custom];
  }
  function filterFieldMeta(field) {
    return filterableFields().find((f) => f.value === field) || { value: field, label: field };
  }
  function filterFieldType(field) {
    if (field === "due_date") return "date";
    const meta = filterFieldMeta(field);
    if (meta.ftype === "date") return "date";
    return "choice";
  }
  function filterOps(field) {
    if (filterFieldType(field) === "date")
      return [["is_set", "is set"], ["is_empty", "is empty"], ["before", "before"], ["after", "after"], ["on", "on"]];
    return [["is", "is"], ["is_not", "is not"], ["contains", "contains"], ["is_set", "is set"], ["is_empty", "is empty"]];
  }
  function filterValueOptions(field) {
    if (field === "status") {
      const list = getUniqueStatuses();
      return list.length ? list : getStatuses();
    }
    if (field === "priority") return ["High", "Medium", "Low"];
    if (field === "assignee") {
      // Union of registered members and any assignee names present on tasks
      // (e.g. imported free-text names that aren't member records).
      const set = new Set(members.map((m) => m.full_name).filter(Boolean));
      tasks.forEach((t) => taskAssigneeNames(t).forEach((n) => n && set.add(n)));
      return [...set].sort((a, b) => a.localeCompare(b));
    }
    const meta = filterFieldMeta(field);
    if (meta.ftype === "dropdown" && meta.options?.length) return meta.options;
    return null; // free text / date input
  }

  // Human-readable label + expression preview (shows AND-over-OR precedence).
  const OP_LABELS = { is: "is", is_not: "is not", contains: "contains", is_set: "is set", is_empty: "is empty", before: "before", after: "after", on: "on" };
  function condLabel(cond) {
    const meta = filterFieldMeta(cond.field);
    const opl = OP_LABELS[cond.op] || cond.op;
    const needsVal = cond.op !== "is_set" && cond.op !== "is_empty";
    return `${meta.label} ${opl}${needsVal ? ` ${cond.value || "…"}` : ""}`;
  }
  function nodeLabel(node) {
    return node.kind === "group" ? `(${filterExpression(node)})` : condLabel(node);
  }
  function filterExpression(group) {
    const kids = group.children || [];
    if (!kids.length) return "";
    const runs = [];
    let cur = [nodeLabel(kids[0])];
    for (let i = 1; i < kids.length; i++) {
      if ((kids[i].conj || "AND") === "OR") { runs.push(cur); cur = [nodeLabel(kids[i])]; }
      else cur.push(nodeLabel(kids[i]));
    }
    runs.push(cur);
    const hasOr = runs.length > 1;
    const runStrs = runs.map((r) => (r.length > 1 && hasOr ? `(${r.join(" AND ")})` : r.join(" AND ")));
    return runStrs.join(" OR ");
  }

  // Conjunction cell shown before each child: "Where" for the first, and an
  // editable AND/OR dropdown (bound to that child) for every one after it, so
  // operators can be mixed within a group.
  function conjCell(child, idx) {
    if (idx === 0)
      return <span style={{ fontSize: 11, color: "#9ca3af", width: 62, flexShrink: 0 }}>Where</span>;
    return (
      <select
        value={child.conj || "AND"}
        onChange={(e) => setDraftTree((t) => treeUpdate(t, child.id, { conj: e.target.value }))}
        style={{ fontSize: 11, fontWeight: 600, padding: "4px 4px", border: "1px solid #d1d5db", borderRadius: 6, width: 62, flexShrink: 0 }}
      >
        <option value="AND">AND</option>
        <option value="OR">OR</option>
      </select>
    );
  }

  function renderFilterCondition(cond, group, idx) {
    const valOpts = filterValueOptions(cond.field);
    const ftype = filterFieldType(cond.field);
    const needsValue = cond.op !== "is_set" && cond.op !== "is_empty";
    return (
      <div key={cond.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {conjCell(cond, idx)}
        <select
          value={cond.field}
          onChange={(e) => {
            const nf = e.target.value;
            setDraftTree((t) => treeUpdate(t, cond.id, { field: nf, op: filterOps(nf)[0][0], value: "" }));
          }}
          style={{ fontSize: 12, padding: "5px 6px", border: "1px solid #d1d5db", borderRadius: 6, maxWidth: 120 }}
        >
          {filterableFields().map((ff) => (
            <option key={ff.value} value={ff.value}>{ff.label}</option>
          ))}
        </select>
        <select
          value={cond.op}
          onChange={(e) => setDraftTree((t) => treeUpdate(t, cond.id, { op: e.target.value }))}
          style={{ fontSize: 12, padding: "5px 6px", border: "1px solid #d1d5db", borderRadius: 6, flexShrink: 0, width: 96 }}
        >
          {filterOps(cond.field).map(([op, label]) => (
            <option key={op} value={op}>{label}</option>
          ))}
        </select>
        {needsValue &&
          (valOpts && valOpts.length ? (
            <select
              value={cond.value}
              onChange={(e) => setDraftTree((t) => treeUpdate(t, cond.id, { value: e.target.value }))}
              style={{ fontSize: 12, padding: "5px 6px", border: "1px solid #d1d5db", borderRadius: 6, flex: 1, minWidth: 0 }}
            >
              <option value="">Select…</option>
              {valOpts.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type={ftype === "date" ? "date" : "text"}
              value={cond.value}
              onChange={(e) => setDraftTree((t) => treeUpdate(t, cond.id, { value: e.target.value }))}
              placeholder="Value…"
              style={{ fontSize: 12, padding: "5px 6px", border: "1px solid #d1d5db", borderRadius: 6, flex: 1, minWidth: 0 }}
            />
          ))}
        <button onClick={() => setDraftTree((t) => treeRemove(t, cond.id))} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, flexShrink: 0 }}>🗑</button>
      </div>
    );
  }

  function renderFilterGroup(group, depth) {
    return (
      <div
        style={depth > 0 ? { border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fafafa" } : undefined}
      >
        {group.children.map((child, idx) =>
          child.kind === "group" ? (
            <div key={child.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
              {conjCell(child, idx)}
              <div style={{ flex: 1, minWidth: 0 }}>{renderFilterGroup(child, depth + 1)}</div>
              <button onClick={() => setDraftTree((t) => treeRemove(t, child.id))} title="Remove group" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, flexShrink: 0, marginTop: 8 }}>🗑</button>
            </div>
          ) : (
            renderFilterCondition(child, group, idx)
          ),
        )}
        <div style={{ display: "flex", gap: 14, marginTop: group.children.length ? 2 : 0 }}>
          <button onClick={() => addCondition(group.id)} style={{ background: "none", border: "none", color: "#1d4ed8", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 0 }}>+ Add filter</button>
          {depth < 2 && (
            <button onClick={() => addNestedGroup(group.id)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer", padding: 0 }}>Add nested filter</button>
          )}
        </div>
      </div>
    );
  }

  const filteredTasks = tasks.filter((t) => {
    if (t.parent_task_id) return false; // subtasks render nested under parents
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (!passesFilters(t)) return false;
    return true;
  });

  // Group tasks by their exact assignee combination — a task with
  // [Garima, Aishwaraya] gets its own "Garima, Aishwaraya" group rather
  // than being duplicated into each person's individual group. Matches
  // ClickUp's behavior. Single-assignee and unassigned tasks behave as
  // before, just each in their own single-person/Unassigned group.
  function groupByAssignees(taskList) {
    const g = {};
    taskList.forEach((task) => {
      const names =
        task.assignees?.length > 0
          ? [...task.assignees]
          : task.assignee
            ? [task.assignee]
            : [];
      const key =
        names.length > 0 ? [...names].sort().join(", ") : "Unassigned";
      if (!g[key]) g[key] = [];
      g[key].push(task);
    });
    return g;
  }

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
      const g = groupByAssignees(tl);
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
    fetchComments(task.id);
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
    setNewSubtaskTitle("");
    setAttachments([]);
    setChecklists([]);
    setLinkedDocs([]);
    setShowDocPicker(false);
    setDocSearch("");
    setAddingChecklist(false);
    setNewChecklistName("");
    setNewItemText({});
    fetchAttachments(task.id);
    fetchChecklists(task.id);
  }
  function closeDrawer() {
    setDrawerTask(null);
    setDrawerEdits({});
    setDrawerTab("details");
    setTaskHistory([]);
    setAttachments([]);
    setChecklists([]);
    setComments([]);
    setCommentText("");
    setEditingCommentId(null);
    setLinkedDocs([]);
    setShowDocPicker(false);
    setDocSearch("");
    setItemMenuOpen(null);
    setEditingItemId(null);
    setClMenuOpen(null);
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
      updated_by: profile?.full_name || "Unknown",
      updated_at: new Date().toISOString(),
      date_updated_manual: new Date().toISOString().slice(0, 10),
      date_done: (() => {
        const newStatus = drawerEdits.status ?? drawerTask.status;
        if (newStatus === "Done") return drawerTask.date_done || new Date().toISOString().slice(0, 10);
        return null;
      })(),
      date_closed: (() => {
        const newStatus = drawerEdits.status ?? drawerTask.status;
        if (isClosedStatus(newStatus)) return drawerTask.date_closed || new Date().toISOString().slice(0, 10);
        return null;
      })(),
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

    // Notify newly-added assignees (drawer assignment path)
    {
      const beforeA = drawerTask.assignees?.length ? drawerTask.assignees : drawerTask.assignee ? [drawerTask.assignee] : [];
      const afterA = payload.assignees || [];
      const added = afterA.filter((n) => !beforeA.includes(n));
      if (added.length) await notifyAssignment(drawerTask, added);
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

    // Refetch with the SAME scoping as fetchTasks (list/folder/space, no
    // extra member filter) so other status groups aren't wiped out on save.
    let q = supabase
      .from("tasks")
      .select("*, task_field_values(*)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (activeList) q = q.eq("list_id", activeList.id);
    else if (activeFolder) q = q.eq("folder_id", activeFolder.id);
    else if (activeSpace) q = q.eq("space_id", activeSpace.id);
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

  async function createSubtask(parent) {
    const title = newSubtaskTitle.trim();
    if (!title || !parent) return;
    const statuses = parent.list_id
      ? getStatusesForList(parent.list_id)
      : getStatuses();
    const firstStatus = statuses[0] || "To Do";
    const { data } = await supabase
      .from("tasks")
      .insert({
        title,
        description: "",
        space_id: parent.space_id,
        folder_id: parent.folder_id || null,
        list_id: parent.list_id || null,
        parent_task_id: parent.id,
        status: firstStatus,
        priority: "Medium",
        assignee: "",
        assignees: [],
        updated_by: profile?.full_name || "Unknown",
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (data) {
      setNewSubtaskTitle("");
      setExpandedSubtasks((p) => ({ ...p, [parent.id]: true }));
      await fetchTasks();
    }
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
      folder_id: newTask.folder_id || activeFolder?.id || null,
      list_id: activeList?.id || null,
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
    if (profile?.role !== "admin") {
      alert("Only admins can delete tasks.");
      return;
    }
    // Collect this task plus all descendant subtasks so they're trashed together
    const idsToDelete = [taskId];
    const collect = (pid) => {
      for (const c of childrenByParent[pid] || []) {
        idsToDelete.push(c.id);
        collect(c.id);
      }
    };
    collect(taskId);
    const msg = idsToDelete.length > 1
      ? `Move this task and its ${idsToDelete.length - 1} subtask(s) to Trash? You can restore later.`
      : "Move this task to Trash? You can restore it later.";
    if (!confirm(msg)) return;
    if (drawerTask?.id === taskId) closeDrawer();
    await supabase
      .from("tasks")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: profile?.full_name || "Unknown",
      })
      .in("id", idsToDelete);
    fetchTasks();
  }

  function isClosedStatus(st) {
    if (!st) return false;
    const s = st.toLowerCase();
    return s.includes("cancel") || s.includes("closed") || s === "rejected";
  }

  async function updateTaskStatus(taskId, newSt) {
    const task = tasks.find((t) => t.id === taskId);
    const oldStatus = task?.status;
    const now = new Date().toISOString();
    const wasDone = oldStatus === "Done";
    const nowDone = newSt === "Done";
    const wasClosed = isClosedStatus(oldStatus);
    const nowClosed = isClosedStatus(newSt);
    await supabase
      .from("tasks")
      .update({
        status: newSt,
        updated_by: profile?.full_name || "Unknown",
        updated_at: now,
        date_updated_manual: now.slice(0, 10),
        date_done: nowDone ? now.slice(0, 10) : (wasDone && !nowDone ? null : task?.date_done || null),
        date_closed: nowClosed ? now.slice(0, 10) : (wasClosed && !nowClosed ? null : task?.date_closed || null),
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

  async function recordHistory(taskId, changes) {
    await supabase.from("task_history").insert({
      task_id: taskId,
      changed_by: profile?.full_name || "Unknown",
      changed_at: new Date().toISOString(),
      changes,
    });
  }

  // Human-readable "Space / Folder / List" path for a task, from its ids.
  function taskScopePath(task) {
    const space = spaces.find((s) => s.id === task.space_id);
    const folder = space?.folders?.find((f) => f.id === task.folder_id);
    const list = spaceLists.find((l) => l.id === task.list_id);
    return [space?.name, folder?.name, list?.name].filter(Boolean).join(" / ");
  }

  // Create in-app notifications for newly-assigned users (excludes the actor).
  async function notifyAssignment(task, addedNames) {
    const me = profile?.full_name;
    const recipients = [...new Set(addedNames)]
      .filter((n) => n && n !== me)
      .map((n) => members.find((m) => m.full_name === n))
      .filter((m) => m && m.id);
    if (!recipients.length) return;
    const path = taskScopePath(task);
    await supabase.from("notifications").insert(
      recipients.map((m) => ({
        user_id: m.id,
        task_id: task.id,
        type: "assigned",
        title: `Assigned: ${task.title}`,
        body: `${me || "Someone"} assigned you to this task.`,
        link_scope: { space_id: task.space_id, folder_id: task.folder_id, list_id: task.list_id, path },
      })),
    );
  }

  // Inline set assignees on a task (used by the empty-cell add-assignee picker).
  async function setTaskAssignees(taskId, names) {
    const task = tasks.find((t) => t.id === taskId);
    const before = task?.assignees?.length ? task.assignees : task?.assignee ? [task.assignee] : [];
    await supabase
      .from("tasks")
      .update({
        assignees: names,
        assignee: names[0] || "",
        updated_by: profile?.full_name || "Unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    // Record as arrays so changeLabel("assignees") can diff them.
    if (before.join(",") !== names.join(",")) await recordHistory(taskId, { assignees: { from: before, to: names } });
    if (task) await notifyAssignment(task, names.filter((n) => !before.includes(n)));
    fetchTasks();
  }
  function toggleSelectTask(id) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedTaskIds(new Set());
    setBulkAssignOpen(false);
  }
  // Assign the given person to every selected task (appends if not present).
  async function bulkAssignTo(name) {
    const ids = [...selectedTaskIds];
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id);
      if (!task) continue;
      const before = task.assignees?.length ? task.assignees : task.assignee ? [task.assignee] : [];
      if (before.includes(name)) continue;
      const after = [...before, name];
      await supabase
        .from("tasks")
        .update({ assignees: after, assignee: after[0] || "", updated_by: profile?.full_name || "Unknown", updated_at: new Date().toISOString() })
        .eq("id", id);
      await recordHistory(id, { assignees: { from: before, to: after } });
      await notifyAssignment(task, [name]);
    }
    clearSelection();
    fetchTasks();
  }

  // Inline set a built-in date column on a task.
  async function setTaskDate(taskId, colKey, value) {
    const task = tasks.find((t) => t.id === taskId);
    const before = task?.[colKey] || "";
    await supabase
      .from("tasks")
      .update({
        [colKey]: value || null,
        updated_by: profile?.full_name || "Unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (before !== (value || "")) {
      const label = COLUMN_LABELS?.[colKey] || colKey;
      await recordHistory(taskId, { [label]: { from: before || "—", to: value || "—" } });
    }
    fetchTasks();
  }
  // Inline set a custom field value on a task.
  async function setTaskFieldValueInline(taskId, fieldId, value) {
    const { data: existing } = await supabase
      .from("task_field_values")
      .select("id, value")
      .eq("task_id", taskId)
      .eq("field_id", fieldId)
      .maybeSingle();
    const before = existing?.value || "";
    if (existing) await supabase.from("task_field_values").update({ value }).eq("id", existing.id);
    else await supabase.from("task_field_values").insert({ task_id: taskId, field_id: fieldId, value });
    if (before !== (value || "")) {
      const fieldName = (activeSpace?.space_fields || []).find((f) => f.id === fieldId)?.field_name || "Field";
      await recordHistory(taskId, { [fieldName]: { from: before || "—", to: value || "—" } });
    }
    fetchTasks();
  }

  async function addCustomField() {
    if (!newField.field_name.trim() || !activeSpace) return;
    let fieldOptions = null;
    if (newField.field_type === "dropdown")
      fieldOptions = newField.field_options?.filter((o) => o.trim()) || [];
    else if (newField.field_type === "formula") {
      if (newField.formula_key === "days_since_date_field")
        fieldOptions = [newField.formula_key, newField.date_field_name || ""];
      else
        fieldOptions = [newField.formula_key, newField.custom_formula || ""];
    }
    const payload = {
      space_id: activeSpace.id,
      folder_id: activeList ? null : (activeFolder?.id || null),
      list_id: activeList?.id || null,
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
      setLocallyAddedFields((prev) => [...prev, data]);
      setFieldAddedFlash(true);
      setTimeout(() => setFieldAddedFlash(false), 1800);
      // Refetch list-scoped fields so the new field appears immediately at list level
      if (activeList) {
        supabase.from("space_fields").select("*").eq("list_id", activeList.id).order("field_order")
          .then(({ data: lf }) => setListFields(lf || []));
      }
    }
    setNewField({
      field_name: "",
      field_type: "text",
      field_options: [],
      formula_key: "days_since_created",
      custom_formula: "",
      date_field_name: "",
    });
    // Keep modal open so the new field is visible in "Existing fields" above
    onRefreshSpaces();
  }

  async function deleteCustomField(fieldId) {
    if (!confirm("Delete this custom field? All task values for this field will also be permanently deleted."))
      return;
    // Hide instantly from the UI
    setLocallyDeletedFieldIds((prev) => [...prev, fieldId]);
    // Delete all task values for this field first, then the field definition
    await supabase.from("task_field_values").delete().eq("field_id", fieldId);
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
    if (activeList) {
      // If list has no statuses yet, seed from folder or space statuses
      const { data: eLS } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("list_id", activeList.id);
      if (!eLS || eLS.length === 0) {
        const seed = await (async () => {
          if (activeFolder) {
            const { data } = await supabase.from("space_statuses").select("*")
              .eq("folder_id", activeFolder.id).is("list_id", null).order("status_order");
            if (data?.length > 0) return data;
          }
          const { data } = await supabase.from("space_statuses").select("*")
            .eq("space_id", activeSpace.id).is("folder_id", null).is("list_id", null).order("status_order");
          return data || [];
        })();
        if (seed.length > 0)
          await supabase.from("space_statuses").insert(
            seed.map((s) => ({
              space_id: activeSpace.id,
              folder_id: activeFolder?.id || null,
              list_id: activeList.id,
              name: s.name,
              color: s.color,
              status_order: s.status_order,
            })),
          );
      }
    } else if (activeFolder) {
      const { data: eFS } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id)
        .is("list_id", null);
      if (!eFS || eFS.length === 0) {
        const { data: sS } = await supabase
          .from("space_statuses")
          .select("*")
          .eq("space_id", activeSpace.id)
          .is("folder_id", null)
          .is("list_id", null)
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
    if (activeList) dupQ = dupQ.eq("list_id", activeList.id);
    else if (activeFolder) dupQ = dupQ.eq("folder_id", activeFolder.id).is("list_id", null);
    else dupQ = dupQ.eq("space_id", activeSpace.id).is("folder_id", null).is("list_id", null);
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
      list_id: activeList?.id || null,
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

  async function saveEditStatus() {
    if (!editingStatusId || !editingStatusData.name.trim()) return;
    setStatusLoading(true);
    setStatusActionMsg("");
    const oldStatus = modalSpaceStatuses.find((s) => s.id === editingStatusId);
    const oldName = oldStatus?.name || "";
    const newName = editingStatusData.name.trim();
    const { error } = await supabase
      .from("space_statuses")
      .update({ name: newName, color: editingStatusData.color })
      .eq("id", editingStatusId);
    if (error) {
      setStatusActionMsg("❌ Failed to update status.");
      setStatusLoading(false);
      return;
    }
    if (oldName && oldName !== newName) {
      await supabase
        .from("tasks")
        .update({ status: newName })
        .eq("space_id", activeSpace.id)
        .eq("status", oldName);
    }
    setEditingStatusId(null);
    setStatusActionMsg(`✅ "${newName}" updated.`);
    await fetchModalStatuses();
    await onRefreshSpaces();
    fetchTasks();
    setStatusLoading(false);
  }

  async function refreshAllListStatuses() {
    if (!activeSpace) return;
    const { data } = await supabase.from("space_statuses").select("*")
      .eq("space_id", activeSpace.id).not("list_id", "is", null).order("status_order");
    setAllListStatuses(data || []);
  }

  // Refetch the active list's statuses and fields (their useEffects are keyed
  // on [activeList], so they don't re-run after an import into the same list).
  async function refreshActiveListScoped() {
    if (activeList) {
      const [{ data: st }, { data: fl }] = await Promise.all([
        supabase.from("space_statuses").select("*").eq("list_id", activeList.id).order("status_order"),
        supabase.from("space_fields").select("*").eq("list_id", activeList.id).order("field_order"),
      ]);
      setListStatuses(st || []);
      setListFields(fl || []);
    }
    await refreshAllListStatuses();
  }

  async function fetchModalStatuses() {
    if (!activeSpace) return;
    if (activeList) {
      const { data } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("list_id", activeList.id)
        .order("status_order");
      setModalSpaceStatuses(data || []);
      setListStatuses(data || []);
      refreshAllListStatuses();
      return data || [];
    }
    if (activeFolder) {
      // Include both folder-scoped and list-scoped statuses for lists in this folder
      const { data } = await supabase
        .from("space_statuses")
        .select("*")
        .eq("folder_id", activeFolder.id)
        .order("status_order");
      // Deduplicate by name, preferring list-scoped over folder-scoped
      const seen = new Set();
      const unique = (data || []).filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      setModalSpaceStatuses(unique);
      return unique;
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

  function GridHeaderCell({
    colKey,
    resizeKey,
    label,
    sortable,
    indented,
    sticky,
    draggableCol,
    selectAllIds,
  }) {
    const isActive = sortConfig.key === colKey;
    const allSelected = selectAllIds && selectAllIds.length > 0 && selectAllIds.every((id) => selectedTaskIds.has(id));
    const widthKey = resizeKey || colKey;
    const isDragOver = draggableCol && dragOverColKey === colKey;
    return (
      <div
        draggable={!!draggableCol}
        onDragStart={draggableCol ? (e) => {
          draggedColKey.current = colKey;
          e.dataTransfer.effectAllowed = "move";
        } : undefined}
        onDragOver={draggableCol ? (e) => {
          e.preventDefault();
          setDragOverColKey(colKey);
        } : undefined}
        onDragLeave={draggableCol ? () => setDragOverColKey(null) : undefined}
        onDrop={draggableCol ? (e) => {
          e.preventDefault();
          dropColumn(draggedColKey.current, colKey);
        } : undefined}
        style={{
          position: sticky ? "sticky" : "relative",
          left: sticky ? 0 : undefined,
          zIndex: sticky ? 3 : undefined,
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          paddingLeft: indented ? 32 : 14,
          fontSize: 11,
          fontWeight: 700,
          color: isActive ? "#1d4ed8" : "#999",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          borderBottom: isDragOver ? "2px solid #3b82f6" : "1px solid #ebebeb",
          borderLeft: isDragOver ? "2px solid #3b82f6" : undefined,
          borderRight: sticky ? "1px solid #ebebeb" : undefined,
          background: isDragOver ? "#eff6ff" : "#fafaf9",
          boxShadow: sticky ? "2px 0 4px -2px rgba(0,0,0,0.08)" : undefined,
          cursor: draggableCol ? "grab" : sortable ? "pointer" : "default",
          userSelect: "none",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
        onClick={sortable ? () => handleSort(colKey) : undefined}
        title={draggableCol ? "Drag to reorder" : sortable ? "Click to sort" : undefined}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {selectAllIds && (
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = !allSelected && selectAllIds.some((id) => selectedTaskIds.has(id)); }}
              onClick={(e) => e.stopPropagation()}
              onChange={() => {
                setSelectedTaskIds((prev) => {
                  const next = new Set(prev);
                  if (allSelected) selectAllIds.forEach((id) => next.delete(id));
                  else selectAllIds.forEach((id) => next.add(id));
                  return next;
                });
              }}
              title="Select all in group"
              style={{ width: 14, height: 14, cursor: "pointer", marginRight: 4 }}
            />
          )}
          {label}
          {sortable && (
            <span
              style={{
                fontSize: 10,
                color: isActive ? "#1d4ed8" : "#ccc",
                opacity: isActive ? 1 : 0.6,
                flexShrink: 0,
              }}
            >
              {isActive ? (sortConfig.direction === "asc" ? "▲" : "▼") : "↕"}
            </span>
          )}
        </span>
        {/* Resize handle */}
        <div
          onMouseDown={(e) => startColumnResize(widthKey, e)}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 2,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#bfdbfe")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        />
      </div>
    );
  }

  function renderTableHead(fieldList, indented = false, groupTaskIds = null) {
    const activeCols = getActiveColumns(fieldList);
    const gridTemplate = buildGridTemplate(fieldList, indented);
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          width: "max-content",
          minWidth: "100%",
        }}
      >
        <GridHeaderCell
          colKey="title"
          resizeKey="name"
          label="Name"
          sortable
          indented={indented}
          sticky
          selectAllIds={groupTaskIds}
        />
        {activeCols.map((c) => (
          <GridHeaderCell
            key={c.key}
            colKey={c.key}
            label={c.label}
            sortable={c.sortable}
            draggableCol
          />
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            fontSize: 11,
            fontWeight: 700,
            color: "#999",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderBottom: "1px solid #ebebeb",
            background: "#fafaf9",
          }}
        >
          Status
        </div>
        <div
          style={{
            borderBottom: "1px solid #ebebeb",
            background: "#fafaf9",
          }}
        />
      </div>
    );
  }

  // Deterministic avatar color from a name, and its initials (max 2 letters).
  function avatarColor(name) {
    const palette = ["#e11d48", "#db2777", "#9333ea", "#6d28d9", "#4f46e5", "#2563eb", "#0891b2", "#0d9488", "#059669", "#65a30d", "#ca8a04", "#ea580c"];
    let h = 0;
    for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }
  // Friendly empty-state block with an illustration, message and optional CTA.
  function emptyState({ title, subtitle, cta = true, compact = false }) {
    return (
      <div style={{ textAlign: "center", padding: compact ? "26px 20px" : "56px 20px", color: "#94a3b8" }}>
        <svg width={compact ? 56 : 84} height={compact ? 56 : 84} viewBox="0 0 120 120" fill="none" style={{ marginBottom: compact ? 10 : 16 }}>
          <rect x="30" y="18" width="60" height="80" rx="8" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="46" y="12" width="28" height="14" rx="5" fill="#e2e8f0" />
          <line x1="42" y1="44" x2="78" y2="44" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
          <line x1="42" y1="58" x2="70" y2="58" stroke="#dbe2ea" strokeWidth="3" strokeLinecap="round" />
          <line x1="42" y1="72" x2="74" y2="72" stroke="#dbe2ea" strokeWidth="3" strokeLinecap="round" />
          <circle cx="90" cy="86" r="18" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="2" />
          <line x1="90" y1="79" x2="90" y2="93" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
          <line x1="83" y1="86" x2="97" y2="86" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "#a3aab5", marginBottom: cta ? 16 : 0 }}>{subtitle}</div>}
        {cta && (
          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }} onClick={openNewTask}>
            + New Task
          </button>
        )}
      </div>
    );
  }

  // A clean "add assignee" person-with-plus button (ClickUp-style) for empty
  // username / assignee cells.
  function assignAddButton(onClick) {
    return (
      <button
        onClick={onClick}
        title="Assign"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, padding: 0,
          border: "none", background: "none", color: "#94a3b8", cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#475569"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9.5" cy="8" r="3.6" />
          <path d="M3 19.5c0-3.4 2.9-6 6.5-6 1.15 0 2.24.24 3.2.68" />
          <line x1="18.5" y1="14" x2="18.5" y2="20.5" />
          <line x1="15.25" y1="17.25" x2="21.75" y2="17.25" />
        </svg>
      </button>
    );
  }

  // A clickable calendar-add icon with an overlaid native date input, used
  // for empty date cells so the user can set a date inline.
  function dateAddCell(value, onSet) {
    return (
      <span
        style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, color: "#94a3b8", cursor: "pointer" }}
        title="Set date"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
        </svg>
        <input
          type="date"
          value={value || ""}
          onChange={(e) => onSet(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
        />
      </span>
    );
  }

  function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // Due-date urgency: "overdue" | "soon" (within 15 days) | "normal".
  function dueUrgency(task) {
    if (!task.due_date || isDoneStatus(task.status)) return "normal";
    const now = new Date();
    const due = new Date(task.due_date);
    const days = Math.ceil((due - now) / 86400000);
    if (days < 0) return "overdue";
    if (days <= 15) return "soon";
    return "normal";
  }

  function renderColumnCell(colKey, task, fieldList) {
    const urgency = dueUrgency(task);
    const isOverdue = urgency === "overdue";
    const isSoon = urgency === "soon";
    if (colKey === "priority")
      return (
        <span className="badge" style={getPriorityStyle(task.priority)}>
          {task.priority}
        </span>
      );
    if (colKey === "assignees") {
      const names = task.assignees?.length > 0 ? task.assignees : task.assignee ? [task.assignee] : [];
      const openAssign = (e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const MENU_H = 320;
        const openUp = window.innerHeight - r.bottom < MENU_H && r.top > MENU_H;
        setAssignSearch("");
        setAssignMenu({ taskId: task.id, x: r.left, y: openUp ? undefined : r.bottom + 4, bottom: openUp ? window.innerHeight - r.top + 4 : undefined, current: names });
      };
      if (names.length === 0) return assignAddButton(openAssign);
      return (
        <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={openAssign} title="Change assignees">
          {names.map((name, i) => (
            <span
              key={name}
              title={name}
              style={{
                width: 24, height: 24, borderRadius: "50%",
                background: avatarColor(name), color: "#fff",
                fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #fff", marginLeft: i === 0 ? 0 : -7,
                flexShrink: 0, letterSpacing: ".02em",
              }}
            >
              {initials(name)}
            </span>
          ))}
        </div>
      );
    }
    if (colKey === "due_date") {
      if (!task.due_date) return dateAddCell(task.due_date, (v) => setTaskDate(task.id, "due_date", v));
      const dueColor = isOverdue ? "#b91c1c" : isSoon ? "#b45309" : "#555";
      const dueBg = isOverdue ? "#fef2f2" : isSoon ? "#fffbeb" : "transparent";
      return (
        <span
          style={{
            fontSize: 12,
            color: dueColor,
            fontWeight: isOverdue || isSoon ? 600 : 400,
            background: dueBg,
            borderRadius: 6,
            padding: isOverdue || isSoon ? "2px 7px" : 0,
          }}
        >
          {isOverdue ? `⚠️ ${task.due_date}` : task.due_date}
        </span>
      );
    }
    if (colKey === "date_done")
      return (
        <span style={{ fontSize: 12, color: "#555" }}>
          {fmtDate(task.date_done)}
        </span>
      );
    if (colKey === "date_closed")
      return (
        <span style={{ fontSize: 12, color: "#555" }}>
          {fmtDate(task.date_closed)}
        </span>
      );
    if (colKey === "date_updated_manual")
      return (
        <span style={{ fontSize: 12, color: "#555" }}>
          {fmtDate(task.date_updated_manual)}
        </span>
      );
    if (colKey.startsWith("field_")) {
      const fieldId = colKey.replace("field_", "");
      const f = fieldList.find((ff) => ff.id === fieldId);
      if (!f) return "—";
      const fv = task.task_field_values?.find((v) => v.field_id === f.id);
      if (f.field_type === "formula")
        return (
          <span style={{ fontSize: 12, color: "#555" }}>
            {computeFormula(f, task, getFields(), activeSpace?.space_fields)}
          </span>
        );
      if (!fv?.value) {
        // Inline add affordance for empty date / username custom fields
        if (f.field_type === "date")
          return dateAddCell("", (v) => setTaskFieldValueInline(task.id, f.id, v));
        if (f.field_type === "username")
          return assignAddButton((e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            const MENU_H = 320;
            const openUp = window.innerHeight - r.bottom < MENU_H && r.top > MENU_H;
            setAssignSearch("");
            setAssignMenu({ taskId: task.id, fieldId: f.id, x: r.left, y: openUp ? undefined : r.bottom + 4, bottom: openUp ? window.innerHeight - r.top + 4 : undefined, current: [] });
          });
        return "—";
      }
      if (f.field_type === "dropdown")
        return (
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
        );
      if (f.field_type === "username")
        return (
          <span
            style={{
              background: members.some((m) => m.full_name === fv.value)
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
        );
      if (f.field_type === "date") {
        const parsed = parseFlexibleDate(fv.value);
        return <span style={{ fontSize: 12, color: "#555" }}>{parsed ? parsed.toISOString().slice(0, 10) : fv.value}</span>;
      }
      return <span style={{ fontSize: 12, color: "#555" }}>{fv.value}</span>;
    }
    return "—";
  }

  // Small circular status indicator shown before a task name (ClickUp-style):
  // filled+check = done, half-filled = in progress, dashed outline = to-do/other.
  function statusGlyph(status, colorOverride) {
    const color = colorOverride || getStatusColor(status);
    const s = (status || "").toLowerCase();
    if (isDoneStatus(status)) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" fill={color} />
          <path d="M7.5 12.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    if (s.includes("progress")) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.2" />
          <path d="M12 3 A9 9 0 0 1 12 21 Z" fill={color} />
        </svg>
      );
    }
    if (s.includes("cancel") || s.includes("discontinu") || s === "rejected" || s.includes("liquidation")) {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.2" />
          <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="3.2" strokeDasharray="2.6 2.8" strokeLinecap="round" />
      </svg>
    );
  }

  function renderTaskRow(task, statusList, fieldList, folderCtx = null, depth = 0) {
    const statusColor = folderCtx
      ? getStatusColorForFolder(task.status, folderCtx)
      : getStatusColor(task.status);
    const isActive = drawerTask?.id === task.id;
    const activeCols = getActiveColumns(fieldList);
    const gridTemplate = buildGridTemplate(fieldList, !!folderCtx);
    const kids = childrenByParent[task.id] || [];
    const hasKids = kids.length > 0;
    const subExpanded = expandedSubtasks[task.id];
    const prog = hasKids ? subtaskProgress(task.id) : null;
    const cellStyle = {
      display: "flex",
      alignItems: "center",
      padding: "10px 14px",
      borderBottom: "1px solid #f0f0f0",
      fontSize: 13,
      overflow: "hidden",
    };
    return (
      <Fragment key={task.id}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridTemplate,
          width: "max-content",
          minWidth: "100%",
          background: isActive ? "#f0f7ff" : undefined,
          cursor: "pointer",
        }}
        onClick={() => openDrawer(task)}
        className="task-grid-row"
      >
        <div
          className="task-name-cell"
          style={{
            ...cellStyle,
            paddingLeft: (folderCtx ? 32 : 14) + depth * 20,
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            position: "sticky",
            left: 0,
            zIndex: 1,
            background: isActive ? "#f0f7ff" : undefined,
            borderRight: "1px solid #f0f0f0",
            boxShadow: "2px 0 4px -2px rgba(0,0,0,0.06)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "100%" }}>
            <input
              type="checkbox"
              checked={selectedTaskIds.has(task.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSelectTask(task.id)}
              title="Select task"
              style={{ width: 14, height: 14, flexShrink: 0, cursor: "pointer" }}
            />
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (hasKids) setExpandedSubtasks((p) => ({ ...p, [task.id]: !p[task.id] }));
              }}
              style={{
                width: 14, flexShrink: 0, color: "#888", fontSize: 10,
                cursor: hasKids ? "pointer" : "default",
                visibility: hasKids ? "visible" : "hidden",
                userSelect: "none",
              }}
              title={hasKids ? (subExpanded ? "Collapse subtasks" : "Expand subtasks") : undefined}
            >
              {subExpanded ? "▼" : "▶"}
            </span>
            <span
              style={{ display: "inline-flex", flexShrink: 0, cursor: "pointer" }}
              title={`${task.status} — click to change`}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const MENU_H = 300;
                const openUp = window.innerHeight - r.bottom < MENU_H && r.top > MENU_H;
                setStatusMenu({
                  taskId: task.id,
                  // Resolve each status color with the same (folder-aware) logic
                  // the row uses, so list-scoped status colors show correctly.
                  statuses: statusList.map((s) => ({
                    name: s,
                    color: folderCtx ? getStatusColorForFolder(s, folderCtx) : getStatusColor(s),
                  })),
                  x: r.left,
                  y: openUp ? undefined : r.bottom + 4,
                  bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
                });
              }}
            >
              {statusGlyph(task.status, statusColor)}
            </span>
            <span
              style={{
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              {task.title}
            </span>
            {hasKids && (
              <span
                style={{
                  flexShrink: 0, fontSize: 10, fontWeight: 600,
                  color: prog.done === prog.total ? "#16a34a" : "#6b7280",
                  background: prog.done === prog.total ? "#dcfce7" : "#f0f0ef",
                  borderRadius: 20, padding: "1px 7px", whiteSpace: "nowrap",
                }}
                title="Subtask progress"
              >
                {prog.done}/{prog.total}
              </span>
            )}
            {taskMeta[task.id]?.attachmentCount > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 2, color: "#999", fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                {taskMeta[task.id].attachmentCount}
              </span>
            )}
            {taskMeta[task.id]?.checklistTotal > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 2, color: "#999", fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                  <polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/>
                </svg>
                {taskMeta[task.id].checklistChecked}/{taskMeta[task.id].checklistTotal}
              </span>
            )}
            {task.description && (
              <span
                style={{ display: "flex", alignItems: "center", color: descPopup?.taskId === task.id ? "#1d4ed8" : "#bbb", flexShrink: 0, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (descPopup?.taskId === task.id) { setDescPopup(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  const GAP = 8;
                  const POPUP_H = 300;
                  const spaceBelow = window.innerHeight - r.bottom - GAP;
                  const openUp = spaceBelow < POPUP_H && r.top > POPUP_H;
                  setDescPopup({
                    taskId: task.id,
                    desc: task.description,
                    x: r.left,
                    openUp,
                    anchorY: openUp
                      ? window.innerHeight - r.top + GAP
                      : r.bottom + GAP,
                  });
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
            )}
          </span>
          {task.updated_by && (
            <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
              ✎ {task.updated_by} · {timeAgo(task.updated_at)}
            </div>
          )}
        </div>
        {activeCols.map((c) => (
          <div key={c.key} style={cellStyle}>
            {renderColumnCell(c.key, task, fieldList)}
          </div>
        ))}
        <div style={cellStyle} onClick={(e) => e.stopPropagation()}>
          <select
            value={task.status}
            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 6px",
              width: "100%",
              borderRadius: 20,
              border: `1px solid ${statusColor}`,
              background: statusColor + "1f",
              color: statusColor,
              cursor: "pointer",
            }}
          >
            {statusList.map((s) => (
              <option key={s} value={s} style={{ color: "#333", background: "#fff" }}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div style={cellStyle} onClick={(e) => e.stopPropagation()}>
          {profile?.role === "admin" && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => deleteTask(task.id)}
              style={{ padding: "3px 8px", fontSize: 11 }}
            >
              🗑
            </button>
          )}
        </div>
      </div>
      {hasKids && subExpanded &&
        sortTasks(kids).map((child) =>
          renderTaskRow(child, statusList, fieldList, folderCtx, depth + 1),
        )}
      </Fragment>
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
          await refreshActiveListScoped();
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
      // Coerce to arrays — older entries may have stored comma-joined strings.
      const toArr = (v) => Array.isArray(v) ? v : v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : [];
      const oldA = toArr(change.from);
      const newA = toArr(change.to);
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
      {/* Bulk-action bar shown when tasks are selected */}
      {selectedTaskIds.size > 0 && createPortal(
        <div
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 99997, background: "#1f2937", color: "#fff", borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)", padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedTaskIds.size} selected</span>
          <div style={{ width: 1, height: 20, background: "#374151" }} />
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setBulkAssignSearch(""); setBulkAssignOpen((v) => !v); }}
              style={{ fontSize: 13, fontWeight: 600, background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
            >
              Assign ▾
            </button>
            {bulkAssignOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 1 }} onClick={() => setBulkAssignOpen(false)} />
                <div style={{ position: "absolute", bottom: "120%", left: 0, zIndex: 2, width: 240, maxHeight: 300, overflowY: "auto", background: "#fff", color: "#111", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: 8 }}>
                  <input
                    autoFocus
                    value={bulkAssignSearch}
                    onChange={(e) => setBulkAssignSearch(e.target.value)}
                    placeholder="Search people…"
                    style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, marginBottom: 6, boxSizing: "border-box" }}
                  />
                  {(() => {
                    const opts = [...new Set([...members.map((m) => m.full_name), ...tasks.flatMap((t) => taskAssigneeNames(t))].filter(Boolean))]
                      .filter((n) => n.toLowerCase().includes(bulkAssignSearch.toLowerCase()))
                      .sort((a, b) => a.localeCompare(b));
                    if (opts.length === 0) return <div style={{ fontSize: 12, color: "#bbb", padding: "6px 8px" }}>No people found</div>;
                    return opts.map((name) => (
                      <div
                        key={name}
                        onClick={() => bulkAssignTo(name)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f4"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(name), color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(name)}</span>
                        <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
          <button
            onClick={clearSelection}
            style={{ fontSize: 13, background: "none", color: "#cbd5e1", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        </div>,
        document.body,
      )}
      {/* Description hover popup — rendered into body via portal to escape any ancestor overflow/transform */}
      {assignMenu && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99998 }} onClick={() => setAssignMenu(null)} />
          <div
            style={{
              position: "fixed",
              left: Math.min(assignMenu.x, window.innerWidth - 260),
              ...(assignMenu.bottom != null ? { bottom: assignMenu.bottom } : { top: assignMenu.y }),
              width: 250, maxHeight: 320, overflowY: "auto",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 8, zIndex: 99999,
            }}
          >
            <input
              autoFocus
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder="Search people…"
              style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 6, marginBottom: 6, boxSizing: "border-box" }}
            />
            {(() => {
              const opts = [
                ...members.map((m) => m.full_name),
                ...tasks.flatMap((t) => taskAssigneeNames(t)),
              ];
              const uniq = [...new Set(opts.filter(Boolean))]
                .filter((n) => n.toLowerCase().includes(assignSearch.toLowerCase()))
                .sort((a, b) => a.localeCompare(b));
              if (uniq.length === 0) return <div style={{ fontSize: 12, color: "#bbb", padding: "6px 8px" }}>No people found</div>;
              return uniq.map((name) => {
                const selected = assignMenu.current.includes(name);
                return (
                  <div
                    key={name}
                    onClick={() => {
                      if (assignMenu.fieldId) {
                        setTaskFieldValueInline(assignMenu.taskId, assignMenu.fieldId, name);
                        setAssignMenu(null);
                      } else {
                        const next = selected
                          ? assignMenu.current.filter((n) => n !== name)
                          : [...assignMenu.current, name];
                        setTaskAssignees(assignMenu.taskId, next);
                        setAssignMenu((m) => ({ ...m, current: next }));
                      }
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: selected ? "#f0f7ff" : "transparent" }}
                    onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "#f5f5f4"; }}
                    onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(name), color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(name)}
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
                    {selected && <span style={{ color: "#1d4ed8", fontSize: 13 }}>✓</span>}
                  </div>
                );
              });
            })()}
          </div>
        </>,
        document.body,
      )}
      {statusMenu && createPortal(
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99998 }}
            onClick={() => setStatusMenu(null)}
          />
          <div
            style={{
              position: "fixed",
              left: Math.min(statusMenu.x, window.innerWidth - 240),
              ...(statusMenu.bottom != null ? { bottom: statusMenu.bottom } : { top: statusMenu.y }),
              width: 220,
              maxHeight: 300,
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
              padding: 6,
              zIndex: 99999,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".04em", padding: "4px 8px 6px" }}>
              Set status
            </div>
            {statusMenu.statuses.map(({ name: s, color: c }) => {
              const cur = tasks.find((t) => t.id === statusMenu.taskId)?.status === s;
              return (
                <div
                  key={s}
                  onClick={() => { updateTaskStatus(statusMenu.taskId, s); setStatusMenu(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 8px", borderRadius: 6, cursor: "pointer",
                    background: cur ? "#f0f7ff" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (!cur) e.currentTarget.style.background = "#f5f5f4"; }}
                  onMouseLeave={(e) => { if (!cur) e.currentTarget.style.background = "transparent"; }}
                >
                  {statusGlyph(s, c)}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: cur ? 600 : 400, color: "#333" }}>{s}</span>
                  {cur && <span style={{ color: "#1d4ed8", fontSize: 13 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </>,
        document.body,
      )}
      {descPopup && createPortal(
        <>
          {/* Click-outside backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99998 }}
            onClick={() => setDescPopup(null)}
          />
          <div
          style={{
            position: "fixed",
            ...(descPopup.openUp
              ? { bottom: descPopup.anchorY }
              : { top: descPopup.anchorY }),
            left: Math.min(descPopup.x, window.innerWidth - 360),
            width: 340,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
            zIndex: 99999,
            // No overflow:hidden here — it would clip the inner scrollbar
          }}
        >
          <div
            className="task-desc-popup"
            style={{
              maxHeight: 300,
              overflowY: "auto",
              padding: "14px 16px",
              fontSize: 13,
              lineHeight: 1.7,
              color: "#333",
              boxSizing: "border-box",
              borderRadius: 10,  // match outer so content respects rounded corners
            }}
            dangerouslySetInnerHTML={{ __html: normalizeDesc(descPopup.desc) }}
          />
        </div>
        </>,
        document.body
      )}
      {/* MAIN PANEL */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
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
                {activeList ? ` / ${activeList.name}` : ""}
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
            <button className="btn btn-sm" onClick={() => setShowExportModal(true)}>
              ⬇ Export CSV
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
              {showColumnPicker && (() => {
                const fieldList = getFields();
                const fieldKeys = fieldList.map((f) => `field_${f.id}`);
                // Use ALL space fields for label lookup so keys merged into
                // columnOrder from other scopes still show their real name.
                const allSpaceFields = activeSpace?.space_fields || [];
                const allColMap = {
                  priority: "Priority",
                  assignees: "Assignees",
                  due_date: "Due date",
                  date_done: "Date Done",
                  date_closed: "Date Closed",
                  date_updated_manual: "Date Updated",
                  ...Object.fromEntries(allSpaceFields.map((f) => [`field_${f.id}`, f.field_name])),
                };
                // Only keep columnOrder entries valid in the current scope
                // (built-in columns + this scope's own custom fields) so
                // fields from other lists/folders don't leak into this panel.
                const validKeys = new Set([
                  "priority", "assignees", "due_date", "date_done", "date_closed", "date_updated_manual",
                  ...fieldKeys,
                ]);
                const fullOrder = [
                  ...columnOrder.filter((k) => validKeys.has(k)),
                  ...fieldKeys.filter((k) => !columnOrder.includes(k)),
                ];
                return (
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
                      minWidth: 220,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".04em" }}>
                        Columns
                      </span>
                      {viewSaved ? (
                        <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Saved for everyone</span>
                      ) : (
                        <button
                          onClick={publishView}
                          disabled={!viewDirty}
                          title={viewDirty ? "Save this column layout as the shared view for all users" : "No unsaved changes"}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                            border: "1px solid " + (viewDirty ? "#1d4ed8" : "#e5e7eb"),
                            background: viewDirty ? "#1d4ed8" : "#f3f4f6",
                            color: viewDirty ? "#fff" : "#9ca3af",
                            cursor: viewDirty ? "pointer" : "default",
                          }}
                        >
                          Save view
                        </button>
                      )}
                    </div>
                    {viewDirty && (
                      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8 }}>
                        Unsaved changes — visible only to you until you Save view.
                      </div>
                    )}
                    {(() => {
                      const checkedKeys = fullOrder.filter((k) => visibleColumns.includes(k));
                      const uncheckedKeys = fullOrder.filter((k) => !visibleColumns.includes(k));
                      const renderRow = (key, isChecked, idxInSection, sectionLen) => (
                        <div
                          key={key}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
                            opacity: isChecked ? 1 : 0.55,
                          }}
                        >
                          <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer", fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // move key to end of checked section in columnOrder
                                  const newOrder = [
                                    ...checkedKeys,
                                    key,
                                    ...uncheckedKeys.filter((k) => k !== key),
                                  ];
                                  setColumnOrder(newOrder);
                                  const nextVisible = [...visibleColumns, key];
                                  setVisibleColumns(nextVisible);
                                  saveViewConfig(newOrder, nextVisible, undefined);
                                } else {
                                  // move key to start of unchecked section
                                  const newOrder = [
                                    ...checkedKeys.filter((k) => k !== key),
                                    key,
                                    ...uncheckedKeys,
                                  ];
                                  setColumnOrder(newOrder);
                                  const nextVisible = visibleColumns.filter((c) => c !== key);
                                  setVisibleColumns(nextVisible);
                                  saveViewConfig(newOrder, nextVisible, undefined);
                                }
                              }}
                              style={{ width: 14, height: 14, cursor: "pointer" }}
                            />
                            {allColMap[key] || key}
                          </label>
                          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <button
                              disabled={!isChecked || idxInSection === 0}
                              onClick={() => isChecked && moveColumnOrder(key, "up")}
                              title={isChecked ? "Move up" : undefined}
                              style={{
                                background: "none", border: "none", padding: "0 2px",
                                cursor: isChecked && idxInSection > 0 ? "pointer" : "default",
                                color: isChecked && idxInSection > 0 ? "#666" : "#ccc", fontSize: 10, lineHeight: 1,
                              }}
                            >▲</button>
                            <button
                              disabled={!isChecked || idxInSection === sectionLen - 1}
                              onClick={() => isChecked && moveColumnOrder(key, "down")}
                              title={isChecked ? "Move down" : undefined}
                              style={{
                                background: "none", border: "none", padding: "0 2px",
                                cursor: isChecked && idxInSection < sectionLen - 1 ? "pointer" : "default",
                                color: isChecked && idxInSection < sectionLen - 1 ? "#666" : "#ccc", fontSize: 10, lineHeight: 1,
                              }}
                            >▼</button>
                          </div>
                        </div>
                      );
                      return (
                        <>
                          {checkedKeys.map((key, i) => renderRow(key, true, i, checkedKeys.length))}
                          {uncheckedKeys.length > 0 && checkedKeys.length > 0 && (
                            <div style={{ borderTop: "1px solid #f0f0f0", margin: "6px 0" }} />
                          )}
                          {uncheckedKeys.map((key, i) => renderRow(key, false, i, uncheckedKeys.length))}
                        </>
                      );
                    })()}
                    <div style={{ borderTop: "1px solid #e8e8e8", marginTop: 8, paddingTop: 8, display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11 }}
                        onClick={() => {
                          setColumnOrder(DEFAULT_COLUMN_ORDER);
                          updateVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
                          saveViewConfig(DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS, undefined);
                        }}
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
                );
              })()}
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
              <option value="none">Group by: None</option>
            </select>
            <div className="filter-panel-wrap" style={{ position: "relative" }}>
              <button
                className="toolbar-btn"
                onClick={() => setShowFilterPanel((v) => { if (!v) setDraftTree(filterTree); return !v; })}
                style={filterCount > 0 ? { color: "#1d4ed8", fontWeight: 600, borderColor: "#bfdbfe", background: "#eff6ff" } : undefined}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px", marginRight: 4 }}>
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filter{filterCount > 0 ? ` (${filterCount})` : ""}
              </button>
              {showFilterPanel && (
                <div
                  style={{
                    position: "absolute", top: "110%", right: 0, zIndex: 60,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14, width: 520,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Filters</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                      <button onClick={() => setShowSavedMenu((v) => !v)} style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
                        Saved filters ▾
                      </button>
                      {showSavedMenu && (
                        <div style={{ position: "absolute", top: "110%", right: 0, zIndex: 70, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, minWidth: 200 }}>
                          <button onClick={saveCurrentFilter} disabled={filterCount === 0} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12, padding: "6px 8px", border: "none", background: "none", cursor: filterCount === 0 ? "default" : "pointer", color: filterCount === 0 ? "#c0c0c0" : "#1d4ed8", fontWeight: 600 }}>
                            + Save current filter
                          </button>
                          {savedFilters.length > 0 && <div style={{ borderTop: "1px solid #f0f0ef", margin: "4px 0" }} />}
                          {savedFilters.length === 0 && (
                            <div style={{ fontSize: 11, color: "#bbb", padding: "6px 8px" }}>No saved filters</div>
                          )}
                          {savedFilters.map((s) => (
                            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 6 }}>
                              <span onClick={() => loadSavedFilter(s)} style={{ flex: 1, fontSize: 12, cursor: "pointer" }}>{s.name}</span>
                              <button onClick={() => deleteSavedFilter(s.name)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>🗑</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setShowFilterPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16 }}>×</button>
                    </div>
                  </div>
                  {draftCount === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
                      Add conditions below. Use <strong>nested filters</strong> and <strong>AND/OR</strong> to build complex rules.
                    </div>
                  )}
                  {renderFilterGroup(draftTree, 0)}
                  {draftCount > 0 && (
                    <div style={{ marginTop: 12, padding: "8px 10px", background: "#f5f7fb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>
                        Matches tasks where
                      </div>
                      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, wordBreak: "break-word" }}>
                        {filterExpression(draftTree)}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                        AND is evaluated before OR; use nested filters for other groupings.
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: 12, color: draftCount > 0 || filterCount > 0 ? "#ef4444" : "#c0c0c0", borderColor: "#fca5a5" }}
                      onClick={clearFilters}
                      disabled={draftCount === 0 && filterCount === 0}
                    >
                      Clear all
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: 12, opacity: draftDirty ? 1 : 0.6 }}
                      onClick={applyFilters}
                      disabled={!draftDirty}
                    >
                      {draftDirty ? "Apply filter" : "Applied"}
                    </button>
                  </div>
                </div>
              )}
            </div>
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
            <div className={activeFolder ? undefined : "task-table-scroll"}>
              <div style={activeFolder ? undefined : { width: "max-content", minWidth: "100%" }}>
                {activeSpace && !activeFolder ? (
                  <div>
                    {(activeSpace.folders || []).map((folder) => {
                      const folderTasks = tasks.filter(
                        (t) => t.folder_id === folder.id && !t.parent_task_id && passesFilters(t),
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
                              ? groupByAssignees(filteredFolderTasks)
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
                          {isExpanded && (() => {
                            const folderListItems = spaceLists.filter((l) => l.folder_id === folder.id);
                            // If folder has lists, render each list as a sub-section
                            if (folderListItems.length > 0) {
                              return (
                                <div style={{ padding: "8px 0" }}>
                                  {folderListItems.map((list) => {
                                    const listTasks = filteredFolderTasks.filter((t) => t.list_id === list.id);
                                    const listKey = `list_${list.id}`;
                                    const listExpanded = expandedGroups[listKey] !== false;
                                    const listGroupedRaw = groupBy === "status"
                                      ? folderStatusList.reduce((acc, s) => { acc[s] = listTasks.filter((t) => t.status === s); return acc; }, {})
                                      : groupBy === "priority"
                                        ? ["High", "Medium", "Low"].reduce((acc, p) => { acc[p] = listTasks.filter((t) => t.priority === p); return acc; }, {})
                                        : groupBy === "assignee"
                                          ? groupByAssignees(listTasks)
                                          : { "All tasks": listTasks };
                                    const listGrouped = Object.fromEntries(Object.entries(listGroupedRaw).map(([k, v]) => [k, sortTasks(v)]));
                                    return (
                                      <div key={list.id} style={{ marginBottom: 12, borderTop: "1px solid #f0f0ef" }}>
                                        {/* List sub-header */}
                                        <div
                                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", cursor: "pointer", background: "#fafaf9" }}
                                          onClick={() => setExpandedGroups((p) => ({ ...p, [listKey]: !listExpanded }))}
                                        >
                                          <span style={{ fontSize: 10, color: "#aaa" }}>{listExpanded ? "▾" : "▸"}</span>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                                            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                          </svg>
                                          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: "#374151" }}>{list.name}</span>
                                          <span style={{ fontSize: 11, color: "#aaa", background: "#f0f0ef", borderRadius: 20, padding: "1px 8px" }}>{listTasks.length} tasks</span>
                                        </div>
                                        {listExpanded && (
                                          <div>
                                            {listTasks.length === 0 ? (
                                              emptyState({ title: "No tasks in this list", compact: true })
                                            ) : (
                                              Object.entries(listGrouped).map(([groupName, groupTasks]) => {
                                                if (groupTasks.length === 0) return null;
                                                const groupKey = `${list.id}_${groupName}`;
                                                const groupExpanded = expandedGroups[groupKey] !== false;
                                                const groupColor = groupBy === "status" ? getStatusColorForFolder(groupName, folder) : "#f0f0ef";
                                                return (
                                                  <div key={groupName} style={{ marginBottom: 4 }}>
                                                    <div
                                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", cursor: "pointer" }}
                                                      onClick={() => setExpandedGroups((p) => ({ ...p, [groupKey]: !groupExpanded }))}
                                                    >
                                                      <span style={{ fontSize: 10, color: "#aaa" }}>{groupExpanded ? "▾" : "▸"}</span>
                                                      <span style={{ background: groupColor, color: groupBy === "status" ? "#fff" : "#333", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{groupName}</span>
                                                      <span style={{ fontSize: 12, color: "#aaa" }}>{groupTasks.length}</span>
                                                    </div>
                                                    {groupExpanded && (
                                                      <div style={{ marginBottom: 4 }}>
                                                        {renderTableHead(folderFieldList, true, groupTasks.map((t) => t.id))}
                                                        {groupTasks.map((task) => renderTaskRow(task, folderStatusList, folderFieldList, folder))}
                                                      </div>
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
                                  {/* Tasks in folder but not in any list */}
                                  {(() => {
                                    const unlistedTasks = filteredFolderTasks.filter((t) => !t.list_id);
                                    if (unlistedTasks.length === 0) return null;
                                    const ulKey = `unlisted_${folder.id}`;
                                    const ulExpanded = expandedGroups[ulKey] !== false;
                                    return (
                                      <div style={{ marginBottom: 4, borderTop: "1px solid #f0f0ef" }}>
                                        <div
                                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", cursor: "pointer", background: "#fafaf9" }}
                                          onClick={() => setExpandedGroups((p) => ({ ...p, [ulKey]: !ulExpanded }))}
                                        >
                                          <span style={{ fontSize: 10, color: "#aaa" }}>{ulExpanded ? "▾" : "▸"}</span>
                                          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: "#9ca3af" }}>No list</span>
                                          <span style={{ fontSize: 11, color: "#aaa", background: "#f0f0ef", borderRadius: 20, padding: "1px 8px" }}>{unlistedTasks.length} tasks</span>
                                        </div>
                                        {ulExpanded && (
                                          <div>
                                            {renderTableHead(folderFieldList, true, unlistedTasks.map((t) => t.id))}
                                            {sortTasks(unlistedTasks).map((task) => renderTaskRow(task, folderStatusList, folderFieldList, folder))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            }
                            // No lists — original flat rendering
                            return (
                              <div style={{ padding: "8px 0" }}>
                                {filteredFolderTasks.length === 0 ? (
                                  emptyState({ title: "No tasks in this folder", compact: true })
                                ) : (
                                  Object.entries(grouped).map(([groupName, groupTasks]) => {
                                    if (groupTasks.length === 0) return null;
                                    const groupKey = `${folder.id}_${groupName}`;
                                    const groupExpanded = expandedGroups[groupKey] !== false;
                                    const groupColor = groupBy === "status" ? getStatusColorForFolder(groupName, folder) : "#f0f0ef";
                                    return (
                                      <div key={groupName} style={{ marginBottom: 4 }}>
                                        <div
                                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", cursor: "pointer" }}
                                          onClick={() => setExpandedGroups((p) => ({ ...p, [groupKey]: !groupExpanded }))}
                                        >
                                          <span style={{ fontSize: 10, color: "#aaa" }}>{groupExpanded ? "▾" : "▸"}</span>
                                          <span style={{ background: groupColor, color: groupBy === "status" ? "#fff" : "#333", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{groupName}</span>
                                          <span style={{ fontSize: 12, color: "#aaa" }}>{groupTasks.length}</span>
                                        </div>
                                        {groupExpanded && (
                                          <div style={{ marginBottom: 4 }}>
                                            {renderTableHead(folderFieldList, true, groupTasks.map((t) => t.id))}
                                            {groupTasks.map((task) => renderTaskRow(task, folderStatusList, folderFieldList, folder))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    {(() => {
                      const nft = sortTasks(tasks.filter((t) => !t.folder_id && !t.parent_task_id && passesFilters(t)));
                      if (nft.length === 0) return null;
                      return (
                        <div
                          style={{
                            background: "#fff",
                            border: "1px solid #e8e8e8",
                            borderRadius: 8,
                            marginBottom: 16,
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
                          <div>
                            {renderTableHead(getFields(), false, nft.map((t) => t.id))}
                            {nft.map((task) =>
                              renderTaskRow(task, getStatuses(), getFields()),
                            )}
                          </div>
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
                          <div style={{ fontSize: 32, marginBottom: 8 }}>
                            📋
                          </div>
                          <div style={{ fontSize: 14, marginBottom: 4 }}>
                            No folders yet
                          </div>
                          <div style={{ fontSize: 12 }}>
                            Add a folder from the sidebar to organise your tasks
                          </div>
                        </div>
                      )}
                  </div>
                ) : (() => {
                  // If viewing a folder that has lists, show list sub-sections
                  const folderListItems = activeFolder && !activeList
                    ? spaceLists.filter((l) => l.folder_id === activeFolder.id)
                    : [];

                  if (folderListItems.length > 0) {
                    const folderStatusList = getFolderStatuses(activeFolder);
                    const folderFieldList = getFields();
                    return (
                      <div>
                        {folderListItems.map((list) => {
                          const listTasks = tasks.filter((t) => t.list_id === list.id && !t.parent_task_id && passesFilters(t));
                          const filteredListTasks = listTasks.filter((t) => {
                            if (statusFilter !== "all" && t.status !== statusFilter) return false;
                            if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
                            return true;
                          });
                          const listKey = `flv_${list.id}`;
                          const listExpanded = expandedGroups[listKey] !== false;
                          const thisListStatuses = getStatusesForList(list.id);
                          const listGroupedRaw = groupBy === "status"
                            ? thisListStatuses.reduce((acc, s) => { acc[s] = filteredListTasks.filter((t) => t.status === s); return acc; }, {})
                            : groupBy === "priority"
                              ? ["High", "Medium", "Low"].reduce((acc, p) => { acc[p] = filteredListTasks.filter((t) => t.priority === p); return acc; }, {})
                              : groupBy === "assignee"
                                ? groupByAssignees(filteredListTasks)
                                : { "All tasks": filteredListTasks };
                          const listGrouped = Object.fromEntries(Object.entries(listGroupedRaw).map(([k, v]) => [k, sortTasks(v)]));

                          return (
                            <div key={list.id} style={{ marginBottom: 16 }}>
                              {/* List section header */}
                              <div
                                className="status-group-header"
                                onClick={() => setExpandedGroups((p) => ({ ...p, [listKey]: !listExpanded }))}
                              >
                                <span style={{ fontSize: 10 }}>{listExpanded ? "▾" : "▸"}</span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                                  <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{list.name}</span>
                                <span style={{ fontSize: 12, color: "#aaa" }}>{folderListCounts[list.id] ?? filteredListTasks.length}</span>
                              </div>
                              {listExpanded && (
                                <div>
                                  {Object.entries(listGrouped).map(([groupName, groupTasks]) => {
                                    if (groupTasks.length === 0) return null;
                                    const groupKey = `flv_${list.id}_${groupName}`;
                                    const groupExpanded = expandedGroups[groupKey] !== false;
                                    const groupColor = groupBy === "status" ? getStatusColorForFolder(groupName, activeFolder) : "#f0f0ef";
                                    return (
                                      <div key={groupName} style={{ marginBottom: 4, paddingLeft: 8 }}>
                                        <div
                                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", position: "sticky", left: 0, top: 38, width: "fit-content", zIndex: 2, background: "#f7f8fa", borderRadius: 7 }}
                                          onClick={() => setExpandedGroups((p) => ({ ...p, [groupKey]: !groupExpanded }))}
                                        >
                                          <span style={{ fontSize: 10, color: "#aaa" }}>{groupExpanded ? "▾" : "▸"}</span>
                                          <span style={{ background: groupColor, color: groupBy === "status" ? "#fff" : "#333", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{groupName}</span>
                                          <span style={{ fontSize: 12, color: "#aaa" }}>{groupTasks.length}</span>
                                        </div>
                                        {groupExpanded && (
                                          <div className="task-table-scroll" style={{ marginTop: 4 }}>
                                            <div style={{ width: "max-content", minWidth: "100%" }}>
                                              <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8 }}>
                                                {renderTableHead(folderFieldList, false, groupTasks.map((t) => t.id))}
                                                {groupTasks.map((task) => renderTaskRow(task, folderStatusList, folderFieldList, activeFolder))}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {filteredListTasks.length === 0 && (
                                    emptyState({ title: "No tasks in this list", compact: true })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* Tasks in folder not assigned to any list */}
                        {(() => {
                          const unlistedTasks = sortTasks(tasks.filter((t) => !t.list_id && !t.parent_task_id && passesFilters(t)).filter((t) => {
                            if (statusFilter !== "all" && t.status !== statusFilter) return false;
                            if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
                            return true;
                          }));
                          if (unlistedTasks.length === 0) return null;
                          const ulKey = "flv_unlisted";
                          const ulExpanded = expandedGroups[ulKey] !== false;
                          return (
                            <div style={{ marginBottom: 16 }}>
                              <div className="status-group-header" onClick={() => setExpandedGroups((p) => ({ ...p, [ulKey]: !ulExpanded }))}>
                                <span style={{ fontSize: 10 }}>{ulExpanded ? "▾" : "▸"}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>No list</span>
                                <span style={{ fontSize: 12, color: "#aaa" }}>{unlistedTasks.length}</span>
                              </div>
                              {ulExpanded && (
                                <div className="task-table-scroll" style={{ marginTop: 4 }}>
                                  <div style={{ width: "max-content", minWidth: "100%" }}>
                                    <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8 }}>
                                      {renderTableHead(getFolderFields(activeFolder), false, unlistedTasks.map((t) => t.id))}
                                      {unlistedTasks.map((task) => renderTaskRow(task, getFolderStatuses(activeFolder), getFolderFields(activeFolder), activeFolder))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }

                  // No lists in folder (or viewing a list directly) — original grouped view
                  return (
                  <div>
                    {Object.entries(getGroupedTasks()).map(
                      ([groupName, groupTasks]) => {
                        const isExpanded = expandedGroups[groupName] !== false;
                        const hideHeader = groupBy === "none";
                        return (
                          <div key={groupName} style={{ marginBottom: 16 }}>
                            {!hideHeader && (
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
                                {groupBy === "status" ? (listStatusCounts[groupName] ?? groupTasks.length) : groupTasks.length}
                              </span>
                            </div>
                            )}
                            {(hideHeader || isExpanded) && groupTasks.length > 0 && (
                              <div className="task-table-scroll" style={{ marginTop: 4 }}>
                                <div style={{ width: "max-content", minWidth: "100%" }}>
                                  <div
                                    style={{
                                      background: "#fff",
                                      border: "1px solid #e8e8e8",
                                      borderRadius: 8,
                                    }}
                                  >
                                    {renderTableHead(getFields(), false, groupTasks.map((t) => t.id))}
                                    {groupTasks.map((task) =>
                                      renderTaskRow(
                                        task,
                                        getStatuses(),
                                        getFields(),
                                      ),
                                    )}
                                  </div>
                                </div>
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
                  );
                })()}
                {activeList && (listHasMore || loadingMore) && (
                  <div ref={loadSentinelRef} style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "#aaa" }}>
                    {loadingMore ? "Loading more…" : ""}
                  </div>
                )}
              </div>
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
          {tasks.length === 0 && emptyState({
            title: "No tasks yet",
            subtitle: "Create your first task to get started.",
          })}
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
              {
                key: "subtasks",
                label: (() => {
                  const n = (childrenByParent[drawerTask.id] || []).length;
                  return n > 0 ? `Subtasks (${n})` : "Subtasks";
                })(),
              },
              { key: "comments", label: `Comments${comments.length > 0 ? ` (${comments.length})` : ""}` },
              { key: "history", label: "History" },
              {
                key: "attachments",
                label: `Attachments${attachments.length > 0 ? ` (${attachments.length})` : ""}`,
              },
              {
                key: "checklist",
                label: (() => {
                  const { total, done } = totalChecklistProgress(checklists);
                  return total > 0
                    ? `Checklist (${done}/${total})`
                    : "Checklist";
                })(),
              },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setDrawerTab(tab.key);
                  if (tab.key === "history") fetchTaskHistory(drawerTask.id);
                  if (tab.key === "comments") fetchComments(drawerTask.id);
                  if (tab.key === "attachments") { fetchAttachments(drawerTask.id); fetchLinkedDocs(drawerTask.id); fetchAllWikiArticles(); }
                  if (tab.key === "checklist") fetchChecklists(drawerTask.id);
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
                      const rawVal = drawerFieldValues[field.id] || "";
                      // For date inputs, convert stored value to YYYY-MM-DD
                      let val = rawVal;
                      if (field.field_type === "date" && rawVal) {
                        const parsed = parseFlexibleDate(rawVal);
                        if (parsed) {
                          val = parsed.toISOString().slice(0, 10);
                        }
                      }
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
                              <span style={{ fontSize: 13, color: "#333" }}>
                                {computeFormula(field, drawerTask, drawerFields, activeSpace?.space_fields)}
                              </span>
                              <span style={{ fontSize: 11, color: "#aaa" }}>
                                {describeFormula(field)}
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
                  <TaskDescEditor
                    value={dDesc}
                    onChange={(html) =>
                      setDrawerEdits((p) => ({ ...p, description: html }))
                    }
                  />
                </div>

                <div
                  style={{
                    borderTop: "1px solid #f0f0f0",
                    paddingTop: 16,
                    marginTop: 8,
                  }}
                >
                  {profile?.role === "admin" && (
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
                  )}
                </div>
              </div>
            )}

            {/* SUBTASKS TAB */}
            {drawerTab === "subtasks" && (
              <div style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
                  Subtasks are full tasks linked to this one — each has its own
                  status, assignee, and fields.
                </div>
                {(() => {
                  const kids = sortTasks(childrenByParent[drawerTask.id] || []);
                  const parentStatuses = drawerTask.list_id
                    ? getStatusesForList(drawerTask.list_id)
                    : getStatuses();
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {kids.length === 0 && (
                        <div style={{ fontSize: 13, color: "#bbb", padding: "8px 0" }}>
                          No subtasks yet.
                        </div>
                      )}
                      {kids.map((child, i) => {
                        const cp = subtaskProgress(child.id);
                        const cColor = getStatusColor(child.status);
                        const assignees = child.assignees?.length
                          ? child.assignees
                          : child.assignee
                            ? [child.assignee]
                            : [];
                        return (
                          <div
                            key={child.id}
                            style={{
                              padding: "10px 12px", border: "1px solid #e8e8e8",
                              borderRadius: 8, background: "#fff",
                            }}
                          >
                            {/* Row 1: index + title + open + delete */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#c0c0c0", fontWeight: 600, flexShrink: 0, width: 18 }}>
                                {i + 1}.
                              </span>
                              <span
                                onClick={() => openDrawer(child)}
                                style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1f2937", cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                title="Open subtask"
                              >
                                {child.title}
                              </span>
                              {cp.total > 0 && (
                                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, color: cp.done === cp.total ? "#16a34a" : "#6b7280", background: cp.done === cp.total ? "#dcfce7" : "#f0f0ef", borderRadius: 20, padding: "1px 7px" }} title="Subtask progress">
                                  {cp.done}/{cp.total}
                                </span>
                              )}
                              <button
                                onClick={() => openDrawer(child)}
                                title="Open subtask"
                                style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 14, padding: "0 2px" }}
                              >
                                ↗
                              </button>
                              {profile?.role === "admin" && (
                                <button
                                  onClick={() => deleteTask(child.id)}
                                  title="Delete subtask"
                                  style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 13, padding: "0 2px" }}
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                            {/* Row 2: status dropdown + assignees */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 26, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cColor, flexShrink: 0 }} />
                                <select
                                  value={child.status}
                                  onChange={(e) => updateTaskStatus(child.id, e.target.value)}
                                  style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #e0e0e0", color: cColor, fontWeight: 500, maxWidth: 150 }}
                                >
                                  {parentStatuses.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </span>
                              {assignees.length > 0 ? (
                                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                                  {assignees.map((a) => (
                                    <span key={a} style={{ fontSize: 10, background: "#eff6ff", color: "#1d4ed8", borderRadius: 20, padding: "1px 8px" }}>
                                      {a}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: "#c0c0c0" }}>Unassigned</span>
                              )}
                              {child.due_date && (
                                <span style={{ fontSize: 11, color: "#9ca3af" }}>· due {child.due_date}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <input
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") createSubtask(drawerTask); }}
                          placeholder="Add a subtask (e.g. child company)…"
                          style={{ flex: 1, fontSize: 13, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => createSubtask(drawerTask)}
                          disabled={!newSubtaskTitle.trim()}
                          style={{ fontSize: 12 }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  );
                })()}
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

            {/* ATTACHMENTS TAB */}
            {drawerTab === "attachments" && (
              <div style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}>
                {/* Upload area */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = "#1d4ed8";
                    e.currentTarget.style.background = "#eff6ff";
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.background = "#fafaf9";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.background = "#fafaf9";
                    const file = e.dataTransfer.files[0];
                    if (file) uploadAttachment(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: "2px dashed #e0e0e0",
                    borderRadius: 10,
                    padding: "20px 16px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: "#fafaf9",
                    marginBottom: 16,
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAttachment(file);
                      e.target.value = "";
                    }}
                  />
                  {uploadingFile ? (
                    <div style={{ fontSize: 13, color: "#1d4ed8" }}>
                      Uploading...
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>📎</div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#555",
                          marginBottom: 2,
                        }}
                      >
                        Drop a file here or click to upload
                      </div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>
                        Any file type · Max 50 MB
                      </div>
                    </>
                  )}
                </div>

                {/* Attachment list */}
                {attachmentsLoading ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#aaa",
                      textAlign: "center",
                      padding: "12px 0",
                    }}
                  >
                    Loading attachments...
                  </div>
                ) : attachments.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#aaa",
                      textAlign: "center",
                      padding: "12px 0",
                    }}
                  >
                    No attachments yet
                  </div>
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          background: "#fafaf9",
                          border: "1px solid #e8e8e8",
                          borderRadius: 8,
                        }}
                      >
                        <span style={{ fontSize: 20, flexShrink: 0 }}>
                          {fileIcon(att.file_type)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#333",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {att.file_name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#aaa",
                              marginTop: 1,
                            }}
                          >
                            {formatFileSize(att.file_size)}
                            {att.uploaded_by ? ` · ${att.uploaded_by}` : ""}
                            {att.uploaded_at
                              ? ` · ${timeAgo(att.uploaded_at)}`
                              : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadAttachment(att)}
                          title="Download"
                          style={{
                            background: "#eff6ff",
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 8px",
                            cursor: "pointer",
                            fontSize: 14,
                            color: "#1d4ed8",
                            flexShrink: 0,
                          }}
                        >
                          ⬇
                        </button>
                        <button
                          onClick={() => deleteAttachment(att)}
                          title="Delete"
                          style={{
                            background: "#fef2f2",
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 8px",
                            cursor: "pointer",
                            fontSize: 14,
                            color: "#b91c1c",
                            flexShrink: 0,
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Linked wiki pages */}
                <div style={{ marginTop: 20, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                    Linked Pages
                  </div>
                  {linkedDocsLoading ? (
                    <div style={{ fontSize: 12, color: "#aaa" }}>Loading…</div>
                  ) : (
                    <>
                      {linkedDocs.map((link) => {
                        const art = link.wiki_articles;
                        const catName = art?.wiki_categories?.name;
                        return (
                          <div key={link.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #f0f0f0", marginBottom: 6, background: "#fafaf9" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: 12, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{art?.title}</div>
                              {catName && <div style={{ fontSize: 11, color: "#aaa" }}>{catName}</div>}
                            </div>
                            <button onClick={() => unlinkDoc(link.id)} title="Remove" style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0 }}
                              onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                              onMouseLeave={(e) => e.currentTarget.style.color = "#ccc"}
                            >×</button>
                          </div>
                        );
                      })}
                      {showDocPicker && (
                        <div style={{ border: "1.5px solid #e0e0e0", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ padding: "6px 10px", borderBottom: "1px solid #f0f0f0", background: "#fafaf9" }}>
                            <input autoFocus value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Search wiki pages…"
                              style={{ width: "100%", border: "none", outline: "none", fontSize: 12, background: "transparent", color: "#333" }} />
                          </div>
                          <div style={{ maxHeight: 200, overflowY: "auto" }}>
                            {(() => {
                              const q = docSearch.toLowerCase();
                              const filtered = allWikiArticles.filter((a) => !linkedDocs.find((l) => l.article_id === a.id) && (!q || a.title.toLowerCase().includes(q)));
                              if (!filtered.length) return <div style={{ padding: "10px 12px", fontSize: 12, color: "#aaa" }}>No pages found</div>;
                              return filtered.map((art) => {
                                const cat = allWikiCategories.find((c) => c.id === art.category_id);
                                return (
                                  <div key={art.id} onClick={() => linkDocToTask(art)}
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f7f7f7" }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "#f0f4ff"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: 12, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{art.title}</div>
                                      {cat && <div style={{ fontSize: 11, color: "#aaa" }}>{cat.name}</div>}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}
                      <button onClick={() => { setShowDocPicker((v) => !v); setDocSearch(""); }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, border: "1px dashed #d0d0d0", background: "#fafaf9", color: "#888", fontSize: 12, cursor: "pointer", width: "100%", fontWeight: 500 }}>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                        {showDocPicker ? "Cancel" : "Link a wiki page"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CHECKLIST TAB */}
            {drawerTab === "comments" && (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                {/* Comment list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {commentsLoading ? (
                    <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 24 }}>Loading comments...</div>
                  ) : comments.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: "#bbb" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                      <div style={{ fontSize: 13 }}>No comments yet. Start the conversation.</div>
                    </div>
                  ) : comments.map((c) => {
                    const isOwn = c.profile_id === profile?.id;
                    const isEditing = editingCommentId === c.id;
                    const commenterName = members.find((m) => m.id === c.profile_id)?.full_name || "Unknown";
                    const initials = commenterName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                    const ts = new Date(c.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
                    const edited = c.updated_at && c.updated_at !== c.created_at;
                    return (
                      <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        {/* Avatar */}
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1d4ed8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{commenterName}</span>
                            <span style={{ fontSize: 11, color: "#aaa" }}>{ts}{edited ? " · edited" : ""}</span>
                          </div>
                          {isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                rows={3}
                                style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                                autoFocus
                              />
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => saveEditComment(c.id)} style={{ fontSize: 12, padding: "4px 12px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Save</button>
                                <button onClick={() => { setEditingCommentId(null); setEditingCommentText(""); }} style={{ fontSize: 12, padding: "4px 12px", background: "#f0f0ef", color: "#555", border: "none", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f9f9f9", borderRadius: 8, padding: "8px 12px" }}>
                              {c.content}
                            </div>
                          )}
                          {isOwn && !isEditing && (
                            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                              <button onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }} style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                              <button onClick={() => deleteComment(c.id)} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Comment input */}
                <div style={{ padding: "12px 20px", borderTop: "1px solid #ebebeb", display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1d4ed8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {(profile?.full_name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment(); }}
                      placeholder="Add a comment… (⌘+Enter to send)"
                      rows={2}
                      style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 7, border: "1px solid #d1d5db", resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                    <button
                      onClick={submitComment}
                      disabled={!commentText.trim() || commentSubmitting}
                      style={{ alignSelf: "flex-end", fontSize: 12, padding: "5px 14px", background: commentText.trim() ? "#1d4ed8" : "#e5e7eb", color: commentText.trim() ? "#fff" : "#aaa", border: "none", borderRadius: 6, cursor: commentText.trim() ? "pointer" : "default", transition: "background 0.15s" }}
                    >
                      {commentSubmitting ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {drawerTab === "checklist" && (
              <div
                style={{ padding: "16px 20px", flex: 1, overflowY: "auto" }}
                onClick={(e) => {
                  if (!e.target.closest("[data-item-menu]")) setItemMenuOpen(null);
                  if (!e.target.closest("[data-cl-menu]")) setClMenuOpen(null);
                }}
              >
                {checklistsLoading ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#aaa",
                      textAlign: "center",
                      padding: 16,
                    }}
                  >
                    Loading checklists...
                  </div>
                ) : (
                  <>
                    {/* Render each checklist */}
                    {checklists.map((cl) => {
                      const { total, done, pct } = checklistProgress(cl);
                      return (
                        <div key={cl.id} style={{ marginBottom: 20 }}>
                          {/* Checklist header */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontSize: 14 }}>☑</span>
                            {editingChecklistName === cl.id ? (
                              <input
                                autoFocus
                                value={editingChecklistNameVal}
                                onChange={(e) =>
                                  setEditingChecklistNameVal(e.target.value)
                                }
                                onBlur={() =>
                                  renameChecklist(
                                    cl.id,
                                    editingChecklistNameVal || cl.name,
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    renameChecklist(
                                      cl.id,
                                      editingChecklistNameVal || cl.name,
                                    );
                                  if (e.key === "Escape")
                                    setEditingChecklistName(null);
                                }}
                                style={{
                                  flex: 1,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  border: "1px solid #1d4ed8",
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#1a1a1a",
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  setEditingChecklistName(cl.id);
                                  setEditingChecklistNameVal(cl.name);
                                }}
                                title="Click to rename"
                              >
                                {cl.name}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 11,
                                color: "#aaa",
                                flexShrink: 0,
                              }}
                            >
                              {done}/{total}
                            </span>
                            {/* Checklist ··· menu */}
                            <div
                              data-cl-menu
                              style={{ position: "relative", flexShrink: 0 }}
                            >
                              <button
                                onClick={(e) => {
                                  if (clMenuOpen === cl.id) {
                                    setClMenuOpen(null);
                                  } else {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setClMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                                    setClMenuOpen(cl.id);
                                  }
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: 16,
                                  color: "#bbb",
                                  padding: "0 2px",
                                  lineHeight: 1,
                                  width: "auto",
                                }}
                                title="Checklist options"
                              >
                                ···
                              </button>
                              {clMenuOpen === cl.id && (
                                <div
                                  style={{
                                    position: "fixed",
                                    top: clMenuPos.top,
                                    right: clMenuPos.right,
                                    background: "#fff",
                                    border: "1px solid #e8e8e8",
                                    borderRadius: 8,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                    zIndex: 9999,
                                    minWidth: 190,
                                    padding: "4px 0",
                                  }}
                                >
                                  {[
                                    {
                                      icon: (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                      ),
                                      label: "Add Item",
                                      action: () => {
                                        setClMenuOpen(null);
                                        setTimeout(() => {
                                          document.getElementById(`add-item-input-${cl.id}`)?.focus();
                                        }, 50);
                                      },
                                    },
                                    {
                                      icon: (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      ),
                                      label: "Rename checklist",
                                      action: () => {
                                        setEditingChecklistName(cl.id);
                                        setEditingChecklistNameVal(cl.name);
                                        setClMenuOpen(null);
                                      },
                                    },
                                    { divider: true },
                                    {
                                      icon: (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      ),
                                      label: "Check All",
                                      action: () => {
                                        checkAllItems(cl.id, true);
                                        setClMenuOpen(null);
                                      },
                                    },
                                    {
                                      icon: (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                      ),
                                      label: "Uncheck All",
                                      action: () => {
                                        checkAllItems(cl.id, false);
                                        setClMenuOpen(null);
                                      },
                                    },
                                    { divider: true },
                                    {
                                      icon: (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                      ),
                                      label: "Delete checklist",
                                      danger: true,
                                      action: () => {
                                        setClMenuOpen(null);
                                        deleteChecklist(cl.id);
                                      },
                                    },
                                  ].map((opt, idx) =>
                                    opt.divider ? (
                                      <div
                                        key={idx}
                                        style={{ borderTop: "1px solid #f0f0f0", margin: "3px 0" }}
                                      />
                                    ) : (
                                      <button
                                        key={opt.label}
                                        onClick={opt.action}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 9,
                                          width: "100%",
                                          background: "none",
                                          border: "none",
                                          padding: "7px 12px",
                                          fontSize: 13,
                                          color: opt.danger ? "#dc2626" : "#374151",
                                          cursor: "pointer",
                                          textAlign: "left",
                                          lineHeight: 1.4,
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background = opt.danger ? "#fee2e2" : "#f3f4f6")
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background = "none")
                                        }
                                      >
                                        <span style={{ display: "flex", flexShrink: 0, color: opt.danger ? "#dc2626" : "#6b7280" }}>
                                          {opt.icon}
                                        </span>
                                        {opt.label}
                                      </button>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          {total > 0 && (
                            <div
                              style={{
                                height: 4,
                                background: "#f0f0f0",
                                borderRadius: 4,
                                marginBottom: 8,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  background:
                                    pct === 100 ? "#16a34a" : "#1d4ed8",
                                  borderRadius: 4,
                                  transition: "width 0.3s",
                                }}
                              />
                            </div>
                          )}

                          {/* Items */}
                          {cl.items.map((item) => (
                            <div
                              key={item.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 0",
                                borderBottom: "1px solid #f5f5f5",
                                position: "relative",
                              }}
                              onMouseLeave={() => {
                                if (itemMenuOpen === item.id) setItemMenuOpen(null);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={item.is_checked}
                                onChange={() => toggleChecklistItem(item)}
                                style={{
                                  marginTop: 0,
                                  cursor: "pointer",
                                  accentColor: "#1d4ed8",
                                  flexShrink: 0,
                                  width: "auto",
                                }}
                              />
                              {editingItemId === item.id ? (
                                <input
                                  autoFocus
                                  value={editingItemVal}
                                  onChange={(e) => setEditingItemVal(e.target.value)}
                                  onBlur={() => renameChecklistItem(item, editingItemVal)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") renameChecklistItem(item, editingItemVal);
                                    if (e.key === "Escape") setEditingItemId(null);
                                  }}
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    border: "1px solid #1d4ed8",
                                    borderRadius: 5,
                                    padding: "2px 6px",
                                    outline: "none",
                                    width: "auto",
                                  }}
                                />
                              ) : (
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    color: item.is_checked ? "#aaa" : "#333",
                                    textDecoration: item.is_checked ? "line-through" : "none",
                                  }}
                                >
                                  {item.title}
                                </span>
                              )}
                              {/* ··· menu button */}
                              <div data-item-menu style={{ flexShrink: 0 }}>
                                <button
                                  onClick={(e) => {
                                    if (itemMenuOpen === item.id) {
                                      setItemMenuOpen(null);
                                    } else {
                                      const r = e.currentTarget.getBoundingClientRect();
                                      setItemMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                                      setItemMenuOpen(item.id);
                                    }
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 14,
                                    color: "#bbb",
                                    padding: "0 2px",
                                    lineHeight: 1,
                                    width: "auto",
                                  }}
                                  title="Item options"
                                >
                                  ···
                                </button>
                                {itemMenuOpen === item.id && (
                                  <div
                                    style={{
                                      position: "fixed",
                                      top: itemMenuPos.top,
                                      right: itemMenuPos.right,
                                      background: "#fff",
                                      border: "1px solid #e8e8e8",
                                      borderRadius: 8,
                                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                      zIndex: 9999,
                                      minWidth: 150,
                                      padding: "4px 0",
                                    }}
                                  >
                                    {[
                                      {
                                        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
                                        label: "Rename",
                                        action: () => {
                                          setEditingItemId(item.id);
                                          setEditingItemVal(item.title);
                                          setItemMenuOpen(null);
                                        },
                                      },
                                      {
                                        icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
                                        label: "Delete",
                                        action: () => {
                                          deleteChecklistItem(item);
                                          setItemMenuOpen(null);
                                        },
                                        danger: true,
                                      },
                                    ].map((opt) => (
                                      <button
                                        key={opt.label}
                                        onClick={opt.action}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 9,
                                          width: "100%",
                                          background: "none",
                                          border: "none",
                                          padding: "7px 12px",
                                          fontSize: 13,
                                          color: opt.danger ? "#dc2626" : "#374151",
                                          cursor: "pointer",
                                          textAlign: "left",
                                          lineHeight: 1.4,
                                        }}
                                        onMouseEnter={(e) =>
                                          (e.currentTarget.style.background = opt.danger ? "#fee2e2" : "#f3f4f6")
                                        }
                                        onMouseLeave={(e) =>
                                          (e.currentTarget.style.background = "none")
                                        }
                                      >
                                        <span style={{ display: "flex", flexShrink: 0, color: opt.danger ? "#dc2626" : "#6b7280" }}>
                                          {opt.icon}
                                        </span>
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Add item input */}
                          <div
                            style={{ display: "flex", gap: 6, marginTop: 8 }}
                          >
                            <input
                              id={`add-item-input-${cl.id}`}
                              placeholder="Add an item..."
                              value={newItemText[cl.id] || ""}
                              onChange={(e) =>
                                setNewItemText((p) => ({
                                  ...p,
                                  [cl.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  addChecklistItem(cl.id, drawerTask.id);
                              }}
                              style={{
                                flex: 1,
                                fontSize: 12,
                                padding: "6px 10px",
                                border: "1px solid #e0e0e0",
                                borderRadius: 7,
                                outline: "none",
                              }}
                              onFocus={(e) =>
                                (e.target.style.borderColor = "#1d4ed8")
                              }
                              onBlur={(e) =>
                                (e.target.style.borderColor = "#e0e0e0")
                              }
                            />
                            <button
                              onClick={() =>
                                addChecklistItem(cl.id, drawerTask.id)
                              }
                              disabled={!(newItemText[cl.id] || "").trim()}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 7,
                                border: "none",
                                background: "#1d4ed8",
                                color: "#fff",
                                fontSize: 12,
                                cursor: "pointer",
                                fontWeight: 500,
                                opacity: (newItemText[cl.id] || "").trim()
                                  ? 1
                                  : 0.4,
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add new checklist */}
                    {addingChecklist ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <input
                          autoFocus
                          placeholder="Checklist name..."
                          value={newChecklistName}
                          onChange={(e) => setNewChecklistName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addChecklist(drawerTask.id);
                            if (e.key === "Escape") setAddingChecklist(false);
                          }}
                          style={{
                            flex: 1,
                            fontSize: 12,
                            padding: "6px 10px",
                            border: "1px solid #1d4ed8",
                            borderRadius: 7,
                            outline: "none",
                          }}
                        />
                        <button
                          onClick={() => addChecklist(drawerTask.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 7,
                            border: "none",
                            background: "#1d4ed8",
                            color: "#fff",
                            fontSize: 12,
                            cursor: "pointer",
                            fontWeight: 500,
                          }}
                        >
                          Create
                        </button>
                        <button
                          onClick={() => setAddingChecklist(false)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 7,
                            border: "1px solid #e0e0e0",
                            background: "#fff",
                            fontSize: 12,
                            cursor: "pointer",
                            color: "#888",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingChecklist(true)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px dashed #d0d0d0",
                          background: "#fafaf9",
                          color: "#888",
                          fontSize: 12,
                          cursor: "pointer",
                          width: "100%",
                          fontWeight: 500,
                          marginTop: checklists.length > 0 ? 8 : 0,
                        }}
                      >
                        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                        Add checklist
                      </button>
                    )}
                  </>
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

      {/* EXPORT CSV MODAL */}
      {showExportModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowExportModal(false)}
          style={{ zIndex: 1000 }}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400, padding: 28 }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Export CSV</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
              Choose what to include in the export:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ width: "100%", padding: "10px 16px", fontSize: 14, textAlign: "left" }}
                onClick={() => { exportTasksToCSV(true); setShowExportModal(false); }}
              >
                <div style={{ fontWeight: 600 }}>Current view only</div>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 400, marginTop: 2 }}>
                  Exports only the columns you have selected and in the order you've arranged them
                </div>
              </button>
              <button
                className="btn btn-sm"
                style={{ width: "100%", padding: "10px 16px", fontSize: 14, textAlign: "left", border: "1px solid #e0e0e0" }}
                onClick={() => { exportTasksToCSV(false); setShowExportModal(false); }}
              >
                <div style={{ fontWeight: 600 }}>All columns</div>
                <div style={{ fontSize: 12, color: "#888", fontWeight: 400, marginTop: 2 }}>
                  Exports every column regardless of current view settings
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              style={{ marginTop: 16, background: "none", border: "none", color: "#999", fontSize: 13, cursor: "pointer", width: "100%", textAlign: "center" }}
            >
              Cancel
            </button>
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
              {activeList ? (
                <><span>List: </span><strong>{activeList.name}</strong></>
              ) : activeFolder ? (
                <><span>Folder: </span><strong>{activeFolder.name}</strong></>
              ) : (
                <><span>Space: </span><strong>{activeSpace?.name}</strong></>
              )}
            </div>
            {(() => {
              // Scope-aware field list for the modal:
              // List view  → only list-scoped fields
              // Folder view → folder-scoped + list-scoped fields in that folder
              // Space view → all fields
              const allSpaceFields = activeSpace?.space_fields || [];
              let modalFields;
              if (activeList) {
                modalFields = allSpaceFields.filter((f) => f.list_id === activeList.id);
              } else if (activeFolder) {
                const folderListIds = new Set(
                  (activeSpace?.folders?.find((fo) => fo.id === activeFolder.id)
                    ?.lists || []).map((l) => l.id)
                );
                modalFields = allSpaceFields.filter(
                  (f) => f.folder_id === activeFolder.id ||
                    (f.list_id && folderListIds.has(f.list_id))
                );
              } else {
                modalFields = [...allSpaceFields];
              }
              modalFields = modalFields
                .filter((f) => !locallyDeletedFieldIds.includes(f.id))
                .sort((a, b) => a.field_order - b.field_order);
              return modalFields.length > 0 && (
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
                {modalFields.map((f) => (
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
                              ƒ {describeFormula(f)}
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
            );
            })()}
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
                        key: "days_since_date_field",
                        label: "Days since a date field",
                        hint: "TODAY() − a custom date field you specify — equivalent to ClickUp's TODAY()-field(\"...\")",
                        example: "e.g. days since Signing Date, Contract Date, etc.",
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
                    "days_since_date_field" && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        background: "#f0f9ff",
                        borderRadius: 8,
                        border: "1px solid #bae6fd",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#0369a1",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: ".04em",
                        }}
                      >
                        Date field name
                      </div>
                      <input
                        placeholder="e.g. Signing Date, Contract Date"
                        value={newField.date_field_name || ""}
                        onChange={(e) =>
                          setNewField((p) => ({ ...p, date_field_name: e.target.value }))
                        }
                        style={{ fontSize: 12 }}
                      />
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
                        Must match the name of an existing date custom field on this task.
                        Equivalent to ClickUp's{" "}
                        <code style={{ background: "#e0f2fe", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>
                          TODAY()-field("{newField.date_field_name || "..."}")
                        </code>
                      </div>
                    </div>
                  )}
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
              {activeList ? (
                <>
                  <span>List: </span>
                  <strong>{activeList.name}</strong>
                </>
              ) : activeFolder ? (
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
              {activeList && listStatuses.length === 0
                ? `Inherited from ${activeFolder ? "folder" : "space"} (${modalSpaceStatuses.length})`
                : activeFolder && !(activeFolder.space_statuses?.filter(s => !s.list_id).length > 0)
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
                      background: "#f5f5f4",
                      borderRadius: 6,
                      marginBottom: 6,
                      border: "1px solid #e8e8e8",
                      overflow: "hidden",
                    }}
                  >
                    {editingStatusId === s.id ? (
                      <div style={{ padding: "10px 10px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <input
                            type="color"
                            value={editingStatusData.color}
                            onChange={(e) => setEditingStatusData((p) => ({ ...p, color: e.target.value }))}
                            style={{ width: 32, height: 32, padding: 2, cursor: "pointer", flexShrink: 0 }}
                          />
                          <input
                            autoFocus
                            value={editingStatusData.name}
                            onChange={(e) => setEditingStatusData((p) => ({ ...p, name: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEditStatus(); if (e.key === "Escape") setEditingStatusId(null); }}
                            style={{ flex: 1, fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4 }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setEditingStatusId(null)} disabled={statusLoading}>Cancel</button>
                          <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={saveEditStatus} disabled={statusLoading || !editingStatusData.name.trim()}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            style={{ padding: "2px 10px", fontSize: 11 }}
                            onClick={() => { setEditingStatusId(s.id); setEditingStatusData({ name: s.name, color: s.color || "#378ADD" }); setStatusActionMsg(""); }}
                            disabled={statusLoading}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            style={{ padding: "2px 10px", fontSize: 11 }}
                            onClick={() => deleteCustomStatus(s.id, s.name)}
                            disabled={statusLoading}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
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
