import { useState } from "react";
import { supabase } from "../supabase";

const SPACE_COLORS = [
  "#378ADD",
  "#1D9E75",
  "#7F77DD",
  "#D85A30",
  "#E04F8A",
  "#F59E0B",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#374151",
  "#9333EA",
];

const SPACE_ICONS = [
  "💼",
  "📊",
  "🚀",
  "⚡",
  "🎯",
  "📋",
  "🔥",
  "💡",
  "🌟",
  "📈",
  "🏆",
  "🗂️",
  "📌",
  "🧩",
  "🏢",
  "🎨",
  "🔧",
  "💻",
  "📝",
  "🌍",
  "🎪",
  "🏗️",
  "📦",
  "🔑",
  "💎",
  "🎓",
  "🏦",
  "⚙️",
  "🛡️",
  "🌿",
];

const STATUS_COLORS = [
  "#888780",
  "#7c3aed",
  "#d97706",
  "#16a34a",
  "#f59e0b",
  "#e11d48",
  "#0891b2",
  "#dc2626",
  "#9333ea",
  "#059669",
  "#1d4ed8",
  "#ea580c",
  "#475569",
  "#be185d",
  "#15803d",
];

const BASE_TEMPLATES = [
  {
    key: "business",
    label: "Business Services",
    desc: "Client work & compliance",
    icon: "💼",
    statuses: [
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "In Review", color: "#d97706" },
      { name: "Done", color: "#16a34a" },
      { name: "Client Cancelled", color: "#f59e0b" },
    ],
  },
  {
    key: "starter",
    label: "Starter",
    desc: "For everyday tasks",
    icon: "🚀",
    statuses: [
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "Done", color: "#16a34a" },
    ],
  },
  {
    key: "project",
    label: "Project Management",
    desc: "Plan, manage, execute",
    icon: "📊",
    statuses: [
      { name: "Backlog", color: "#e0e0e0" },
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "In Review", color: "#d97706" },
      { name: "Done", color: "#16a34a" },
    ],
  },
  {
    key: "custom",
    label: "Custom",
    desc: "Start from scratch",
    icon: "🧩",
    statuses: [],
  },
];

export default function Sidebar({
  spaces,
  activeSpace,
  activeFolder,
  view,
  onNavigate,
  onSpaceSelect,
  onFolderSelect,
  onSpaceCreated,
  profile,
  onLogout,
  taskCounts = {},
  width = 240,
}) {
  // ── Space modal state ──
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceStep, setSpaceStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState("business");
  const [newSpace, setNewSpace] = useState({
    name: "",
    color: "#378ADD",
    icon: "💼",
    description: "",
  });
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editableStatuses, setEditableStatuses] = useState([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#378ADD");
  const [editingStatusIdx, setEditingStatusIdx] = useState(null);
  const [editingStatusName, setEditingStatusName] = useState("");
  const [showColorPickerFor, setShowColorPickerFor] = useState(null);

  // ── Folder modal state ──
  const [showAddFolderModal, setShowAddFolderModal] = useState(null); // spaceId
  const [folderModalSpace, setFolderModalSpace] = useState(null); // full space object
  const [newFolder, setNewFolder] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [folderUseSpaceStatuses, setFolderUseSpaceStatuses] = useState(true);
  // Custom statuses for folder
  const [folderCustomStatuses, setFolderCustomStatuses] = useState([]);
  const [folderNewStatusName, setFolderNewStatusName] = useState("");
  const [folderNewStatusColor, setFolderNewStatusColor] = useState("#378ADD");
  const [folderEditingIdx, setFolderEditingIdx] = useState(null);
  const [folderEditingName, setFolderEditingName] = useState("");
  const [folderColorPickerFor, setFolderColorPickerFor] = useState(null);
  const [folderTemplate, setFolderTemplate] = useState("business");

  const [expandedSpaces, setExpandedSpaces] = useState({});

  // ── Space helpers ──
  function closeSpaceModal() {
    setShowAddSpace(false);
    setSpaceStep(1);
    setShowIconPicker(false);
    setEditingStatusIdx(null);
    setShowColorPickerFor(null);
    setNewStatusName("");
  }

  function toggleSpace(spaceId) {
    setExpandedSpaces((prev) => ({ ...prev, [spaceId]: !prev[spaceId] }));
  }

  function selectTemplate(key) {
    setSelectedTemplate(key);
    const tmpl = BASE_TEMPLATES.find((t) => t.key === key);
    setEditableStatuses(tmpl ? tmpl.statuses.map((s) => ({ ...s })) : []);
  }

  function addStatus() {
    if (!newStatusName.trim()) return;
    if (
      editableStatuses.find(
        (s) => s.name.toLowerCase() === newStatusName.trim().toLowerCase(),
      )
    )
      return;
    setEditableStatuses((prev) => [
      ...prev,
      { name: newStatusName.trim(), color: newStatusColor },
    ]);
    setNewStatusName("");
    setNewStatusColor("#378ADD");
  }

  function deleteStatus(idx) {
    setEditableStatuses((prev) => prev.filter((_, i) => i !== idx));
  }

  function startEditStatus(idx) {
    setEditingStatusIdx(idx);
    setEditingStatusName(editableStatuses[idx].name);
  }

  function saveEditStatus(idx) {
    if (editingStatusName.trim()) {
      setEditableStatuses((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, name: editingStatusName.trim() } : s,
        ),
      );
    }
    setEditingStatusIdx(null);
  }

  function updateStatusColor(idx, color) {
    setEditableStatuses((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, color } : s)),
    );
    setShowColorPickerFor(null);
  }

  async function createSpace() {
    if (!newSpace.name.trim()) return;
    const { data, error } = await supabase
      .from("spaces")
      .insert({
        name: newSpace.name.trim(),
        color: newSpace.color,
        icon: newSpace.icon,
      })
      .select()
      .single();
    if (!error && data) {
      if (editableStatuses.length > 0) {
        await supabase.from("space_statuses").insert(
          editableStatuses.map((s, i) => ({
            space_id: data.id,
            folder_id: null,
            name: s.name,
            color: s.color,
            status_order: i + 1,
          })),
        );
      }
      setNewSpace({ name: "", color: "#378ADD", icon: "💼", description: "" });
      setSpaceStep(1);
      setSelectedTemplate("business");
      setEditableStatuses([]);
      setShowAddSpace(false);
      onSpaceCreated();
    }
  }

  async function deleteSpace(spaceId, e) {
    e.stopPropagation();
    if (!confirm("Delete this space and all its data? This cannot be undone."))
      return;
    await supabase.from("spaces").delete().eq("id", spaceId);
    onSpaceCreated();
  }

  // ── Folder helpers ──
  function openFolderModal(space) {
    setFolderModalSpace(space);
    setShowAddFolderModal(space.id);
    setNewFolder("");
    setNewFolderDesc("");
    setFolderUseSpaceStatuses(true);
    setFolderTemplate("business");
    // Pre-load the space's statuses as the custom starting point
    const spaceStatuses = (space.space_statuses || [])
      .filter((s) => !s.folder_id)
      .sort((a, b) => a.status_order - b.status_order)
      .map((s) => ({ name: s.name, color: s.color }));
    setFolderCustomStatuses(
      spaceStatuses.length > 0
        ? spaceStatuses
        : BASE_TEMPLATES[0].statuses.map((s) => ({ ...s })),
    );
    setFolderNewStatusName("");
    setFolderNewStatusColor("#378ADD");
    setFolderEditingIdx(null);
    setFolderColorPickerFor(null);
  }

  function selectFolderTemplate(key) {
    setFolderTemplate(key);
    const tmpl = BASE_TEMPLATES.find((t) => t.key === key);
    setFolderCustomStatuses(tmpl ? tmpl.statuses.map((s) => ({ ...s })) : []);
  }

  function addFolderStatus() {
    if (!folderNewStatusName.trim()) return;
    if (
      folderCustomStatuses.find(
        (s) =>
          s.name.toLowerCase() === folderNewStatusName.trim().toLowerCase(),
      )
    )
      return;
    setFolderCustomStatuses((prev) => [
      ...prev,
      { name: folderNewStatusName.trim(), color: folderNewStatusColor },
    ]);
    setFolderNewStatusName("");
    setFolderNewStatusColor("#378ADD");
  }

  function deleteFolderStatus(idx) {
    setFolderCustomStatuses((prev) => prev.filter((_, i) => i !== idx));
  }

  function startEditFolderStatus(idx) {
    setFolderEditingIdx(idx);
    setFolderEditingName(folderCustomStatuses[idx].name);
  }

  function saveEditFolderStatus(idx) {
    if (folderEditingName.trim()) {
      setFolderCustomStatuses((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, name: folderEditingName.trim() } : s,
        ),
      );
    }
    setFolderEditingIdx(null);
  }

  function updateFolderStatusColor(idx, color) {
    setFolderCustomStatuses((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, color } : s)),
    );
    setFolderColorPickerFor(null);
  }

  async function createFolder() {
    if (!newFolder.trim() || !showAddFolderModal) return;
    const spaceId = showAddFolderModal;
    const { data, error } = await supabase
      .from("folders")
      .insert({ space_id: spaceId, name: newFolder.trim() })
      .select()
      .single();

    if (!error && data) {
      // Determine which statuses to seed
      let statusesToSeed;
      if (folderUseSpaceStatuses) {
        // Use the parent space's statuses
        statusesToSeed = (folderModalSpace?.space_statuses || [])
          .filter((s) => !s.folder_id)
          .sort((a, b) => a.status_order - b.status_order)
          .map((s) => ({ name: s.name, color: s.color }));
        // Fall back to defaults if space has no statuses
        if (statusesToSeed.length === 0) {
          statusesToSeed = [
            { name: "To Do", color: "#888780" },
            { name: "In Progress", color: "#7c3aed" },
            { name: "In Review", color: "#d97706" },
            { name: "Done", color: "#16a34a" },
          ];
        }
      } else {
        // Use the custom statuses the user defined
        statusesToSeed = folderCustomStatuses;
      }

      if (statusesToSeed.length > 0) {
        await supabase.from("space_statuses").insert(
          statusesToSeed.map((s, i) => ({
            space_id: spaceId,
            folder_id: data.id,
            name: s.name,
            color: s.color,
            status_order: i + 1,
          })),
        );
      }

      setNewFolder("");
      setNewFolderDesc("");
      setFolderUseSpaceStatuses(true);
      setFolderModalSpace(null);
      setShowAddFolderModal(null);
      onSpaceCreated();
    }
  }

  async function deleteFolder(folderId, e) {
    e.stopPropagation();
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folderId);
    const n = count || 0;
    if (
      !confirm(
        n > 0
          ? `Delete folder and all ${n} tasks inside? This cannot be undone.`
          : "Delete this folder?",
      )
    )
      return;
    await supabase.from("folders").delete().eq("id", folderId);
    onSpaceCreated();
  }

  const selectedTmpl =
    BASE_TEMPLATES.find((t) => t.key === selectedTemplate) || BASE_TEMPLATES[0];

  const inputStyle = {
    width: "100%",
    fontSize: 14,
    padding: "11px 14px",
    border: "1.5px solid #e0e0e0",
    borderRadius: 9,
    outline: "none",
    color: "#1a1a1a",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  // Status row renderer for both modals
  function StatusRow({
    s,
    idx,
    editingIdx,
    editingName,
    onStartEdit,
    onSaveName,
    onChangeName,
    onDelete,
    onColorClick,
    showColorPicker,
    onColorSelect,
    onCancelEdit,
  }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          borderRadius: 8,
          marginBottom: 6,
          background: "#fafaf9",
          border: "1px solid #ebebeb",
        }}
      >
        <span
          style={{
            color: "#d0d0d0",
            fontSize: 14,
            cursor: "grab",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          ⠿
        </span>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => onColorClick(idx)}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: s.color,
              border: "2px solid #fff",
              cursor: "pointer",
              boxShadow: "0 0 0 1.5px #ddd",
              outline: "none",
            }}
          />
          {showColorPicker && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                zIndex: 300,
                background: "#fff",
                borderRadius: 10,
                padding: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                border: "1px solid #e8e8e8",
                display: "grid",
                gridTemplateColumns: "repeat(5,1fr)",
                gap: 5,
                width: 152,
              }}
            >
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorSelect(idx, c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: c,
                    border: s.color === c ? "2.5px solid #1a1a1a" : "none",
                    cursor: "pointer",
                    outline: "none",
                    transition: "transform 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "scale(1.2)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "scale(1)")
                  }
                />
              ))}
            </div>
          )}
        </div>
        {editingIdx === idx ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onChangeName(e.target.value)}
            onBlur={() => onSaveName(idx)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveName(idx);
              if (e.key === "Escape") onCancelEdit();
            }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              padding: "3px 10px",
              border: "1.5px solid #1d4ed8",
              borderRadius: 20,
              outline: "none",
              background: "#fff",
            }}
          />
        ) : (
          <span
            onClick={() => onStartEdit(idx)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: s.color,
              borderRadius: 20,
              padding: "3px 12px",
              cursor: "text",
              display: "inline-block",
              flexShrink: 0,
            }}
          >
            {s.name}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onDelete(idx)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#d0d0d0",
            fontSize: 18,
            padding: "0 2px",
            lineHeight: 1,
            flexShrink: 0,
            outline: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#d0d0d0")}
        >
          ×
        </button>
      </div>
    );
  }

  function AddStatusRow({ value, color, onChangeName, onChangeColor, onAdd }) {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1.5px dashed #d8d8d8",
          background: "#fafaf9",
          marginTop: 8,
        }}
      >
        <input
          type="color"
          value={color}
          onChange={(e) => onChangeColor(e.target.value)}
          style={{
            width: 26,
            height: 26,
            padding: 2,
            cursor: "pointer",
            border: "none",
            borderRadius: "50%",
            flexShrink: 0,
            outline: "none",
          }}
        />
        <input
          placeholder="+ Add a status name..."
          value={value}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          style={{
            flex: 1,
            fontSize: 13,
            padding: "6px 10px",
            border: "1px solid #e0e0e0",
            borderRadius: 7,
            outline: "none",
            background: "#fff",
          }}
        />
        <button
          onClick={onAdd}
          disabled={!value.trim()}
          style={{
            padding: "6px 16px",
            borderRadius: 7,
            border: "none",
            background: value.trim() ? "#1d4ed8" : "#e0e0e0",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: value.trim() ? "pointer" : "not-allowed",
            flexShrink: 0,
            outline: "none",
          }}
        >
          Add
        </button>
      </div>
    );
  }

  // Get space statuses for display in folder modal
  const parentSpaceStatuses = (folderModalSpace?.space_statuses || [])
    .filter((s) => !s.folder_id)
    .sort((a, b) => a.status_order - b.status_order);

  return (
    <aside
      className="sidebar"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {/* Header */}
      <div
        style={{ padding: "16px 16px 12px", borderBottom: "1px solid #ebebeb" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
          AB Capital
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
          Internal workspace
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: "8px 0 4px" }}>
        <div className="sidebar-section">Main</div>
        {[
          { key: "dashboard", icon: "📊", label: "Dashboard" },
          { key: "wiki", icon: "📗", label: "Wiki" },
          { key: "mytasks", icon: "👤", label: "My Tasks" },
        ].map((item) => (
          <div
            key={item.key}
            className={`nav-item ${view === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Spaces */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="sidebar-section">Spaces</div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingBottom: 8,
            scrollbarWidth: "thin",
            scrollbarColor: "#e0e0de transparent",
          }}
        >
          {spaces.map((space) => {
            const isExpanded = expandedSpaces[space.id] !== false;
            const isActive = activeSpace?.id === space.id && !activeFolder;
            return (
              <div key={space.id}>
                <div
                  className={`space-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    onSpaceSelect(space);
                    toggleSpace(space.id);
                  }}
                  style={{ position: "relative" }}
                >
                  <span style={{ fontSize: 10, color: "#aaa", marginRight: 2 }}>
                    {isExpanded ? "▾" : "▸"}
                  </span>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: space.color || "#378ADD",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {space.icon || "🏢"}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                    {space.name}
                  </span>
                  {taskCounts[space.id] > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#aaa",
                        background: "#f0f0ef",
                        borderRadius: 20,
                        padding: "0 6px",
                        flexShrink: 0,
                      }}
                    >
                      {taskCounts[space.id]}
                    </span>
                  )}
                  <span
                    className="space-delete-btn"
                    onClick={(e) => deleteSpace(space.id, e)}
                    style={{
                      opacity: 0,
                      fontSize: 12,
                      color: "#aaa",
                      padding: "0 4px",
                      borderRadius: 4,
                      marginLeft: 2,
                    }}
                  >
                    ✕
                  </span>
                </div>
                {isExpanded && (
                  <div>
                    {(space.folders || []).map((folder) => (
                      <div
                        key={folder.id}
                        className={`folder-item ${activeFolder?.id === folder.id ? "active" : ""}`}
                        onClick={() => onFolderSelect(space, folder)}
                        style={{ position: "relative" }}
                      >
                        <span style={{ fontSize: 12 }}>📁</span>
                        <span style={{ flex: 1, fontSize: 12 }}>
                          {folder.name}
                        </span>
                        {taskCounts[folder.id] > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#aaa",
                              background: "#f0f0ef",
                              borderRadius: 20,
                              padding: "0 6px",
                              flexShrink: 0,
                            }}
                          >
                            {taskCounts[folder.id]}
                          </span>
                        )}
                        <span
                          className="space-delete-btn"
                          onClick={(e) => deleteFolder(folder.id, e)}
                          style={{
                            opacity: 0,
                            fontSize: 12,
                            color: "#aaa",
                            padding: "0 4px",
                            borderRadius: 4,
                          }}
                        >
                          ✕
                        </span>
                      </div>
                    ))}
                    <div
                      className="add-btn-sidebar"
                      style={{ paddingLeft: 28 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openFolderModal(space);
                      }}
                    >
                      + Add folder
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button
            className="add-btn-sidebar"
            onClick={() => {
              setSpaceStep(1);
              setSelectedTemplate("business");
              setEditableStatuses(
                BASE_TEMPLATES[0].statuses.map((s) => ({ ...s })),
              );
              setNewSpace({
                name: "",
                color: "#378ADD",
                icon: "💼",
                description: "",
              });
              setShowIconPicker(false);
              setShowAddSpace(true);
            }}
            style={{ width: "100%", marginTop: 4 }}
          >
            + Add space
          </button>
        </div>
      </div>

      {/* Profile */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid #ebebeb",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: profile?.avatar_color || "#1d4ed8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {(profile?.full_name || "U").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#1a1a1a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {profile?.full_name || "User"}
          </div>
          <div style={{ fontSize: 11, color: "#aaa" }}>
            {profile?.role || "member"}
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Logout"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#aaa",
            fontSize: 16,
            padding: 4,
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          ↩
        </button>
      </div>

      {/* ══════════════════════════════════════
          FOLDER CREATION MODAL
          ══════════════════════════════════════ */}
      {showAddFolderModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
          }}
          onClick={(e) =>
            e.target === e.currentTarget && setShowAddFolderModal(null)
          }
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "100%",
              maxWidth: folderUseSpaceStatuses ? 500 : 720,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              transition: "max-width 0.25s ease",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "22px 26px 16px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      marginBottom: 3,
                    }}
                  >
                    Create Folder
                  </div>
                  <div style={{ fontSize: 13, color: "#999" }}>
                    Use Folders to organise your tasks and workflows.
                  </div>
                </div>
                <button
                  onClick={() => setShowAddFolderModal(null)}
                  style={{
                    background: "#f5f5f4",
                    border: "none",
                    borderRadius: "50%",
                    width: 30,
                    height: 30,
                    cursor: "pointer",
                    fontSize: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#666",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body — two panel when custom statuses */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* Left / Main form */}
              <div
                style={{
                  flex: folderUseSpaceStatuses ? "1" : "0 0 320px",
                  padding: "18px 24px",
                  overflowY: "auto",
                  borderRight: folderUseSpaceStatuses
                    ? "none"
                    : "1px solid #f0f0f0",
                }}
              >
                {/* Name */}
                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#555",
                      marginBottom: 6,
                    }}
                  >
                    Name
                  </label>
                  <input
                    autoFocus
                    placeholder="e.g. Project, Client, Team"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFolder.trim()) createFolder();
                      if (e.key === "Escape") setShowAddFolderModal(null);
                    }}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#1d4ed8")}
                    onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#555",
                      marginBottom: 6,
                    }}
                  >
                    Description
                  </label>
                  <input
                    placeholder="Tell us a bit about your Folder (optional)"
                    value={newFolderDesc}
                    onChange={(e) => setNewFolderDesc(e.target.value)}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#1d4ed8")}
                    onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                  />
                </div>

                {/* Settings — statuses toggle */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#555",
                      marginBottom: 8,
                    }}
                  >
                    Settings
                  </label>
                  <div
                    onClick={() => setFolderUseSpaceStatuses((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      borderRadius: 10,
                      border:
                        "1.5px solid " +
                        (folderUseSpaceStatuses ? "#1d4ed8" : "#e0e0e0"),
                      background: folderUseSpaceStatuses
                        ? "#f0f7ff"
                        : "#fafaf9",
                      cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "#fff",
                        border: "1px solid #e8e8e8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      ◎
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#1a1a1a",
                        }}
                      >
                        Statuses
                      </div>
                      <div
                        style={{ fontSize: 12, color: "#888", marginTop: 2 }}
                      >
                        {folderUseSpaceStatuses ? (
                          <>
                            Inherit from space:&nbsp;
                            {parentSpaceStatuses.length > 0
                              ? parentSpaceStatuses
                                  .map((s) => s.name)
                                  .join(", ")
                              : "To Do, In Progress, In Review, Done"}
                          </>
                        ) : (
                          "Custom statuses — define below →"
                        )}
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div
                      style={{
                        width: 40,
                        height: 22,
                        borderRadius: 20,
                        background: folderUseSpaceStatuses ? "#1d4ed8" : "#ddd",
                        position: "relative",
                        flexShrink: 0,
                        transition: "background 0.2s",
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          position: "absolute",
                          top: 3,
                          left: folderUseSpaceStatuses ? 21 : 3,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right — custom status editor (only when toggle is OFF) */}
              {!folderUseSpaceStatuses && (
                <div
                  style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}
                >
                  {/* Template picker */}
                  <div style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#555",
                        marginBottom: 8,
                      }}
                    >
                      Start from template
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 6,
                      }}
                    >
                      {BASE_TEMPLATES.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => selectFolderTemplate(t.key)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            textAlign: "left",
                            border: "none",
                            background:
                              folderTemplate === t.key ? "#fff" : "transparent",
                            boxShadow:
                              folderTemplate === t.key
                                ? "0 1px 4px rgba(0,0,0,0.1)"
                                : "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            outline: "none",
                            transition: "all 0.12s",
                          }}
                        >
                          <span style={{ fontSize: 14 }}>{t.icon}</span>
                          <div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight:
                                  folderTemplate === t.key ? 600 : 400,
                                color:
                                  folderTemplate === t.key ? "#1a1a1a" : "#555",
                              }}
                            >
                              {t.label}
                            </div>
                            <div style={{ fontSize: 10, color: "#aaa" }}>
                              {t.desc}
                            </div>
                          </div>
                          {folderTemplate === t.key && (
                            <span
                              style={{
                                marginLeft: "auto",
                                color: "#1d4ed8",
                                fontSize: 12,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1a1a1a",
                        }}
                      >
                        Edit statuses
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 20,
                          padding: "2px 10px",
                          fontWeight: 600,
                        }}
                      >
                        {folderCustomStatuses.length} statuses
                      </span>
                    </div>

                    {folderCustomStatuses.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "16px 0",
                          color: "#ccc",
                          fontSize: 13,
                        }}
                      >
                        No statuses yet — add one below
                      </div>
                    )}

                    {folderCustomStatuses.map((s, idx) => (
                      <StatusRow
                        key={idx}
                        s={s}
                        idx={idx}
                        editingIdx={folderEditingIdx}
                        editingName={folderEditingName}
                        onStartEdit={startEditFolderStatus}
                        onSaveName={saveEditFolderStatus}
                        onChangeName={setFolderEditingName}
                        onCancelEdit={() => setFolderEditingIdx(null)}
                        onDelete={deleteFolderStatus}
                        onColorClick={(i) =>
                          setFolderColorPickerFor(
                            folderColorPickerFor === i ? null : i,
                          )
                        }
                        showColorPicker={folderColorPickerFor === idx}
                        onColorSelect={updateFolderStatusColor}
                      />
                    ))}

                    <AddStatusRow
                      value={folderNewStatusName}
                      color={folderNewStatusColor}
                      onChangeName={setFolderNewStatusName}
                      onChangeColor={setFolderNewStatusColor}
                      onAdd={addFolderStatus}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 24px 18px",
                borderTop: "1px solid #f0f0f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#fafaf9",
              }}
            >
              <button
                onClick={() => setShowAddFolderModal(null)}
                style={{
                  fontSize: 13,
                  color: "#888",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                disabled={!newFolder.trim()}
                onClick={createFolder}
                style={{
                  padding: "10px 32px",
                  borderRadius: 8,
                  border: "none",
                  background: newFolder.trim() ? "#1a1a1a" : "#e0e0e0",
                  color: newFolder.trim() ? "#fff" : "#aaa",
                  fontSize: 13,
                  cursor: newFolder.trim() ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SPACE CREATION MODAL
          ══════════════════════════════════════ */}
      {showAddSpace && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && closeSpaceModal()}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: spaceStep === 2 ? 700 : 560,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
              transition: "max-width 0.25s ease",
            }}
          >
            {/* Step 1 */}
            {spaceStep === 1 && (
              <>
                <div
                  style={{
                    padding: "26px 28px 18px",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 19,
                          fontWeight: 700,
                          color: "#1a1a1a",
                          marginBottom: 4,
                        }}
                      >
                        Create a Space
                      </div>
                      <div
                        style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}
                      >
                        A Space represents a team, department, or group with its
                        own folders and workflows.
                      </div>
                    </div>
                    <button
                      onClick={closeSpaceModal}
                      style={{
                        background: "#f5f5f4",
                        border: "none",
                        borderRadius: "50%",
                        width: 32,
                        height: 32,
                        cursor: "pointer",
                        fontSize: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#666",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div
                  style={{ padding: "22px 28px", flex: 1, overflowY: "auto" }}
                >
                  {/* Icon + Name */}
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Icon & name
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <button
                        onClick={() => setShowIconPicker((v) => !v)}
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 12,
                          background: newSpace.color,
                          border: showIconPicker ? "2px solid #1d4ed8" : "none",
                          fontSize: 24,
                          cursor: "pointer",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                          position: "relative",
                          outline: "none",
                        }}
                      >
                        {newSpace.icon}
                        <span
                          style={{
                            position: "absolute",
                            bottom: -4,
                            right: -4,
                            background: "#fff",
                            borderRadius: "50%",
                            width: 18,
                            height: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9,
                            border: "1px solid #e0e0e0",
                            color: "#555",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                          }}
                        >
                          ✎
                        </span>
                      </button>
                      <input
                        autoFocus
                        placeholder="e.g. Accounting, Visa Team, Growth"
                        value={newSpace.name}
                        onChange={(e) =>
                          setNewSpace((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setShowIconPicker(false);
                          if (e.key === "Enter" && newSpace.name.trim())
                            setSpaceStep(2);
                        }}
                        onClick={() => setShowIconPicker(false)}
                        style={{
                          flex: 1,
                          fontSize: 15,
                          padding: "14px 16px",
                          border: "1.5px solid #e0e0e0",
                          borderRadius: 10,
                          outline: "none",
                          fontWeight: 500,
                          color: "#1a1a1a",
                          marginTop: 2,
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#1d4ed8";
                          setShowIconPicker(false);
                        }}
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                      />
                    </div>
                    {showIconPicker && (
                      <div
                        style={{
                          marginTop: 12,
                          background: "#f9f9f9",
                          borderRadius: 12,
                          padding: "14px 14px 10px",
                          border: "1px solid #e8e8e8",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#999",
                            marginBottom: 10,
                            textTransform: "uppercase",
                            letterSpacing: ".06em",
                          }}
                        >
                          Choose icon
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(10, 1fr)",
                            gap: 4,
                          }}
                        >
                          {SPACE_ICONS.map((icon) => (
                            <button
                              key={icon}
                              onClick={() => {
                                setNewSpace((prev) => ({ ...prev, icon }));
                                setShowIconPicker(false);
                              }}
                              style={{
                                width: "100%",
                                aspectRatio: "1",
                                fontSize: 20,
                                cursor: "pointer",
                                border: "none",
                                borderRadius: 8,
                                padding: 0,
                                background:
                                  newSpace.icon === icon
                                    ? newSpace.color + "28"
                                    : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                outline:
                                  newSpace.icon === icon
                                    ? `2px solid ${newSpace.color}`
                                    : "none",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={(e) => {
                                if (newSpace.icon !== icon)
                                  e.currentTarget.style.background = "#efefef";
                              }}
                              onMouseLeave={(e) => {
                                if (newSpace.icon !== icon)
                                  e.currentTarget.style.background =
                                    "transparent";
                              }}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Color */}
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Color
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {SPACE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() =>
                            setNewSpace((prev) => ({ ...prev, color }))
                          }
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: color,
                            border:
                              newSpace.color === color
                                ? "2.5px solid #1a1a1a"
                                : "2px solid transparent",
                            cursor: "pointer",
                            outline: "none",
                            transition: "all 0.12s",
                            boxShadow:
                              newSpace.color === color
                                ? `0 0 0 3px #fff, 0 0 0 5px ${color}66`
                                : "none",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Description{" "}
                      <span
                        style={{
                          color: "#ccc",
                          fontWeight: 400,
                          textTransform: "none",
                        }}
                      >
                        (optional)
                      </span>
                    </label>
                    <textarea
                      placeholder="What is this space for?"
                      value={newSpace.description}
                      onChange={(e) =>
                        setNewSpace((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      onClick={() => setShowIconPicker(false)}
                      style={{
                        width: "100%",
                        fontSize: 13,
                        padding: "12px 14px",
                        border: "1.5px solid #e0e0e0",
                        borderRadius: 10,
                        resize: "none",
                        minHeight: 72,
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        color: "#333",
                        lineHeight: 1.6,
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#1d4ed8";
                        setShowIconPicker(false);
                      }}
                      onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 28px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    background: "#fafaf9",
                    borderRadius: "0 0 16px 16px",
                  }}
                >
                  <button
                    onClick={closeSpaceModal}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                      color: "#555",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setSpaceStep(2)}
                    disabled={!newSpace.name.trim()}
                    style={{
                      padding: "10px 28px",
                      borderRadius: 8,
                      border: "none",
                      background: newSpace.name.trim() ? "#1a1a1a" : "#e0e0e0",
                      color: newSpace.name.trim() ? "#fff" : "#aaa",
                      fontSize: 13,
                      cursor: newSpace.name.trim() ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* Step 2 */}
            {spaceStep === 2 && (
              <>
                <div
                  style={{
                    padding: "20px 28px 16px",
                    borderBottom: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <button
                      onClick={() => setSpaceStep(1)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#888",
                        fontSize: 18,
                        padding: "4px 6px",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 6,
                      }}
                    >
                      ←
                    </button>
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#1a1a1a",
                        }}
                      >
                        Define your workflow
                      </div>
                      <div
                        style={{ fontSize: 12, color: "#999", marginTop: 1 }}
                      >
                        Choose a template then customise statuses as needed
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={closeSpaceModal}
                    style={{
                      background: "#f5f5f4",
                      border: "none",
                      borderRadius: "50%",
                      width: 32,
                      height: 32,
                      cursor: "pointer",
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#666",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                  {/* Left */}
                  <div
                    style={{
                      width: 220,
                      flexShrink: 0,
                      borderRight: "1px solid #f0f0f0",
                      padding: "16px 10px",
                      overflowY: "auto",
                      background: "#fafaf9",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                        marginBottom: 10,
                        paddingLeft: 8,
                      }}
                    >
                      Status template
                    </div>
                    {BASE_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => selectTemplate(t.key)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 8,
                          textAlign: "left",
                          border: "none",
                          marginBottom: 3,
                          background:
                            selectedTemplate === t.key ? "#fff" : "transparent",
                          boxShadow:
                            selectedTemplate === t.key
                              ? "0 1px 4px rgba(0,0,0,0.1)"
                              : "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.12s",
                          outline: "none",
                        }}
                      >
                        <span style={{ fontSize: 16, flexShrink: 0 }}>
                          {t.icon}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight:
                                selectedTemplate === t.key ? 600 : 400,
                              color:
                                selectedTemplate === t.key ? "#1a1a1a" : "#555",
                            }}
                          >
                            {t.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#aaa",
                              marginTop: 1,
                            }}
                          >
                            {t.desc}
                          </div>
                        </div>
                        {selectedTemplate === t.key && (
                          <span
                            style={{
                              color: "#1d4ed8",
                              fontSize: 14,
                              flexShrink: 0,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Right */}
                  <div
                    style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 16,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#1a1a1a",
                          }}
                        >
                          Edit statuses
                        </div>
                        <div
                          style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}
                        >
                          For{" "}
                          <strong style={{ color: "#555" }}>
                            {selectedTmpl.label}
                          </strong>{" "}
                          — click a status to rename
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 20,
                          padding: "2px 10px",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {editableStatuses.length} statuses
                      </span>
                    </div>

                    {editableStatuses.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "24px 0",
                          color: "#ccc",
                          fontSize: 13,
                        }}
                      >
                        No statuses yet — add one below
                      </div>
                    )}

                    {editableStatuses.map((s, idx) => (
                      <StatusRow
                        key={idx}
                        s={s}
                        idx={idx}
                        editingIdx={editingStatusIdx}
                        editingName={editingStatusName}
                        onStartEdit={startEditStatus}
                        onSaveName={saveEditStatus}
                        onChangeName={setEditingStatusName}
                        onCancelEdit={() => setEditingStatusIdx(null)}
                        onDelete={deleteStatus}
                        onColorClick={(i) =>
                          setShowColorPickerFor(
                            showColorPickerFor === i ? null : i,
                          )
                        }
                        showColorPicker={showColorPickerFor === idx}
                        onColorSelect={updateStatusColor}
                      />
                    ))}

                    <AddStatusRow
                      value={newStatusName}
                      color={newStatusColor}
                      onChangeName={setNewStatusName}
                      onChangeColor={setNewStatusColor}
                      onAdd={addStatus}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px 28px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fafaf9",
                    borderRadius: "0 0 16px 16px",
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 5, alignItems: "center" }}
                  >
                    {[1, 2].map((n) => (
                      <div
                        key={n}
                        style={{
                          width: n === spaceStep ? 18 : 8,
                          height: 8,
                          borderRadius: 4,
                          background: spaceStep === n ? "#1a1a1a" : "#ddd",
                          transition: "all 0.2s",
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={createSpace}
                    style={{
                      padding: "10px 28px",
                      borderRadius: 8,
                      border: "none",
                      background: "#1a1a1a",
                      color: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 600,
                      boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
                      outline: "none",
                    }}
                  >
                    Create Space ✓
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
